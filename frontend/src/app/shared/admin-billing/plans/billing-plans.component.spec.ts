import { TestBed } from '@angular/core/testing';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of, throwError } from 'rxjs';
import { AdminBillingService, AdminPlan } from 'src/app/services/admin-billing.service';
import { BillingPlansComponent } from './billing-plans.component';

describe('BillingPlansComponent price management', () => {
  let component: BillingPlansComponent;
  let api: jasmine.SpyObj<AdminBillingService>;
  let confirmation: ConfirmationService;
  const plan: AdminPlan = { id: 1, slug: 'basic', name: 'בסיס', description: null,
    priceMonthlyAgorot: 10000, licensedDealerPriceMonthlyAgorot: 12000, features: ['אחד', 'שניים'],
    badge: 'חדש', recommended: true, notes: 'הערה', currency: 'ILS', modules: ['EXPENSES'],
    trialDays: 14, isActive: true, isPublic: true, displayOrder: 1, createdAt: '', updatedAt: '' };
  beforeEach(() => {
    api = jasmine.createSpyObj('AdminBillingService', ['getPlans', 'createPlan', 'updatePlan', 'getPlanPriceImpact', 'deletePlan']);
    api.getPlans.and.returnValue(of([plan]));
    api.updatePlan.and.returnValue(of(plan));
    api.createPlan.and.returnValue(of(plan));
    TestBed.configureTestingModule({ providers: [{ provide: AdminBillingService, useValue: api }, ConfirmationService, MessageService] });
    component = TestBed.runInInjectionContext(() => new BillingPlansComponent());
    confirmation = TestBed.inject(ConfirmationService);
    component.plans.set([plan]);
  });
  it('preserves marketing fields, both prices and expenses through edit', () => {
    component.openEdit(1);
    expect(component.planForm.getRawValue().featuresText).toBe('אחד\nשניים');
    component.savePlan();
    expect(api.updatePlan).toHaveBeenCalledWith(1, jasmine.objectContaining({
      licensedDealerPriceMonthlyAgorot: 12000, features: ['אחד', 'שניים'], badge: 'חדש',
      recommended: true, notes: 'הערה', modules: ['EXPENSES'],
    }));
    expect(api.getPlanPriceImpact).not.toHaveBeenCalled();
  });
  it('waits for explicit impact confirmation before saving a changed price', () => {
    api.getPlanPriceImpact.and.returnValue(of({ totalSubscribers: 5, followsPlan: 2, frozenPrice: 2, customPrice: 1 }));
    const confirm = spyOn(confirmation, 'confirm');
    component.openEdit(1);
    component.planForm.patchValue({ priceMonthlyShekels: 110 });
    component.savePlan();
    expect(api.updatePlan).not.toHaveBeenCalled();
    expect(component.planForm.disabled).toBeTrue();
    const request = confirm.calls.mostRecent().args[0];
    expect(request.message).toContain('5 מנויים');
    request.accept!();
    expect(api.updatePlan).toHaveBeenCalledWith(1, jasmine.objectContaining({ priceMonthlyAgorot: 11000 }));
  });
  it('fails closed when impact cannot be loaded', () => {
    api.getPlanPriceImpact.and.returnValue(throwError(() => new Error('offline')));
    component.openEdit(1);
    component.planForm.patchValue({ licensedPriceShekels: 150 });
    component.savePlan();
    expect(api.updatePlan).not.toHaveBeenCalled();
    expect(component.saving()).toBeFalse();
  });
  it('requires delete confirmation and retains the list on rejection', () => {
    const confirm = spyOn(confirmation, 'confirm');
    component.confirmDelete({ id: 1, name: plan.name });
    expect(api.deletePlan).not.toHaveBeenCalled();
    api.deletePlan.and.returnValue(throwError(() => ({ error: { message: 'יש מנויים' } })));
    confirm.calls.mostRecent().args[0].accept!();
    expect(api.deletePlan).toHaveBeenCalledWith(1);
    expect(component.plans()).toEqual([plan]);
  });
  it('maps support to the public card key while preserving unknown features', () => {
    component.openEdit(1);
    component.planForm.patchValue({ featureSupport: true });
    component.savePlan();
    expect(api.updatePlan).toHaveBeenCalledWith(1, jasmine.objectContaining({ features: ['אחד', 'שניים', 'SUPPORT'] }));
  });
  it('unlocks the editor after price confirmation is canceled', () => {
    api.getPlanPriceImpact.and.returnValue(of({ totalSubscribers: 0, followsPlan: 0, frozenPrice: 0, customPrice: 0 }));
    const confirm = spyOn(confirmation, 'confirm');
    component.openEdit(1);
    component.planForm.patchValue({ priceMonthlyShekels: 110 });
    component.savePlan();
    confirm.calls.mostRecent().args[0].reject!();
    expect(component.planForm.enabled).toBeTrue();
    expect(component.confirmingPriceChange()).toBeFalse();
    expect(api.updatePlan).not.toHaveBeenCalled();
  });

});
