import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import { REQUEST_TIMEOUT_MS, ShaamEnvironment } from '../shaam.constants';
import {
  UNIFORM_FILE_OAUTH_CONFIG,
  UniformFileOauthConfig,
} from './uniform-file-oauth.config';

const SINGLE_REQUEST_LIMIT = 32 * 1024 * 1024;
const MEDIUM_FILE_LIMIT = 250 * 1024 * 1024;
const LARGE_FILE_LIMIT = 1024 * 1024 * 1024;
const MEDIUM_CHUNK_SIZE = 32 * 1024 * 1024;
const LARGE_CHUNK_SIZE = 64 * 1024 * 1024;
const XLARGE_CHUNK_SIZE = 128 * 1024 * 1024;
const MAX_SAFE_MESSAGE_LENGTH = 500;

export type UniformFileKind = 'INI' | 'BKM';
export type UniformFileShaamStatus = 'Uploaded' | 'Approved' | 'Rejected' | '';

export interface UniformFileUploadLink {
  kind: UniformFileKind;
  fileName: string;
  fileUniqueId: string;
  signUrl: string;
  headers: Record<string, string>;
  minimumBytes: number;
  maximumBytes: number;
}

export interface UniformFileUploadReservation {
  uniqueId: string;
  ini: UniformFileUploadLink;
  bkm: UniformFileUploadLink;
}

export interface ReserveUniformFileUploadInput {
  caseNumber: string;
  startPeriod: string;
  endPeriod: string;
  representorCompanyId?: string;
}

export interface UniformFileStatusResult {
  fileName: string;
  status: UniformFileShaamStatus;
  description: string;
  isFound: boolean;
  errorCode: string;
  errorMessage: string;
}

@Injectable()
export class UniformFileUploadService {
  constructor(
    private readonly httpService: HttpService,
    @Inject(UNIFORM_FILE_OAUTH_CONFIG)
    private readonly config: UniformFileOauthConfig,
  ) {}

  async reserveUploadLinks(
    accessToken: string,
    input: ReserveUniformFileUploadInput,
  ): Promise<UniformFileUploadReservation> {
    this.assertEnabled();
    this.assertAccessToken(accessToken);
    this.validateReservationInput(input);

    const response = await this.callUpstream(
      this.httpService.post(
        this.config.uploadLinksUrl,
        {
          caseNumber: Number(
            this.config.environment === ShaamEnvironment.TSANDBOX
              ? this.config.sandboxCaseNumberOverride ?? input.caseNumber
              : input.caseNumber,
          ),
          startPeriod: input.startPeriod,
          endPeriod: input.endPeriod,
          ...(input.representorCompanyId
            ? { representorCompanyId: Number(input.representorCompanyId) }
            : {}),
        },
        {
          headers: this.bearerHeaders(accessToken),
          timeout: REQUEST_TIMEOUT_MS,
          maxRedirects: 0,
          validateStatus: () => true,
        },
      ),
      'reserve upload links',
    );

    this.assertSuccessfulShaamResponse(response.status, 'reserve upload links');
    return this.parseReservation(response.data);
  }

  async uploadPair(
    reservation: UniformFileUploadReservation,
    files: { ini: Buffer; bkm: Buffer },
  ): Promise<void> {
    this.assertEnabled();
    await this.uploadFile(reservation.ini, files.ini);
    await this.uploadFile(reservation.bkm, files.bkm);
  }

