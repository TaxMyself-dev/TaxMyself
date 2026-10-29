import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { firstValueFrom, timeout } from 'rxjs';
import { UniformFileRemoteStatus } from '../entities/shaam.enums';
import { REQUEST_TIMEOUT_MS } from '../shaam.constants';
import {
  UNIFORM_FILE_API_CONFIG,
  UniformFileApiConfig,
} from './uniform-file-api.config';

const MIB = 1024 * 1024;
const MAX_FILE_NAME_LENGTH = 255;
const MAX_FILE_ID_LENGTH = 255;

export type UniformFileKind = 'ini' | 'bkm';
export type UniformFileClientStage =
  | 'reserve_links'
  | 'initiate_upload'
  | 'upload_bytes'
  | 'poll_status';

export class UniformFileClientError extends Error {
  constructor(
    message: string,
    readonly stage: UniformFileClientStage,
    readonly category:
      | 'validation'
      | 'authorization'
      | 'permission'
      | 'timeout'
      | 'network'
      | 'provider',
    readonly ambiguous: boolean,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
  }
}

export interface UniformFileUploadReservation {
  kind: UniformFileKind;
  fileName: string;
  fileUniqueId: string;
  signUrl: string;
  headers: {
    'x-goog-content-length-range': string;
    'x-goog-resumable': 'start';
  };
  maxByteLength: number;
}

export interface UniformFileReservedPair {
  uniqueId: string;
  ini: UniformFileUploadReservation;
  bkm: UniformFileUploadReservation;
}

export interface UniformFileStatusResult {
  fileUniqueId: string;
  found: boolean;
  status: UniformFileRemoteStatus | null;
  description: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export function uniformFileChunkSize(totalBytes: number): number {
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) {
    throw new UniformFileClientError(
      'Uniform-file buffer must contain at least one byte',
      'upload_bytes',
      'validation',
      false,
    );
  }
  if (totalBytes <= 32 * MIB) return totalBytes;
  if (totalBytes <= 250 * MIB) return 32 * MIB;
  if (totalBytes <= 1024 * MIB) return 64 * MIB;
  return 128 * MIB;
}

@Injectable()
export class UniformFileApiService {
  private readonly logger = new Logger(UniformFileApiService.name);

  constructor(
    private readonly http: HttpService,
    @Inject(UNIFORM_FILE_API_CONFIG)
    private readonly config: UniformFileApiConfig,
  ) {}

  async reserveUploadLinks(
    accessToken: string,
    request: {
      caseNumber: string;
      startPeriod: string;
      endPeriod: string;
      representorCompanyId?: string | null;
    },
  ): Promise<UniformFileReservedPair> {
    this.assertEnabled();
    if (!accessToken) {
      throw this.validationError('Daily Token is required', 'reserve_links');
    }
    const payload: Record<string, number | string> = {
      caseNumber: this.numericIdentifier(
        this.config.environment === 'tsandbox'
          ? this.config.sandboxCaseNumberOverride ?? request.caseNumber
          : request.caseNumber,
        'caseNumber',
      ),
      startPeriod: this.isoDate(request.startPeriod, 'startPeriod'),
      endPeriod: this.isoDate(request.endPeriod, 'endPeriod'),
    };
    if (request.representorCompanyId) {
      payload.representorCompanyId = this.numericIdentifier(
        request.representorCompanyId,
        'representorCompanyId',
      );
    }

    try {
      const response = await firstValueFrom(
        this.http
          .post(this.config.uploadLinksUrl, payload, {
            headers: this.apiHeaders(accessToken),
            timeout: REQUEST_TIMEOUT_MS,
          })
          .pipe(timeout(REQUEST_TIMEOUT_MS)),
      );
      if (response.status !== 200) {
        throw this.providerError('reserve_links', response.status, true);
      }
      return this.validateReservedPair(response.data);
    } catch (error) {
      throw this.normalizeError(error, 'reserve_links', true);
    }
  }

  assertWithinReservedSize(
    reservation: UniformFileUploadReservation,
    buffer: Buffer,
  ): void {
    if (!Buffer.isBuffer(buffer) || buffer.length <= 0) {
      throw this.validationError(
        'Uniform-file buffer must contain at least one byte',
        'initiate_upload',
      );
    }
    if (buffer.length > reservation.maxByteLength) {
      throw this.validationError(
        'Uniform-file buffer exceeds the reserved upload size',
        'initiate_upload',
      );
    }
  }

