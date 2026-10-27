import { ReportsController } from './reports.controller';

describe('ReportsController', () => {
  let controller: ReportsController;

  beforeEach(() => {
    controller = new ReportsController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