  async uploadFile(link: UniformFileUploadLink, contents: Buffer): Promise<void> {
    this.assertEnabled();
    if (!Buffer.isBuffer(contents) || contents.length === 0) {
      throw new BadRequestException('Uniform file must not be empty');
    }
    if (
      contents.length < link.minimumBytes ||
      contents.length > link.maximumBytes
    ) {
      throw new BadRequestException('Uniform file size is outside the reserved range');
    }

    this.assertGoogleStorageUrl(link.signUrl);
    const storageHeaders = this.parseStorageHeaders(link.headers);
    const [minimumBytes, maximumBytes] = this.parseContentLengthRange(
      storageHeaders['x-goog-content-length-range'],
    );
    if (
      minimumBytes !== link.minimumBytes ||
      maximumBytes !== link.maximumBytes
    ) {
      throw new BadRequestException('Uniform-file upload metadata is inconsistent');
    }
    const initiation = await this.callStorage(
      this.httpService.post(link.signUrl, Buffer.alloc(0), {
        headers: { ...storageHeaders, 'Content-Length': '0' },
        timeout: REQUEST_TIMEOUT_MS,
        maxRedirects: 0,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: () => true,
      }),
      'initiate upload',
    );
    if (initiation.status !== 201) {
      throw new BadGatewayException('SHAAM storage did not initiate the upload');
    }

    const sessionUrl = this.readHeader(initiation.headers, 'location');
    this.assertGoogleStorageUrl(sessionUrl);
    const chunkSize = this.chunkSizeFor(contents.length);

    for (let start = 0; start < contents.length; start += chunkSize) {
      const end = Math.min(start + chunkSize, contents.length) - 1;
      const finalChunk = end === contents.length - 1;
      const chunk = contents.subarray(start, end + 1);
      const result = await this.callStorage(
        this.httpService.put(sessionUrl, chunk, {
          headers: {
            'Content-Length': String(chunk.length),
            'Content-Range': `bytes ${start}-${end}/${contents.length}`,
          },
          timeout: REQUEST_TIMEOUT_MS,
          maxRedirects: 0,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          validateStatus: () => true,
        }),
        'upload file chunk',
      );

      if (finalChunk) {
        if (result.status !== 200 && result.status !== 201) {
          throw new BadGatewayException('SHAAM storage did not complete the upload');
        }
      } else if (result.status !== 308) {
        throw new BadGatewayException('SHAAM storage rejected an upload chunk');
      }
    }
  }

  async getFileStatuses(
    accessToken: string,
    fileUniqueIds: string[],
  ): Promise<UniformFileStatusResult[]> {
    this.assertEnabled();
    this.assertAccessToken(accessToken);
    if (
      !Array.isArray(fileUniqueIds) ||
      fileUniqueIds.length === 0 ||
      fileUniqueIds.some((id) => !this.isNonEmptyString(id)) ||
      new Set(fileUniqueIds).size !== fileUniqueIds.length
    ) {
      throw new BadRequestException('Unique SHAAM file identifiers are required');
    }

    const response = await this.callUpstream(
      this.httpService.post(
        this.config.statusUrl,
        fileUniqueIds.map((fileName) => ({ fileName })),
        {
          headers: this.bearerHeaders(accessToken),
          timeout: REQUEST_TIMEOUT_MS,
          maxRedirects: 0,
          validateStatus: () => true,
        },
      ),
      'read file status',
    );
    this.assertSuccessfulShaamResponse(response.status, 'read file status');
    return this.parseStatuses(response.data, fileUniqueIds);
  }

  private parseReservation(body: any): UniformFileUploadReservation {
    if (body?.success === false) {
      throw new BadRequestException('SHAAM rejected the upload-link reservation');
    }
    const data = body?.data;
    if (body?.success !== true || !data || !this.isBoundedIdentifier(data.uniqueId)) {
      throw new BadGatewayException('SHAAM returned invalid upload-link metadata');
    }
    if (!Array.isArray(data.files) || data.files.length !== 2) {
      throw new BadGatewayException('SHAAM did not reserve exactly two uniform files');
    }

    const parsed = data.files.map((file: any) => this.parseUploadLink(file));
    const iniFiles = parsed.filter((file) => file.kind === 'INI');
    const bkmFiles = parsed.filter((file) => file.kind === 'BKM');
    if (iniFiles.length !== 1 || bkmFiles.length !== 1) {
      throw new BadGatewayException('SHAAM returned an invalid uniform-file pair');
    }

    return {
      uniqueId: data.uniqueId,
      ini: iniFiles[0],
      bkm: bkmFiles[0],
    };
  }

