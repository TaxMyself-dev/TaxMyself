import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { EntityTarget, DataSource } from 'typeorm';
import { Subscription } from './billing/entities/subscription.entity';
import { SubscriptionPlan } from './billing/entities/subscription-plan.entity';
import { Business } from './business/business.entity';
import { Delegation } from './delegation/delegation.entity';
import { Child } from './users/child.entity';
import { User } from './users/user.entity';

type SchemaColumnRow = {
  tableName: string;
  columnName: string;
};

export type ReadinessResult = {
  status: 'ready';
  revision: string;
  checks: {
    database: 'ok';
    signupSchema: 'ok';
  };
};

const SIGNUP_ENTITIES: EntityTarget<unknown>[] = [
  User,
  Child,
  Business,
  Subscription,
  SubscriptionPlan,
  Delegation,
];

@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async check(): Promise<ReadinessResult> {
    try {
      await this.dataSource.query('SELECT 1 AS ok');
      const missingSchema = await this.findMissingSignupSchema();

      if (missingSchema.length > 0) {
        this.logger.error(
          `Signup schema readiness failed; missing: ${missingSchema.join(
            ', ',
          )}`,
        );
        throw new ServiceUnavailableException({
          status: 'not_ready',
          checks: { database: 'ok', signupSchema: 'failed' },
        });
      }

      return {
        status: 'ready',
        revision: process.env.K_REVISION || 'local',
        checks: { database: 'ok', signupSchema: 'ok' },
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      const code = this.errorCode(error);
      this.logger.error(`Database readiness failed${code ? ` (${code})` : ''}`);
      throw new ServiceUnavailableException({
        status: 'not_ready',
        checks: { database: 'failed', signupSchema: 'unknown' },
      });
    }
  }

  private async findMissingSignupSchema(): Promise<string[]> {
    const expected = SIGNUP_ENTITIES.map((entity) => {
      const metadata = this.dataSource.getMetadata(entity);
      return {
        tableName: metadata.tableName,
        columns: metadata.columns.map((column) => column.databaseName),
      };
    });
    const tableNames = expected.map((table) => table.tableName);
    const placeholders = tableNames.map(() => '?').join(', ');

    const rows = (await this.dataSource.query(
      `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (${placeholders})`,
      tableNames,
    )) as SchemaColumnRow[];

    const actual = new Map<string, Set<string>>();
    for (const row of rows) {
      const tableName = String(row.tableName).toLowerCase();
      const columnName = String(row.columnName).toLowerCase();
      const columns = actual.get(tableName) ?? new Set<string>();
      columns.add(columnName);
      actual.set(tableName, columns);
    }

    const missing: string[] = [];
    for (const table of expected) {
      const tableName = table.tableName.toLowerCase();
      const actualColumns = actual.get(tableName);
      if (!actualColumns) {
        missing.push(`${table.tableName}.*`);
        continue;
      }

      for (const column of table.columns) {
        if (!actualColumns.has(column.toLowerCase())) {
          missing.push(`${table.tableName}.${column}`);
        }
      }
    }

    return missing;
  }

  private errorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const candidate = error as {
      code?: unknown;
      driverError?: { code?: unknown };
    };
    const code = candidate.code ?? candidate.driverError?.code;
    return typeof code === 'string' ? code : undefined;
  }
}
