import { documentRetryMessage, documentRetryError } from 'src/app/services/document-retry';
import { finalize } from 'rxjs';
import { emailSyncErrorMessage, emailConnectionIssueMessage } from 'src/app/services/email-sync-messages';
import { environment } from 'src/environments/environment';
import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { InputDateComponent } from 'src/app/components/input-date/input-date.component';
import { InputSelectComponent } from 'src/app/components/input-select/input-select.component';
import { InputTextComponent } from 'src/app/components/input-text/input-text.component';
import { GenericService } from 'src/app/services/generic.service';
import { AuthService } from 'src/app/services/auth.service';
import { GmailSyncStateService } from 'src/app/services/gmail-sync-state.service';
import {
  GmailAccountSyncStatus,
  GmailDurableRun,
  EmailRoutingConfiguration,
  IntegrationsService,
} from 'src/app/services/integrations.service';
import { inputsSize } from 'src/app/shared/enums';

/**
 * חיבור Gmail לקליטת מסמכים (טאב "ניהול הרשאות וחשבונות" בהגדרות).
 *
 * תומך בכמה חשבונות Gmail למשתמש: מציג רשימת חשבונות מחוברים, לכל אחד מצב
 * הסנכרון, טופס טווח לייבוא הראשוני וכפתור ניתוק משלו. המצב, ה-polling
 * והתראות הסיום חיים ב-GmailSyncStateService (root) כדי שימשיכו לפעול גם אחרי
 * ניווט למסך אחר. גבולות התאריכים (minFromDate/maxToDate) מגיעים מהשרת בלבד.
 */
@Component({
  selector: 'app-gmail-integration',
  templateUrl: './gmail-integration.component.html',
  styleUrls: ['./gmail-integration.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    DialogModule,
    CheckboxModule,
    ButtonComponent,
    InputDateComponent,
    InputSelectComponent,
    InputTextComponent,
  ],
})
export class GmailIntegrationComponent implements OnInit {
  readonly retryAccountId=signal<number|null>(null);
  readonly retryFeedback=signal<Record<number,string>>({});
  retryMailboxProcessing(id:number):void {
    if(this.authService.isViewingAsClient() || this.retryAccountId()!==null)return;
    this.retryAccountId.set(id);this.retryFeedback.update(value=>({...value,[id]:''}));
    this.integrationsService.retryMailboxProcessing(id).pipe(finalize(()=>this.retryAccountId.set(null))).subscribe({
      next:result=>{const detail=documentRetryMessage(result);this.retryFeedback.update(value=>({...value,[id]:detail}));
        this.messageService.add({severity:result.skipped?'warn':'success',summary:'ניסיון עיבוד חוזר',detail,key:'br',life:10000});this.syncState.refresh();},
      error:error=>{const detail=documentRetryError(error.status);this.retryFeedback.update(value=>({...value,[id]:detail}));
        this.messageService.add({severity:'error',summary:'העיבוד לא חודש',detail,key:'br'});this.syncState.refresh();}
    });
  }

