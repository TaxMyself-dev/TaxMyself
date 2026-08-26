import { MODULE_METADATA } from '@nestjs/common/constants';
import { ExpensesModule } from './expense.module';
import { ExpensesService } from './expenses.service';
import { ReportsModule } from '../reports/reports.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { GoogleDriveModule } from '../google-drive/google-drive.module';

type ForwardReference = { forwardRef: () => unknown };

function moduleMetadata(moduleClass: unknown, key: string): unknown[] {
  return Reflect.getMetadata(key, moduleClass) ?? [];
}

function unwrapForwardReference(value: unknown): unknown {
  const reference = value as Partial<ForwardReference>;
  return typeof reference?.forwardRef === 'function'
    ? reference.forwardRef()
    : value;
}

describe('ExpensesModule provider wiring', () => {
  it.each([TransactionsModule, ReportsModule])(
    '%p consumes ExpensesService through ExpensesModule',
    (consumerModule) => {
      const imports = moduleMetadata(
        consumerModule,
        MODULE_METADATA.IMPORTS,
      ).map(unwrapForwardReference);
      const providers = moduleMetadata(
        consumerModule,
        MODULE_METADATA.PROVIDERS,
      );

      expect(imports).toContain(ExpensesModule);
      expect(providers).not.toContain(ExpensesService);
    },
  );

  it('keeps the ExpensesModule imports resolvable through circular consumers', () => {
    const imports = moduleMetadata(
      ExpensesModule,
      MODULE_METADATA.IMPORTS,
    ).map(unwrapForwardReference);

    expect(imports).not.toContain(undefined);
    expect(imports).toContain(GoogleDriveModule);
  });
});
