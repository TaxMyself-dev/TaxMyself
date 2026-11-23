import { BusinessType, TaxReportingType, VATReportingType } from 'src/enum';
import { ReportWorkflowType } from 'src/report-workflow/report-workflow.entity';
import { SharedService } from 'src/shared/shared.service';
import { TasksGeneratorService } from './tasks-generator.service';

// expectedReportPeriods (the AI agent's upcoming-reports read): the periods
// generation would track, plus the one still running, computed only — no
// workflow or task row is inserted and no notification is sent.

const writes = () => ({
  insert: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
});

const setup = () => {
  const tasksRepo = writes();
  const workflowRepo = writes();
  const notifications = { notifyClientWorkflowCreated: jest.fn() };
  const shared = Object.create(SharedService.prototype) as SharedService;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  const service = new TasksGeneratorService(
    tasksRepo as never,
    writes() as never,
    writes() as never,
    workflowRepo as never,
    shared,
    notifications as never,
  );
  return { service, tasksRepo, workflowRepo, notifications };
};

const business = {
  businessNumber: '111111111',
  businessType: BusinessType.LICENSED,
  vatReportingType: VATReportingType.DUAL_MONTH_REPORT,
  taxReportingType: TaxReportingType.MONTHLY_REPORT,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
} as never;

const day = (date: Date) => date.toISOString().slice(0, 10);

describe('TasksGeneratorService.expectedReportPeriods', () => {
  afterEach(() => jest.restoreAllMocks());

  it('lists ended periods and the running one, with the 15th-of-next-month due date, and writes nothing', () => {
    const { service, tasksRepo, workflowRepo, notifications } = setup();

    const periods = service.expectedReportPeriods(
      business,
      new Date('2026-10-04T09:00:00.000Z'),
    );

    const vat = periods.filter(
      (period) => period.type === ReportWorkflowType.VAT_REPORT,
    );
    expect(
      vat.map((period) => [
        period.label,
        day(period.periodStart),
        day(period.periodEnd),
        day(period.dueDate),
      ]),
    ).toEqual([
      ['7-8/2026', '2026-07-01', '2026-08-31', '2026-09-15'],
      ['9-10/2026', '2026-09-01', '2026-10-31', '2026-11-15'],
    ]);
    const advance = periods.filter(
      (period) => period.type === ReportWorkflowType.ADVANCE_TAX,
    );
    expect(advance.map((period) => period.label)).toEqual([
      '7/2026',
      '8/2026',
      '9/2026',
      '10/2026',
    ]);
    expect(tasksRepo.insert).not.toHaveBeenCalled();
    expect(workflowRepo.insert).not.toHaveBeenCalled();
    expect(notifications.notifyClientWorkflowCreated).not.toHaveBeenCalled();
  });

  it('crosses a year boundary: the November–December period is due January 15', () => {
    const { service } = setup();

    const periods = service.expectedReportPeriods(
      business,
      new Date('2027-01-05T09:00:00.000Z'),
    );
    const vat = periods.filter(
      (period) => period.type === ReportWorkflowType.VAT_REPORT,
    );

    expect(
      vat.map((period) => [period.label, day(period.dueDate)]),
    ).toContainEqual(['11-12/2026', '2027-01-15']);
    expect(vat.at(-1)?.label).toBe('1-2/2027');
  });

  it('a business that files neither report has no periods', () => {
    const { service } = setup();

    expect(
      service.expectedReportPeriods(
        {
          ...(business as object),
          vatReportingType: VATReportingType.NOT_REQUIRED,
          taxReportingType: TaxReportingType.NOT_REQUIRED,
        } as never,
        new Date('2026-10-04T09:00:00.000Z'),
      ),
    ).toEqual([]);
  });
});