  private parseUploadLink(file: any): UniformFileUploadLink {
    if (
      !file ||
      !this.isSafeFileName(file.fileName) ||
      !this.isBoundedIdentifier(file.fileUniqueId) ||
      !this.isNonEmptyString(file.signUrl) ||
      !file.headers ||
      typeof file.headers !== 'object' ||
      Array.isArray(file.headers)
    ) {
      throw new BadGatewayException('SHAAM returned invalid upload-link metadata');
    }

    const upperName = file.fileName.toUpperCase();
    const kind: UniformFileKind | null = upperName.startsWith('INI')
      ? 'INI'
      : upperName.startsWith('BKM')
        ? 'BKM'
        : null;
    if (!kind) {
      throw new BadGatewayException('SHAAM returned an unknown uniform-file name');
    }

    this.assertGoogleStorageUrl(file.signUrl);
    const headers = this.parseStorageHeaders(file.headers);
    const [minimumBytes, maximumBytes] = this.parseContentLengthRange(
      headers['x-goog-content-length-range'],
    );
    return {
      kind,
      fileName: file.fileName,
      fileUniqueId: file.fileUniqueId,
      signUrl: file.signUrl,
      headers,
      minimumBytes,
      maximumBytes,
    };
  }

  private parseStorageHeaders(rawHeaders: Record<string, unknown>): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const [rawName, rawValue] of Object.entries(rawHeaders)) {
      const name = rawName.toLowerCase();
      if (
        (name !== 'x-goog-content-length-range' && name !== 'x-goog-resumable') ||
        typeof rawValue !== 'string'
      ) {
        throw new BadGatewayException('SHAAM returned unsafe upload headers');
      }
      headers[name] = rawValue;
    }
    if (
      headers['x-goog-resumable']?.toLowerCase() !== 'start' ||
      !headers['x-goog-content-length-range']
    ) {
      throw new BadGatewayException('SHAAM returned incomplete upload headers');
    }
    return headers;
  }

  private parseContentLengthRange(value: string): [number, number] {
    const match = /^(\d+),(\d+)$/.exec(value);
    if (!match) {
      throw new BadGatewayException('SHAAM returned an invalid upload size range');
    }
    const minimum = Number(match[1]);
    const maximum = Number(match[2]);
    if (
      !Number.isSafeInteger(minimum) ||
      !Number.isSafeInteger(maximum) ||
      minimum < 0 ||
      maximum < minimum
    ) {
      throw new BadGatewayException('SHAAM returned an invalid upload size range');
    }
    return [minimum, maximum];
  }

  private parseStatuses(body: any, requestedIds: string[]): UniformFileStatusResult[] {
    const items = Array.isArray(body) ? body : body?.data;
    if (!Array.isArray(items) || items.length !== requestedIds.length) {
      throw new BadGatewayException('SHAAM returned invalid file-status metadata');
    }

    const byFileName = new Map<string, UniformFileStatusResult>();
    for (const item of items) {
      if (
        !item ||
        !this.isNonEmptyString(item.fileName) ||
        typeof item.isFound !== 'boolean' ||
        byFileName.has(item.fileName)
      ) {
        throw new BadGatewayException('SHAAM returned invalid file-status metadata');
      }
      const status = item.status ?? '';
      if (!['', 'Uploaded', 'Approved', 'Rejected'].includes(status)) {
        throw new BadGatewayException('SHAAM returned an unknown file status');
      }
      if ((item.isFound && !status) || (!item.isFound && status)) {
        throw new BadGatewayException('SHAAM returned inconsistent file status');
      }
      byFileName.set(item.fileName, {
        fileName: item.fileName,
        status,
        description: this.safeText(item.description),
        isFound: item.isFound,
        errorCode: this.safeText(item.errorCode ?? item.error?.code),
        errorMessage: this.safeText(
          item.errorMessage ?? item.errorDescription ?? item.error?.message,
        ),
      });
    }

    if (requestedIds.some((id) => !byFileName.has(id))) {
      throw new BadGatewayException('SHAAM returned mismatched file-status metadata');
    }
    return requestedIds.map((id) => byFileName.get(id));
  }

  private validateReservationInput(input: ReserveUniformFileUploadInput): void {
    if (
      !input ||
      !/^\d{9}$/.test(input.caseNumber) ||
      !this.isIsoDate(input.startPeriod) ||
      !this.isIsoDate(input.endPeriod) ||
      input.startPeriod > input.endPeriod ||
      (input.representorCompanyId !== undefined &&
        !/^\d{1,9}$/.test(input.representorCompanyId))
    ) {
      throw new BadRequestException('Invalid uniform-file upload request');
    }
  }

  private chunkSizeFor(fileSize: number): number {
    if (fileSize <= SINGLE_REQUEST_LIMIT) return fileSize;
    if (fileSize <= MEDIUM_FILE_LIMIT) return MEDIUM_CHUNK_SIZE;
    if (fileSize <= LARGE_FILE_LIMIT) return LARGE_CHUNK_SIZE;
    return XLARGE_CHUNK_SIZE;
  }

  private bearerHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  private assertSuccessfulShaamResponse(status: number, operation: string): void {
    if (status >= 200 && status < 300) return;
    if (status === 401) {
      throw new UnauthorizedException(`SHAAM rejected the ${operation} token`);
    }
    if (status === 406) {
      throw new ForbiddenException(`SHAAM denied the ${operation} request`);
    }
    if (status === 400 || status === 422) {
      throw new BadRequestException(`SHAAM rejected the ${operation} request`);
    }
    throw new BadGatewayException(`SHAAM failed to ${operation}`);
  }

  private async callUpstream(observable: any, operation: string): Promise<any> {
    try {
      return await firstValueFrom(observable.pipe(timeout(REQUEST_TIMEOUT_MS)));
    } catch (error: any) {
      if (error?.response) {
        throw new BadGatewayException(`SHAAM failed to ${operation}`);
      }
      throw new ServiceUnavailableException('SHAAM is temporarily unavailable');
    }
  }

  private async callStorage(observable: any, operation: string): Promise<any> {
    try {
      return await firstValueFrom(observable.pipe(timeout(REQUEST_TIMEOUT_MS)));
    } catch (error: any) {
      if (error?.response) {
        throw new BadGatewayException(`SHAAM storage failed to ${operation}`);
      }
      throw new ServiceUnavailableException('SHAAM storage is temporarily unavailable');
    }
  }

  private assertGoogleStorageUrl(value: string): void {
    try {
      const url = new URL(value);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'storage.googleapis.com' ||
        url.username ||
        url.password ||
        url.port
      ) {
        throw new Error('unexpected storage host');
      }
    } catch {
      throw new BadGatewayException('SHAAM returned an invalid storage URL');
    }
  }

  private readHeader(headers: Record<string, unknown>, name: string): string {
    const entry = Object.entries(headers ?? {}).find(
      ([headerName]) => headerName.toLowerCase() === name.toLowerCase(),
    );
    if (!entry || !this.isNonEmptyString(entry[1])) {
      throw new BadGatewayException('SHAAM storage omitted the upload session URL');
    }
    return entry[1] as string;
  }

  private safeText(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, MAX_SAFE_MESSAGE_LENGTH);
  }

  private isSafeFileName(value: unknown): value is string {
    return (
      this.isNonEmptyString(value) &&
      value.length <= 255 &&
      !value.includes('/') &&
      !value.includes('\\')
    );
  }

  private isIsoDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private isBoundedIdentifier(value: unknown): value is string {
    return this.isNonEmptyString(value) && value.length <= 255;
  }

  private assertAccessToken(accessToken: string): void {
    if (!this.isNonEmptyString(accessToken)) {
      throw new BadRequestException('SHAAM access token is required');
    }
  }

  private assertEnabled(): void {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException('Uniform-file SHAAM integration is disabled');
    }
  }
}
