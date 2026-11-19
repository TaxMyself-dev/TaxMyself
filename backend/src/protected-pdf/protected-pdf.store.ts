import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

export interface ProtectedRoot {
  id: number;
  firebase_id: string;
  business_number: string;
  content_hash: string;
  original_import_id: number | null;
  original_drive_id: string | null;
  filename: string;
  source: string;
  metadata_json: any;
  integration_id: number | null;
  status: 'IMPORTING' | 'PASSWORD_REQUIRED' | 'REPLACED';
  current_operation_id: string | null;
  version: number;
  lease_token: string | null;
  lease_expires_at: Date | null;
  created_at: Date;
}
export interface ReplacementOperation {
  id: string;
  protected_id: number;
  firebase_id: string;
  business_number: string;
  actor_id: string;
  idempotency_key: string;
  content_hash: string;
  filename: string;
  size: number;
  candidate_drive_id: string | null;
  replacement_import_id: number | null;
  status:
    | 'RESERVED'
    | 'UPLOAD_FAILED'
    | 'PENDING'
    | 'DISPATCHING'
    | 'QUEUED'
    | 'DELIVERY_FAILED';
  processing_status:
    | 'NOT_STARTED'
    | 'PENDING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'NO_INVOICE_FOUND';
  expected_version: number;
  lease_token: string | null;
  lease_expires_at: Date | null;
  attempts: number;
  error_code: string | null;
}

/** Parameterized SQL only. New sidecar tables are never queried with the feature off.
 * Existing TypeORM entities are untouched, so disabled startup needs no new columns.
 */
@Injectable()
export class ProtectedPdfStore {
  constructor(readonly dataSource: DataSource) {}
  async query(
    sql: string,
    values: any[] = [],
    manager?: EntityManager,
  ): Promise<any> {
    try {
      return await (manager || this.dataSource).query(sql, values);
    } catch {
      throw new ServiceUnavailableException({
        code: 'PROTECTED_STORE_UNAVAILABLE',
        message: 'Protected document storage is unavailable',
      });
    }
  }
  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(work);
  }
  async root(
    id: number,
    owner: string,
    business: string,
    manager?: EntityManager,
    lock = false,
  ): Promise<ProtectedRoot | undefined> {
    const row = (
      await this.query(
        'SELECT * FROM protected_documents WHERE id=? AND firebase_id=? AND business_number=?' +
          (lock ? ' FOR UPDATE' : ''),
        [id, owner, business],
        manager,
      )
    )[0];
    return row?.firebase_id === owner && row?.business_number === business
      ? row
      : undefined;
  }
  async operation(
    id: string,
    manager?: EntityManager,
    lock = false,
  ): Promise<ReplacementOperation | undefined> {
    return (
      await this.query(
        'SELECT * FROM document_replacement_operations WHERE id=?' +
          (lock ? ' FOR UPDATE' : ''),
        [id],
        manager,
      )
    )[0];
  }
}
