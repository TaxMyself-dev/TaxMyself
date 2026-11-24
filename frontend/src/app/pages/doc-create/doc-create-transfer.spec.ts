import { TestBed } from '@angular/core/testing';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { DocCreatePage } from './doc-create.page';
import { GenericService } from '../../services/generic.service';
import { DocumentsService } from '../../services/documents.service';
import { ShaamService } from '../../services/shaam.service';
import { DocumentType } from './doc-cerate.enum';

const details = { bank: 'בנק לדוגמה', branch: '001', accountNumber: '00012345', beneficiary: 'ישראל ישראלי' };
describe('document transfer details form', () => {
  let page: any;
  beforeEach(() => {
    const gs = { mapLabelToName: () => [], isMobile: () => false };
    TestBed.configureTestingModule({providers: [
      {provide: GenericService, useValue: gs}, {provide: DocumentsService, useValue: {}},
      {provide: ShaamService, useValue: {}}, {provide: ConfirmationService, useValue: {}},
      {provide: MessageService, useValue: {}},
    ]});
    const builder = {buildDocCreateForm: () => new FormGroup({}), getBaseFieldsBySection: () => []};
    page = TestBed.runInInjectionContext(() => new DocCreatePage({} as any, {} as any, gs as any,
      {} as any, {} as any, new FormBuilder(), builder as any, {} as DialogService));
    page.myForm = new FormGroup({
      GeneralDetails: new FormGroup({ docType: new FormControl(DocumentType.TAX_INVOICE), docDate: new FormControl(new Date()) }),
      UserDetails: new FormGroup({}), LineDetails: new FormGroup({}),
    });
    page.fileSelected.set(DocumentType.TAX_INVOICE);
    page.generalFormIsValidSignal.set(true); page.userFormIsValidSignal.set(true);
    page.lineItemsDraft.set([{}]);
    page.docIndexes = {docIndex: 1, generalIndex: 1};
    page.selectedBusinessNumber = '123456789';
  });
  it('is optional by default and adds no payment rows', () => {
    expect(page.transferDetailsEnabled()).toBeFalse();
    expect(page.createDocIsValid()).toBeTrue();
    const payload = page.buildDocPayload();
    expect(payload.docData.transferDetails).toBeNull();
    expect(payload.paymentData).toEqual([]);
  });
  it('blocks issue/preview when enabled but incomplete, then preserves leading zeros', () => {
    page.transferDetailsEnabled.set(true);
    expect(page.createDocIsValid()).toBeFalse();
    expect(() => page.buildDocPayload()).toThrow();
    page.transferDetailsForm.setValue(details);
    expect(page.createDocIsValid()).toBeTrue();
    expect(page.buildDocPayload().docData.transferDetails).toEqual(details);
    page.transferDetailsForm.patchValue({bank: ' '});
    expect(page.createDocIsValid()).toBeFalse();
  });
  it('omits details after unchecking, even with entered values', () => {
    page.restoreTransferDetails(details);
    page.transferDetailsEnabled.set(false);
    expect(page.buildDocPayload().docData.transferDetails).toBeNull();
    expect(page.createDocIsValid()).toBeTrue();
  });
  it('restores drafts with details and clears legacy draft details', () => {
    page.restoreTransferDetails(details);
    expect(page.transferDetailsEnabled()).toBeTrue();
    expect(page.buildDocPayload().docData.transferDetails).toEqual(details);
    page.restoreTransferDetails(undefined);
    expect(page.transferDetailsEnabled()).toBeFalse();
    expect(page.transferDetailsForm.get('accountNumber').value).toBeNull();
  });
  it('supports exactly transaction and tax invoices', () => {
    for (const type of Object.values(DocumentType)) {
      page.fileSelected.set(type);
      expect(page.supportsTransferDetails()).toBe([DocumentType.TAX_INVOICE, DocumentType.TRANSACTION_INVOICE].includes(type as DocumentType));
    }
  });
  it('clears instructions when the selected business changes', () => {
    page.restoreTransferDetails(details);
    page.setSelectedBusiness({businessNumber: '987654321'});
    expect(page.transferDetailsEnabled()).toBeFalse();
    expect(page.transferDetailsForm.get('bank').value).toBeNull();
  });
  it('clears instructions when document type changes', () => {
    page.restoreTransferDetails(details);
    page.handleDocIndexes = () => {};
    page.onSelectedDoc(DocumentType.TRANSACTION_INVOICE);
    expect(page.transferDetailsEnabled()).toBeFalse();
    expect(page.transferDetailsForm.get('accountNumber').value).toBeNull();
  });
  it('does not send details for an unsupported document type', () => {
    page.restoreTransferDetails(details);
    page.fileSelected.set(DocumentType.CREDIT_INVOICE);
    expect(page.buildDocPayload().docData.transferDetails).toBeNull();
  });
});