  async initiateResumableUpload(
    reservation: UniformFileUploadReservation,
    buffer: Buffer,
  ): Promise<string> {
    this.assertEnabled();
    this.assertWithinReservedSize(reservation, buffer);
    try {
      const response = await firstValueFrom(
        this.http
          .post(reservation.signUrl, null, {
            headers: reservation.headers,
            timeout: REQUEST_TIMEOUT_MS,
            maxRedirects: 0,
            validateStatus: () => true,
          })
          .pipe(timeout(REQUEST_TIMEOUT_MS)),
      );
      const location = this.header(response.headers, 'location');
      if (response.status !== 201 || !location) {
        throw this.providerError(
          'initiate_upload',
          response.status,
          response.status >= 500,
        );
      }
      return this.assertGoogleCapabilityUrl(location, 'upload session URL');
    } catch (error) {
      throw this.normalizeError(error, 'initiate_upload', true);
    }
  }

  async uploadBuffer(sessionUrl: string, buffer: Buffer): Promise<void> {
    this.assertEnabled();
    const safeSessionUrl = this.assertGoogleCapabilityUrl(
      sessionUrl,
      'upload session URL',
    );
    const chunkSize = uniformFileChunkSize(buffer.length);
    for (let start = 0; start < buffer.length; start += chunkSize) {
      const end = Math.min(start + chunkSize, buffer.length) - 1;
      const finalChunk = end === buffer.length - 1;
      try {
        const response = await firstValueFrom(
          this.http
            .put(safeSessionUrl, buffer.subarray(start, end + 1), {
              headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': end - start + 1,
                'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
              },
              timeout: REQUEST_TIMEOUT_MS,
              maxRedirects: 0,
              maxBodyLength: Infinity,
              maxContentLength: Infinity,
              validateStatus: () => true,
            })
            .pipe(timeout(REQUEST_TIMEOUT_MS)),
        );
        const expected = finalChunk
          ? response.status === 200 || response.status === 201
          : response.status === 308;
        if (!expected) {
          throw this.providerError('upload_bytes', response.status, true);
        }
      } catch (error) {
        throw this.normalizeError(error, 'upload_bytes', true);
      }
    }
  }

  async getFileStatuses(
    accessToken: string,
    fileUniqueIds: readonly string[],
  ): Promise<UniformFileStatusResult[]> {
    this.assertEnabled();
    if (!accessToken) {
      throw this.validationError('Daily Token is required', 'poll_status');
    }
    if (
      fileUniqueIds.length !== 2 ||
      new Set(fileUniqueIds).size !== fileUniqueIds.length
    ) {
      throw this.validationError(
        'Exactly two distinct file identifiers are required',
        'poll_status',
      );
    }
    const ids = fileUniqueIds.map((value) =>
      this.boundedText(value, MAX_FILE_ID_LENGTH, 'fileUniqueId'),
    );
    try {
      const response = await firstValueFrom(
        this.http
          .post(
            this.config.statusUrl,
            ids.map((fileName) => ({ fileName })),
            {
              headers: this.apiHeaders(accessToken),
              timeout: REQUEST_TIMEOUT_MS,
            },
          )
          .pipe(timeout(REQUEST_TIMEOUT_MS)),
      );
      if (response.status !== 200 || !Array.isArray(response.data)) {
        throw this.providerError('poll_status', response.status, false);
      }
      return this.validateStatuses(ids, response.data);
    } catch (error) {
      throw this.normalizeError(error, 'poll_status', false);
    }
  }

  private validateReservedPair(value: any): UniformFileReservedPair {
    if (
      value?.success !== true ||
      !value.data ||
      !Array.isArray(value.data.files) ||
      value.data.files.length !== 2
    ) {
      this.logInvalidReservationEnvelope(value);
      throw this.validationError(
        'SHAAM returned an invalid upload-link pair',
        'reserve_links',
      );
    }
    const uniqueId = this.reservationUniqueId(value.data.uniqueId);
    // The official output table defines the pair by position: INI first, BKM
    // second. The live tsandbox fixture uses opaque names that do not encode
    // either kind, so names remain bounded metadata rather than classifiers.
    const ini = this.validateReservation(value.data.files[0], 'ini');
    const bkm = this.validateReservation(value.data.files[1], 'bkm');
    if (ini.fileUniqueId === bkm.fileUniqueId) {
      throw this.validationError(
        'SHAAM upload-link response must contain distinct INI and BKM files',
        'reserve_links',
      );
    }
    return { uniqueId, ini, bkm };
  }

  private validateReservation(
    value: any,
    kind: UniformFileKind,
  ): UniformFileUploadReservation {
    const fileName = this.boundedText(
      value?.fileName,
      MAX_FILE_NAME_LENGTH,
      'fileName',
    );
    const fileUniqueId = this.boundedText(
      value?.fileUniqueId,
      MAX_FILE_ID_LENGTH,
      'fileUniqueId',
    );
    const signUrl = this.assertGoogleCapabilityUrl(value?.signUrl, 'signUrl');
    if (!value?.headers || typeof value.headers !== 'object') {
      throw this.validationError(
        'SHAAM upload headers are missing',
        'reserve_links',
      );
    }
    const normalizedHeaders = Object.fromEntries(
      Object.entries(value.headers).map(([key, headerValue]) => [
        key.toLowerCase(),
        headerValue,
      ]),
    );
    if (
      Object.keys(normalizedHeaders).some(
        (key) =>
          key !== 'x-goog-content-length-range' && key !== 'x-goog-resumable',
      ) ||
      normalizedHeaders['x-goog-resumable'] !== 'start'
    ) {
      throw this.validationError(
        'SHAAM returned unsupported upload headers',
        'reserve_links',
      );
    }
    const range = String(
      normalizedHeaders['x-goog-content-length-range'] || '',
    );
    const match = /^0,([1-9]\d*)$/.exec(range);
    const maxByteLength = match ? Number(match[1]) : NaN;
    if (!Number.isSafeInteger(maxByteLength)) {
      throw this.validationError(
        'SHAAM returned an invalid upload size limit',
        'reserve_links',
      );
    }
    return {
      kind,
      fileName,
      fileUniqueId,
      signUrl,
      headers: {
        'x-goog-content-length-range': range,
        'x-goog-resumable': 'start',
      },
      maxByteLength,
    };
  }

  private validateStatuses(
    requestedIds: string[],
    values: any[],
  ): UniformFileStatusResult[] {
    if (values.length !== requestedIds.length) {
      throw this.validationError(
        'SHAAM returned an incomplete file-status response',
        'poll_status',
      );
    }
    const byId = new Map<string, UniformFileStatusResult>();
    for (const value of values) {
      const fileUniqueId = this.boundedText(
        value?.fileName,
        MAX_FILE_ID_LENGTH,
        'fileName',
      );
      if (!requestedIds.includes(fileUniqueId) || byId.has(fileUniqueId)) {
        throw this.validationError(
          'SHAAM returned an unexpected file-status item',
          'poll_status',
        );
      }
      const found = value?.isFound === true;
      let status: UniformFileRemoteStatus | null = null;
      if (found) {
        const observedStatus = this.normalizeSandboxStatus(value?.status);
        const remoteStatus = String(observedStatus || '').toUpperCase();
        if (
          !Object.values(UniformFileRemoteStatus).includes(
            remoteStatus as UniformFileRemoteStatus,
          )
        ) {
          this.logUnknownFileStatus(value?.status, found);
          throw this.validationError(
            'SHAAM returned an unknown file status',
            'poll_status',
          );
        }
        status = remoteStatus as UniformFileRemoteStatus;
      } else if (String(value?.status || '') !== '') {
        throw this.validationError(
          'SHAAM returned an invalid not-found status item',
          'poll_status',
        );
      }
      byId.set(fileUniqueId, {
        fileUniqueId,
        found,
        status,
        description: this.optionalText(value?.description, 1000),
        errorCode: this.optionalText(value?.errorCode, 128),
        errorMessage: this.optionalText(value?.errorMessage, 1000),
      });
    }
    return requestedIds.map((id) => byId.get(id)!);
  }

  private reservationUniqueId(value: unknown): string {
    if (value === '' && this.config.environment === 'tsandbox') return '';
    return this.boundedText(value, 255, 'uniqueId');
  }

  private normalizeSandboxStatus(value: unknown): unknown {
    return this.config.environment === 'tsandbox' && value === 'Mocked Status'
      ? 'Uploaded'
      : value;
  }

  private logInvalidReservationEnvelope(body: any): void {
    const data = body?.data;
    const safeKeys =
      body && typeof body === 'object' && !Array.isArray(body)
        ? Object.keys(body)
            .filter((key) => /^[A-Za-z0-9_-]{1,64}$/.test(key))
            .slice(0, 20)
        : [];
    this.logger.warn(
      JSON.stringify({
        event: 'shaam_uniform_file_invalid_reservation_envelope',
        bodyType: this.structuralType(body),
        topLevelKeys: safeKeys,
        successType: this.structuralType(body?.success),
        dataType: this.structuralType(data),
        uniqueIdType: this.structuralType(data?.uniqueId),
        filesType: this.structuralType(data?.files),
        fileCount: Array.isArray(data?.files) ? data.files.length : null,
      }),
    );
  }

  private logUnknownFileStatus(status: unknown, isFound: boolean): void {
    const statusToken =
      typeof status === 'string' && /^[A-Za-z][A-Za-z0-9 _-]{0,31}$/.test(status)
        ? status
        : null;
    this.logger.warn(
      JSON.stringify({
        event: 'shaam_uniform_file_unknown_status',
        statusToken,
        statusType: typeof status,
        statusLength: typeof status === 'string' ? status.length : null,
        isFound,
      }),
    );
  }

  private structuralType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  private apiHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-IBM-Client-Id': this.config.clientId,
    };
  }

  private numericIdentifier(value: unknown, field: string): number {
    const text = String(value || '').trim();
    if (!/^\d{1,9}$/.test(text)) {
      throw this.validationError(`${field} is invalid`, 'reserve_links');
    }
    return Number(text);
  }

  private isoDate(value: unknown, field: string): string {
    const text = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      throw this.validationError(`${field} is invalid`, 'reserve_links');
    }
    const parsed = new Date(`${text}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== text
    ) {
      throw this.validationError(`${field} is invalid`, 'reserve_links');
    }
    return text;
  }

  private boundedText(value: unknown, max: number, field: string): string {
    if (typeof value !== 'string') {
      throw this.validationError(
        `SHAAM returned an invalid ${field}`,
        'reserve_links',
      );
    }
    const text = value.trim();
    if (!text || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) {
      throw this.validationError(
        `SHAAM returned an invalid ${field}`,
        'reserve_links',
      );
    }
    return text;
  }

  private optionalText(value: unknown, max: number): string | null {
    if (value === null || value === undefined || value === '') return null;
    const text = String(value).trim();
    return text && text.length <= max && !/[\u0000-\u001f\u007f]/.test(text)
      ? text
      : null;
  }

  private assertGoogleCapabilityUrl(value: unknown, label: string): string {
    let parsed: URL;
    try {
      parsed = new URL(String(value || ''));
    } catch {
      throw this.validationError(
        `SHAAM returned an invalid ${label}`,
        'reserve_links',
      );
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'storage.googleapis.com' ||
      parsed.username ||
      parsed.password
    ) {
      throw this.validationError(
        `SHAAM returned an invalid ${label}`,
        'reserve_links',
      );
    }
    return parsed.toString();
  }

  private header(headers: unknown, name: string): string | null {
    if (!headers || typeof headers !== 'object') return null;
    const entry = Object.entries(headers as Record<string, unknown>).find(
      ([key]) => key.toLowerCase() === name,
    );
    return typeof entry?.[1] === 'string' ? entry[1] : null;
  }

  private validationError(
    message: string,
    stage: UniformFileClientStage,
  ): UniformFileClientError {
    return new UniformFileClientError(message, stage, 'validation', false);
  }

  private providerError(
    stage: UniformFileClientStage,
    status: unknown,
    ambiguous: boolean,
  ): UniformFileClientError {
    const httpStatus = Number(status);
    const safeStatus =
      Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599
        ? httpStatus
        : null;
    const category =
      safeStatus === 401 || safeStatus === 406
        ? 'authorization'
        : safeStatus === 403
        ? 'permission'
        : 'provider';
    return new UniformFileClientError(
      'SHAAM Uniform File request failed',
      stage,
      category,
      ambiguous,
      safeStatus,
    );
  }

  private normalizeError(
    error: unknown,
    stage: UniformFileClientStage,
    writeBoundary: boolean,
  ): UniformFileClientError {
    if (error instanceof UniformFileClientError) return error;
    const source = error as any;
    if (source?.response) {
      return this.providerError(
        stage,
        source.response.status,
        writeBoundary && Number(source.response.status) >= 500,
      );
    }
    const code = String(source?.code || '').toUpperCase();
    const timeoutError = code === 'ECONNABORTED' || code === 'ETIMEDOUT';
    return new UniformFileClientError(
      timeoutError
        ? 'SHAAM Uniform File request timed out'
        : 'SHAAM Uniform File network request failed',
      stage,
      timeoutError ? 'timeout' : 'network',
      writeBoundary,
      null,
    );
  }

  private assertEnabled(): void {
    if (!this.config.enabled) {
      throw new UniformFileClientError(
        'Uniform-file SHAAM API is disabled',
        'reserve_links',
        'validation',
        false,
      );
    }
  }
}
