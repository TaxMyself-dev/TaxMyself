import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReadinessService } from './readiness.service';

const metadataFixture = [
  { tableName: 'user', columns: ['index', 'firebaseId'] },
  { tableName: 'business', columns: ['id', 'firebaseId'] },
  { tableName: 'child', columns: ['index', 'parentUserID'] },
  { tableName: 'subscription', columns: ['id', 'firebase_id'] },
  { tableName: 'subscription_plan', columns: ['id', 'slug'] },
  { tableName: 'delegation', columns: ['id', 'userId'] },
];

function makeDataSource(
  rows: Array<{ tableName: string; columnName: string }>,
  databaseName = 'keepintax-prod',
) {
  let queryIndex = 0;
  const metadata = [...metadataFixture];
  return {
    query: jest.fn(async () =>
      queryIndex++ === 0 ? [{ databaseName }] : rows,
    ),
    getMetadata: jest.fn(() => {
      const current = metadata.shift();
      if (!current) throw new Error('Unexpected metadata request');
      return {
        tableName: current.tableName,
        columns: current.columns.map((databaseName) => ({ databaseName })),
      };
    }),
  } as unknown as DataSource;
}

function schemaRows() {
  return [
    { tableName: 'user', columnName: 'index' },
    { tableName: 'user', columnName: 'firebaseId' },
    { tableName: 'business', columnName: 'id' },
    { tableName: 'business', columnName: 'firebaseId' },
    { tableName: 'child', columnName: 'index' },
    { tableName: 'child', columnName: 'parentUserID' },
    { tableName: 'subscription', columnName: 'id' },
    { tableName: 'subscription', columnName: 'firebase_id' },
    { tableName: 'subscription_plan', columnName: 'id' },
    { tableName: 'subscription_plan', columnName: 'slug' },
    { tableName: 'delegation', columnName: 'id' },
    { tableName: 'delegation', columnName: 'userId' },
  ];
}

describe('ReadinessService', () => {
  const originalRevision = process.env.K_REVISION;

  afterEach(() => {
    if (originalRevision === undefined) {
      delete process.env.K_REVISION;
    } else {
      process.env.K_REVISION = originalRevision;
    }
  });

  it('reports ready only after the database and signup schema checks pass', async () => {
    process.env.K_REVISION = 'backend-00042';
    const dataSource = makeDataSource(schemaRows());

    await expect(new ReadinessService(dataSource).check()).resolves.toEqual({
      status: 'ready',
      revision: 'backend-00042',
      checks: {
        database: 'ok',
        databaseTarget: 'ok',
        signupSchema: 'ok',
      },
    });
    expect(dataSource.query).toHaveBeenNthCalledWith(
      1,
      'SELECT DATABASE() AS databaseName',
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INFORMATION_SCHEMA.COLUMNS'),
      [
        'user',
        'business',
        'child',
        'subscription',
        'subscription_plan',
        'delegation',
      ],
    );
  });

  it('fails without exposing missing table or column names to the caller', async () => {
    const rows = schemaRows().filter(
      (row) =>
        !(row.tableName === 'subscription' && row.columnName === 'firebase_id'),
    );
    const dataSource = makeDataSource(rows);

    await expect(
      new ReadinessService(dataSource).check(),
    ).rejects.toMatchObject({
      response: {
        status: 'not_ready',
        checks: {
          database: 'ok',
          databaseTarget: 'ok',
          signupSchema: 'failed',
        },
      },
    });
  });

  it('fails when the live connection targets a non-production database', async () => {
    const dataSource = makeDataSource(schemaRows(), 'keepintax-dev');

    await expect(
      new ReadinessService(dataSource).check(),
    ).rejects.toMatchObject({
      response: {
        status: 'not_ready',
        checks: {
          database: 'ok',
          databaseTarget: 'failed',
          signupSchema: 'unknown',
        },
      },
    });
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('reports a database failure without leaking driver details', async () => {
    const dataSource = {
      query: jest.fn().mockRejectedValue({
        code: 'ER_ACCESS_DENIED_ERROR',
        message: 'password and database host must stay private',
      }),
    } as unknown as DataSource;

    try {
      await new ReadinessService(dataSource).check();
      fail('Expected readiness to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({
        status: 'not_ready',
        checks: {
          database: 'failed',
          databaseTarget: 'unknown',
          signupSchema: 'unknown',
        },
      });
      expect(
        JSON.stringify((error as ServiceUnavailableException).getResponse()),
      ).not.toContain('password');
    }
  });
});