  readonly authService = inject(AuthService);
  readonly syncState = inject(GmailSyncStateService);
  private readonly integrationsService = inject(IntegrationsService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly genericService = inject(GenericService);
  private readonly fb = inject(FormBuilder);

  readonly showRunDiagnostics = environment.enableDevTools;
  readonly buttonSize = ButtonSize;
  readonly buttonColor = ButtonColor;
  readonly inputsSize = inputsSize;
  readonly isMobile = computed(() => this.genericService.isMobile());

  durableState(value:string):string {return ({WAITING:'ממתין לעיבוד',READY:'ממתין',PAGING:'סורק הודעות',DONE:'הסריקה הסתיימה',RUNNING:'בתהליך',RETRY:'ממתין לניסיון נוסף',COMPLETE:'הושלם',PARTIAL:'נדרש טיפול',ATTENTION:'נדרש טיפול'} as Record<string,string>)[value]||value;}
  runCount(counts:Record<string,number>, states:string[]):number {return states.reduce((sum,state)=>sum+(counts?.[state]||0),0);}
  latestRunFor(id: number): GmailDurableRun | undefined {
    return this.syncState.status()?.runs?.find(run => run.integrationId === id);
  }
  activeRunsFor(id: number): GmailDurableRun[] {
    return (this.syncState.status()?.runs ?? []).filter(run => run.integrationId === id &&
      (['RUNNING', 'RETRY'].includes(run.pull_state) || run.processing_state === 'RUNNING'));
  }
  totalCount(counts: Record<string, number>): number {
    return Object.values(counts ?? {}).reduce((sum, count) => sum + count, 0);
  }
  readonly connectingProvider = signal<'GOOGLE' | 'MICROSOFT' | null>(null);
  readonly connecting = computed(() => this.connectingProvider() !== null);
  private readonly connectionProvider=signal<'GOOGLE'|'MICROSOFT'>('GOOGLE');
  syncErrorMessage(account: GmailAccountSyncStatus): string { return emailSyncErrorMessage(account.lastSyncError); }
  connectionIssueMessage(account: GmailAccountSyncStatus): string { return emailConnectionIssueMessage(account.lastSyncError); }
  isConnectingProvider(provider:'GOOGLE'|'MICROSOFT'):boolean {return this.connectingProvider()===provider || (this.connectionLoading()&&this.connectionProvider()===provider);}

  readonly routingAccountId=signal<number|null>(null);
  readonly routingConfig=signal<EmailRoutingConfiguration|null>(null);
  readonly routingBusy=signal(false);
  readonly routingError=signal('');
  readonly routingForm=this.fb.group({businessNumber:this.fb.control<string|null>(null,Validators.required)});
  readonly routingRules=signal<FormGroup[]>([]);
  readonly routingBusinesses=computed(()=>this.routingConfig()?.businesses.map(b=>({value:b.businessNumber,name:b.businessName||b.businessNumber}))||[]);
  readonly ruleActions=[{value:'BLOCK',name:'לא לייבא מסמכים'},{value:'BUSINESS',name:'לשייך לעסק'}];
  readonly connectionDialogVisible=signal(false);
  readonly connectionLoading=signal(false);
  readonly connectionError=signal('');
  readonly connectionBusinesses=signal<{value:string;name:string}[]>([]);
  readonly connectionForm=this.fb.group({businessNumber:this.fb.control<string|null>(null,Validators.required)});
  private connectionIntegrationId:number|undefined;
  private ruleForm(rule?:EmailRoutingConfiguration['settings']['rules'][number]):FormGroup{
    return this.fb.group({sender:[rule?.sender||'',[Validators.required,Validators.email]],action:[rule?.action||'BLOCK',Validators.required],businessNumber:[rule?.businessNumber||null]});
  }
  openRouting(id:number):void{
    if(this.authService.isViewingAsClient()||this.routingBusy())return;
    this.routingAccountId.set(id);this.routingConfig.set(null);this.routingError.set('');this.routingBusy.set(true);
    this.integrationsService.getEmailRouting(id).subscribe({
      next:config=>{this.routingConfig.set(config);this.routingForm.enable();this.routingForm.reset({businessNumber:config.settings.businessNumber||(config.businesses.length===1?config.businesses[0].businessNumber:null)});this.routingRules.set(config.settings.rules.map(rule=>this.ruleForm(rule)));this.routingBusy.set(false);},
      error:()=>{this.routingError.set('לא ניתן לטעון את הגדרות המייל.');this.routingBusy.set(false);},
    });
  }
  addRoutingRule():void{
    if(this.routingRules().length<100)this.routingRules.update(rules=>[...rules,this.ruleForm()]);
  }
  removeRoutingRule(index:number):void{
    this.routingRules.update(rules=>rules.filter((_,i)=>i!==index));
  }
  saveRouting():void{
    const id=this.routingAccountId(),config=this.routingConfig();
    if(id===null||!config||this.routingBusy()||this.authService.isViewingAsClient())return;
    const rules=this.routingRules().map(form=>form.getRawValue());
    if(this.routingForm.invalid||this.routingRules().some(form=>form.invalid)||rules.some(rule=>rule.action==='BUSINESS'&&!rule.businessNumber)){
      this.routingForm.markAllAsTouched();this.routingRules().forEach(form=>form.markAllAsTouched());this.routingError.set('בחרו עסק והשלימו את פרטי הכללים לפני השמירה.');return;
    }
    this.routingBusy.set(true);this.routingError.set('');
    this.routingRules().forEach(form=>form.disable());
    this.integrationsService.saveEmailRouting(id,{businessNumber:this.routingForm.getRawValue().businessNumber,rules:rules.map(rule=>rule.action==='BLOCK'?{sender:rule.sender.trim(),action:'BLOCK'}:{sender:rule.sender.trim(),action:'BUSINESS',businessNumber:rule.businessNumber})}).subscribe({
      next:()=>{this.routingBusy.set(false);this.routingAccountId.set(null);this.messageService.add({severity:'success',summary:'הגדרות המייל נשמרו',key:'br'});},
      error:()=>{this.routingBusy.set(false);this.routingRules().forEach(form=>form.enable());this.routingError.set('לא ניתן לשמור. יש לבחור עסק תקף ולבדוק שכתובות השולחים מלאות ושאין כללי שיוך סותרים.');},
    });
  }
  /** ייבוא ידני (מהדיאלוג) רץ כרגע — נועל את הדיאלוג ומונע שליחה כפולה. */
  readonly importing = signal(false);
  /** מזהי אינטגרציה שמתנתקים כרגע (spinner per-account). */
  readonly disconnecting = signal<ReadonlySet<number>>(new Set());

  /** דיאלוג "משוך מסמכים עכשיו" — בחירת חשבונות לייבוא ידני. */
  readonly importDialogVisible = signal(false);
  readonly manualImportForm = this.fb.group({
    fromDate: this.fb.control<Date | null>(null, Validators.required),
    toDate: this.fb.control<Date | null>(null, Validators.required),
  });

  manualRangeValid(): boolean {
    const { fromDate, toDate } = this.manualImportForm.getRawValue();
    const min = this.minFromDate();
    const max = this.maxToDate();
    return this.manualImportForm.valid && !!fromDate && !!toDate && !!min && !!max
      && Number.isFinite(fromDate.getTime()) && Number.isFinite(toDate.getTime())
      && fromDate >= min && toDate <= max && fromDate <= toDate;
  }
  /** מזהי החשבונות המסומנים בדיאלוג; מאותחל מחדש בכל פתיחה. */
  readonly selectedImportIds = signal<ReadonlySet<number>>(new Set());

  /**
   * חשבונות שאפשר למשוך מהם ידנית: ACTIVE שגם השלימו משיכה ראשונית.
   * EXPIRED וחשבונות שטרם ביצעו משיכה ראשונית מוצגים בדיאלוג כמושבתים,
   * עם הסבר (אותו כלל נאכף גם בשרת).
   */
  readonly selectableAccounts = computed(() =>
    this.syncState.accounts().filter((a) => this.isImportSelectable(a)),
  );
  readonly hasImportSelection = computed(() => this.selectedImportIds().size > 0);

  /** טופס טווח תאריכים לכל חשבון (נבנה לפי דרישה, נשמר בין רינדורים). */
  private readonly importForms = new Map<number, FormGroup>();

  readonly minFromDate = computed(() => this.isoToLocalDate(this.syncState.status()?.minFromDate));
  readonly maxToDate = computed(() => this.isoToLocalDate(this.syncState.status()?.maxToDate));

  ngOnInit(): void {
    // רענון בכל כניסה למסך; אם ייבוא רץ — השירות ממשיך/מחדש את ה-polling.
    if (!this.authService.isViewingAsClient()) this.syncState.refresh();
  }

  isDisconnecting(integrationId: number): boolean {
    return this.disconnecting().has(integrationId);
  }

  /** טופס טווח התאריכים של חשבון מסוים (נוצר בפעם הראשונה שהוא נדרש). */
  importFormFor(integrationId: number): FormGroup {
    let form = this.importForms.get(integrationId);
    if (!form) {
      form = this.fb.group({
        fromDate: this.fb.control<Date | null>(null, Validators.required),
        toDate: this.fb.control<Date | null>(null, Validators.required),
      });
      this.importForms.set(integrationId, form);
    }
    return form;
  }

  /** התאריך המינימלי המותר ל-"עד תאריך" — לא לפני ה-fromDate שנבחר. */
  minToDateFor(integrationId: number): Date | null {
    const from = this.importFormFor(integrationId).controls['fromDate'].value as Date | null;
    return from ?? this.minFromDate();
  }

  /** מפנה למסך ההסכמה של Google לחיבור חשבון (נוסף); החזרה נוחתת בהגדרות. */
  connectGmail(integrationId?: number,provider:'GOOGLE'|'MICROSOFT'='GOOGLE'): void {
    if(this.connecting()||this.connectionLoading()||this.authService.isViewingAsClient())return;
    this.connectionProvider.set(provider);
    this.connectionIntegrationId=integrationId;this.connectionDialogVisible.set(false);this.connectionLoading.set(true);this.connectionError.set('');this.connectionForm.reset();this.connectionBusinesses.set([]);
    const request=integrationId===undefined?this.integrationsService.getEmailRoutingOptions():this.integrationsService.getEmailRouting(integrationId);
    request.subscribe({next:config=>{
      this.connectionBusinesses.set(config.businesses.map(b=>({value:b.businessNumber,name:b.businessName||b.businessNumber})));
      const previous='settings' in config?(config as EmailRoutingConfiguration).settings.businessNumber:null;
      this.connectionForm.setValue({businessNumber:config.businesses.length===1?config.businesses[0].businessNumber:previous});
      this.connectionLoading.set(false);
      if(config.businesses.length===1){this.confirmConnection();return;}
      this.connectionDialogVisible.set(true);
      if(!config.businesses.length)this.connectionError.set('יש להוסיף עסק בחשבון לפני חיבור תיבת מייל.');
    },error:()=>{this.connectionLoading.set(false);this.connectionDialogVisible.set(true);this.connectionError.set('לא ניתן לטעון את רשימת העסקים. סגרו את החלון ונסו שוב.');}});
  }

  confirmConnection(): void {
    if(this.connecting()||this.connectionLoading()||this.authService.isViewingAsClient())return;
    const businessNumber=this.connectionForm.getRawValue().businessNumber;
    if(!businessNumber||!this.connectionBusinesses().some(b=>b.value===businessNumber)){this.connectionForm.markAllAsTouched();return;}
    const provider=this.connectionProvider();
    this.connectingProvider.set(provider);
    const request=provider==='MICROSOFT'?this.integrationsService.getOutlookConnectUrl(this.connectionIntegrationId,businessNumber):this.integrationsService.getGoogleConnectUrl(this.connectionIntegrationId,businessNumber);
    request.pipe(finalize(()=>this.connectingProvider.set(null))).subscribe({
      next: ({ url }) => {
        this.connectingProvider.set(null);
        this.connectionDialogVisible.set(false);
        this.navigateToProvider(url);
      },
      error: () => {
        this.connectingProvider.set(null);
        this.connectionDialogVisible.set(true);
        this.connectionError.set('לא ניתן להתחיל את חיבור חשבון המייל. אפשר לנסות שוב.');
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: 'לא ניתן להתחיל את חיבור חשבון המייל. נסה שוב.',
          life: 4000,
          key: 'br',
        });
      },
    });
  }

  private navigateToProvider(url: string): void {
    window.location.href = url;
  }

  @HostListener('window:pageshow', ['$event'])
  onPageShow(event: PageTransitionEvent): void {
    if (!event.persisted) return;
    this.connectingProvider.set(null);
    this.connectionLoading.set(false);
    this.connectionDialogVisible.set(false);
    if (!this.authService.isViewingAsClient()) this.syncState.refresh();
  }

  /** האם חשבון ניתן לבחירה בדיאלוג: מחובר (ACTIVE) וגם השלים משיכה ראשונית. */
  isImportSelectable(account: GmailAccountSyncStatus): boolean {
    return account.connected && account.initialImportCompleted;
  }

  /** פותח את דיאלוג "משוך מסמכים עכשיו"; כל החשבונות הזמינים מסומנים כברירת מחדל. */
  openImportDialog(): void {
    if (this.importing()) return;
    this.selectedImportIds.set(new Set(this.selectableAccounts().map((a) => a.id)));
    this.manualImportForm.reset();
    this.importDialogVisible.set(true);
  }

  closeImportDialog(): void {
    if (this.importing()) return;
    this.importDialogVisible.set(false);
  }

  isSelectedForImport(integrationId: number): boolean {
    return this.selectedImportIds().has(integrationId);
  }

  toggleImportAccount(account: GmailAccountSyncStatus): void {
    if (!this.isImportSelectable(account) || this.importing()) return;
    const next = new Set(this.selectedImportIds());
    if (next.has(account.id)) next.delete(account.id);
    else next.add(account.id);
    this.selectedImportIds.set(next);
  }

  /** "בחר הכל" — מסמן רק חשבונות זמינים (EXPIRED וללא משיכה ראשונית לא נבחרים). */
  selectAllImportAccounts(): void {
    if (this.importing()) return;
    this.selectedImportIds.set(new Set(this.selectableAccounts().map((a) => a.id)));
  }

  clearImportSelection(): void {
    if (this.importing()) return;
    this.selectedImportIds.set(new Set());
  }

  /** ייבוא מהחשבונות שנבחרו בדיאלוג (כפתור האישור). */
  importSelected(): void {
    if (this.importing() || !this.hasImportSelection() || !this.manualRangeValid()) {
      this.manualImportForm.markAllAsTouched();
      return;
    }
    const { fromDate, toDate } = this.manualImportForm.getRawValue();
    this.importing.set(true);
    this.manualImportForm.disable();
    this.integrationsService.importGmail(
      [...this.selectedImportIds()], this.dateToApiString(fromDate), this.dateToApiString(toDate),
    ).subscribe({
      next: (result) => {
        this.importing.set(false);
        this.manualImportForm.enable();
        this.importDialogVisible.set(false);
        if(result.started){
          this.messageService.add({severity:'info',summary:'המשיכה התחילה',detail:'המשיכה והעיבוד ממשיכים בהדרגה. ההתקדמות תוצג במסך זה.',key:'br'});
          this.syncState.refresh(); return;
        }
        const failed = result.perAccount.filter((a) => a.error);
        const reviewRequired = result.perAccount.reduce((total, account) => total + (account.reviewRequired || 0), 0);
        const passwordRequired = result.perAccount.reduce((total, account) => total + (account.passwordRequired || 0), 0);
        const filtered = result.perAccount.reduce((total, account) => total + (account.filteredAttachments || 0), 0);
        this.messageService.add({
          severity: failed.length > 0 ? 'warn' : 'success',
          summary: 'ייבוא הושלם',
          detail:
            `יובאו ${result.totalImported} מסמכים חדשים` +
            (passwordRequired ? `; ${passwordRequired} מסמכים דורשים סיסמה ונשמרו לטיפול במסמכי העסק` : '') +
            `; ${result.totalAlreadyImported} כבר קיימים; ${result.totalSkipped} דולגו בעת קליטה` +
            `; ${filtered} סוננו לפני קליטה` +
            (reviewRequired ? `; ${reviewRequired} קבצים דורשים בדיקה ולא סומנו כלא רלוונטיים` : '') +
            (failed.length > 0
              ? ` (נכשלו: ${failed.map((a) => a.accountEmail ?? `חשבון ${a.integrationId}`).join(', ')})`
              : ''),
          life: 5000,
          key: 'br',
        });
        this.syncState.refresh();
      },
      error: (err) => {
        // הדיאלוג נשאר פתוח לניסיון חוזר; רענון תופס רשימת חשבונות לא עדכנית
        // (למשל חשבון שנבחר והפך EXPIRED בינתיים — השרת מחזיר 404).
        this.importing.set(false);
        this.manualImportForm.enable();
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: err?.error?.message ?? 'לא ניתן היה לייבא מהחשבונות. נסה שוב.',
          life: 5000,
          key: 'br',
        });
        this.syncState.refresh();
      },
    });
  }

  startImport(account: GmailAccountSyncStatus): void {
    if (this.syncState.isStarting(account.id) || account.lastSyncStatus === 'RUNNING') return;
    const form = this.importFormFor(account.id);
    form.markAllAsTouched();
    const { fromDate, toDate } = form.getRawValue() as { fromDate: Date | null; toDate: Date | null };
    if (form.invalid || !fromDate || !toDate) return;
    if (fromDate.getTime() > toDate.getTime()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'טווח לא תקין',
        detail: 'תאריך ההתחלה חייב להיות לפני תאריך הסיום',
        life: 4000,
        key: 'br',
      });
      return;
    }

    this.syncState.startInitialImport(
      account.id,
      this.dateToApiString(fromDate),
      this.dateToApiString(toDate),
    );
  }

  /** מבקש אישור ואז מנתק את הרשאת הגישה לחשבון Gmail ספציפי. */
  confirmDisconnectGmail(account: GmailAccountSyncStatus): void {
    if (this.isDisconnecting(account.id)) return;
    this.confirmationService.confirm({
      header: 'ניתוק הרשאת Gmail',
      message: `האם לנתק את חשבון ${account.accountEmail ?? 'ה-Gmail'}? לאחר הניתוק לא נוכל למשוך מסמכים חדשים ממנו.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'נתק הרשאה',
      rejectLabel: 'ביטול',
      accept: () => this.disconnectGmail(account.id),
    });
  }

  private disconnectGmail(integrationId: number): void {
    this.setDisconnecting(integrationId, true);
    this.integrationsService.disconnectGoogleIntegration(integrationId).subscribe({
      next: () => {
        this.setDisconnecting(integrationId, false);
        this.syncState.refresh();
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: 'הרשאת Gmail נותקה בהצלחה',
          life: 4000,
          key: 'br',
        });
      },
      error: () => {
        this.setDisconnecting(integrationId, false);
        this.syncState.refresh();
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: 'לא הצלחנו לנתק את הרשאת Gmail. נסה שוב.',
          life: 4000,
          key: 'br',
        });
      },
    });
  }

  private setDisconnecting(integrationId: number, value: boolean): void {
    const next = new Set(this.disconnecting());
    if (value) next.add(integrationId);
    else next.delete(integrationId);
    this.disconnecting.set(next);
  }

  /** Date → YYYY-MM-DD בחלקים מקומיים (בלי הסטת UTC), כמו dateToApiString בהגדרות. */
  private dateToApiString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** YYYY-MM-DD → Date בחצות מקומית (בלי הסטת UTC), עבור minDate/maxDate של הפיקר. */
  private isoToLocalDate(isoDate: string | undefined): Date | null {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
    const [y, m, d] = isoDate.split('-');
    const date = new Date(+y, +m - 1, +d);
    return isNaN(date.getTime()) ? null : date;
  }
}
