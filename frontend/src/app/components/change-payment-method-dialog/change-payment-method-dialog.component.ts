import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { InputSelectComponent } from 'src/app/components/input-select/input-select.component';
import { AuthService } from 'src/app/services/auth.service';
import { BillingStateService } from 'src/app/services/billing-state.service';
import { ISelectItem } from 'src/app/shared/interface';

/**
 * The ONLY origin we exchange postMessage with. Confirmed from the official
 * CardCom Open Fields example (github.com/CardCom/OpenFields-FrontEnd) — all
 * iframes are served from this host and all protocol messages flow through the
 * hidden master iframe. Never widen this and never use '*' as targetOrigin.
 */
const CARDCOM_ORIGIN = 'https://secure.cardcom.solutions';

/** Open Fields message actions we accept from CardCom. Everything else is dropped. */
const ALLOWED_ACTIONS = ['HandleSubmit', 'HandleEror', 'handleValidations'] as const;

/**
 * ─── Styling the CardCom-hosted inputs ──────────────────────────────────────
 *
 * The card-number and CVV inputs live in CardCom-hosted documents, so the ONLY
 * way to style them is the CSS string relayed by the master frame's `setStyles`
 * message. Everything below is written against the ACTUAL hosted DOM, which is:
 *
 *   cardNumber:  <body>
 *                  <i id="cc-icon" class="credit-card"></i>   ← brand overlay
 *                  <input class="cardNumber" id="cardNumber" type="tel" ...>
 *                also loads CardNumber.css, which sets
 *                  body { display: flex; justify-content: center; }
 *                  .credit-card { position: absolute; left: 10px; top: 9px; }
 *
 *   CVV:         <body>
 *                  <input class="cvvField" id="cvvField" type="tel" ...>
 *                and loads NO stylesheet at all.
 *
 * Consequences encoded below:
 *
 *  1. Selectors are `#cardNumber` / `#cvvField`, matching CardCom's own example.
 *     A bare `input` selector works today only because CardNumber.css happens
 *     not to style the input — an ID selector is not at the mercy of that.
 *
 *  2. `#cc-icon` is hidden. It is absolutely positioned at a fixed left/top
 *     tuned for CardCom's own ~57px field, so it neither aligns with our field
 *     nor exists on any native input in this app — the single most obvious
 *     "this is a third-party field" cue.
 *
 *  3. `body { display: block; margin: 0 }` overrides CardNumber.css's flex
 *     centring. Our <style> is appended to <head> after their <link>, so equal
 *     specificity resolves in our favour.
 *
 *  4. `overflow: hidden` on html/body. Without it the default 8px body margin
 *     plus the input's intrinsic `size=20` width overflow the iframe and Chrome
 *     paints a horizontal scrollbar inside the field.
 *
 *  5. Heights are explicit pixels, not `height: 100%`. A percentage height only
 *     resolves against a definite parent height, which is exactly the kind of
 *     thing that silently degrades to `auto` — and `auto` here means a default
 *     ~21px native input. CardCom's own example also uses fixed pixels.
 *
 * Values are taken from what the app actually renders, not invented:
 *   - border 1px rgb(186,183,183) + radius 20px : global.scss `.p-select`
 *   - text colour #334155                       : Aura `form.field.color` (slate.700)
 *   - placeholder `gray`                        : global.scss `input.p-inputtext::placeholder`
 *   - padding-inline 0.75rem                    : Aura `form.field.padding.x`
 *   - font stack                                : `--ion-font-family` (global.scss)
 */

/** Field height, in px. Must equal `$field-height` in the component stylesheet. */
const FIELD_HEIGHT_PX = 40;

/**
 * Shared reset + typography. Identical for both fields, so they cannot drift
 * from each other in height, radius, border or type.
 */
const fieldCss = (selector: string) => `
  html, body { height: 100%; margin: 0; padding: 0; background: transparent; overflow: hidden; }
  body { display: block; }
  #cc-icon { display: none !important; }
  ${selector} {
    box-sizing: border-box;
    display: block;
    width: 100%;
    height: ${FIELD_HEIGHT_PX}px;
    margin: 0;
    padding: 0 0.75rem;
    border: 1px solid rgb(186, 183, 183);
    border-radius: 20px;
    background: #ffffff;
    color: #334155;
    font-family: 'Simpler', 'Open Sans Hebrew', 'Roboto', Arial, Helvetica, sans-serif;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
    line-height: normal;
    direction: ltr;
    text-align: left;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
    transition: border-color 0.2s;
  }
  ${selector}::placeholder { color: gray; opacity: 1; }
  ${selector}.invalid { border-color: #e24c4c; }
  ${selector}::-webkit-outer-spin-button, ${selector}::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  ${selector}::-ms-reveal, ${selector}::-ms-clear { display: none; }
`;

/**
 * CardCom applies our CSS with `styleEl.innerText = css`. The innerText SETTER
 * turns every newline into a <br> element, and a <style> element's sheet is
 * built from its child *text* nodes only — so the newlines are dropped and the
 * remaining fragments are concatenated. Collapsing to a single line up front
 * makes that transformation a no-op instead of something to stay lucky about.
 */
const oneLine = (css: string) => css.replace(/\s+/g, ' ').trim();

const CARD_FIELD_CSS = oneLine(fieldCss('#cardNumber'));
const CVV_FIELD_CSS = oneLine(fieldCss('#cvvField'));

type DialogState = 'loading' | 'ready' | 'submitting' | 'waiting' | 'timeout';

/**
 * Embedded CardCom Open Fields dialog for replacing the saved payment method.
 *
 * The card number and CVV live inside CardCom-hosted iframes (PCI stays with
 * CardCom); expiry and all chrome are ours. The backend LowProfile deal is the
 * exact same CreateTokenOnly + J2 deal as the legacy redirect flow, and the
 * CardCom webhook remains the source of truth: browser-side HandleSubmit success
 * only moves the dialog to a "waiting" state, which polls
 * billing/change-payment-method/status for THIS attempt's LowProfileId until it
 * reports SUCCESS or FAILED. Polling continues (more slowly) even after the
 * dialog switches to its "still processing" copy, so a late webhook — or the
 * backend's reconciliation fallback, which those later ticks trigger — still
 * completes the flow without user action.
 *
 * Fallback: if Open Fields fails to initialize, the user is offered the legacy
 * hosted-page redirect using the SAME LowProfile's paymentUrl (no second deal).
 */
@Component({
  selector: 'app-change-payment-method-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogModule, ButtonComponent, InputSelectComponent],
  templateUrl: './change-payment-method-dialog.component.html',
  styleUrls: ['./change-payment-method-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePaymentMethodDialogComponent {
  private readonly billingStateService = inject(BillingStateService);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);

  readonly buttonColor = ButtonColor;
  readonly buttonSize = ButtonSize;

  /** Two-way bound dialog visibility (parent opens; dialog closes itself). */
  readonly visible = model(false);

  private readonly masterFrame =
    viewChild<ElementRef<HTMLIFrameElement>>('masterFrame');
  private readonly cardNumberFrame =
    viewChild<ElementRef<HTMLIFrameElement>>('cardNumberFrame');
  private readonly cvvFrame = viewChild<ElementRef<HTMLIFrameElement>>('cvvFrame');

  // ─── State ───────────────────────────────────────────────────────────────

  readonly state = signal<DialogState>('loading');
  /** Open Fields could not be initialized — offer the redirect fallback. */
  readonly initFailed = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly lowProfileId = signal<string | null>(null);
  readonly paymentUrl = signal<string | null>(null);

  /** Per-field validity reported by CardCom via handleValidations. */
  private readonly cardNumberValid = signal<boolean | null>(null);
  private readonly cvvValid = signal<boolean | null>(null);
  private readonly reCaptchaValid = signal(true);

  readonly expiryMonth = signal<string | null>(null);
  readonly expiryYear = signal<string | null>(null);

  /** Expiry is ours (not a CardCom iframe) — validated locally. */
  readonly expiryValid = computed(() => {
    const month = this.expiryMonth();
    const year = this.expiryYear();
    if (!month || !year) return false;
    const now = new Date();
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    return (
      yearNum > now.getFullYear() ||
      (yearNum === now.getFullYear() && monthNum >= now.getMonth() + 1)
    );
  });

  /** True once the expiry was touched but is in the past — drives the inline hint. */
  readonly expiryInPast = computed(
    () => !!this.expiryMonth() && !!this.expiryYear() && !this.expiryValid(),
  );

  readonly canSave = computed(
    () =>
      this.state() === 'ready' &&
      this.cardNumberValid() === true &&
      this.cvvValid() === true &&
      this.reCaptchaValid() &&
      this.expiryValid(),
  );

  readonly isBusy = computed(
    () => this.state() === 'submitting' || this.state() === 'waiting',
  );

  // ─── Expiry selects (app-input-select requires a FormGroup) ───────────────

  readonly expiryForm = new FormGroup({
    expiryMonth: new FormControl<string | null>(null, Validators.required),
    expiryYear: new FormControl<string | null>(null, Validators.required),
  });

  readonly monthItems: ISelectItem[] = Array.from({ length: 12 }, (_, i) => {
    const mm = String(i + 1).padStart(2, '0');
    return { name: mm, value: mm };
  });

  readonly yearItems: ISelectItem[] = Array.from({ length: 15 }, (_, i) => {
    const year = String(new Date().getFullYear() + i);
    return { name: year, value: year };
  });

  // ─── Internals ─────────────────────────────────────────────────────────────

  /** Guards against a stale poll/init resolving after close or restart. */
  private generation = 0;
  private started = false;
  private initTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private masterInitSent = false;
  private framesLoaded = { master: false, cardNumber: false, cvv: false };
  private messageListenerAttached = false;

  /** How long we wait for the CardCom iframes before offering the fallback. */
  private static readonly INIT_TIMEOUT_MS = 12_000;

  constructor() {
    effect(() => {
      if (this.visible()) {
        this.start();
      } else {
        this.teardown();
      }
    });
    inject(DestroyRef).onDestroy(() => this.teardown());
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  private start(): void {
    if (this.started) return;
    this.started = true;
    this.resetState();
    this.attachMessageListener();
    this.armInitTimeout();

    const generation = ++this.generation;
    this.billingStateService
      .changePaymentMethod()
      .then((result) => {
        if (generation !== this.generation) return;
        this.paymentUrl.set(result.paymentUrl);
        // Rendering the iframes is gated on lowProfileId — set it last so the
        // master frame's load handler always finds the id ready for init.
        this.lowProfileId.set(result.lowProfileId);
      })
      .catch((err) => {
        if (generation !== this.generation) return;
        this.clearInitTimeout();
        this.initFailed.set(true);
        this.errorMessage.set(
          err?.error?.message ?? 'לא ניתן להתחיל את עדכון אמצעי התשלום כעת.',
        );
      });
  }

  private teardown(): void {
    if (!this.started) return;
    this.started = false;
    this.generation++; // cancels any in-flight poll / init / LP creation callback
    this.clearInitTimeout();
    this.detachMessageListener();
  }

  private resetState(): void {
    this.state.set('loading');
    this.initFailed.set(false);
    this.errorMessage.set(null);
    this.lowProfileId.set(null);
    this.paymentUrl.set(null);
    this.cardNumberValid.set(null);
    this.cvvValid.set(null);
    this.reCaptchaValid.set(true);
    this.expiryMonth.set(null);
    this.expiryYear.set(null);
    this.expiryForm.reset();
    this.masterInitSent = false;
    this.framesLoaded = { master: false, cardNumber: false, cvv: false };
  }

  /** Full restart after an init failure (creates a NEW LowProfile). */
  retryInit(): void {
    this.teardown();
    this.start();
  }

  onDialogHide(): void {
    // Webhook processing continues server-side regardless; pick up any result
    // that lands after close so the card view behind the dialog stays current.
    const wasWaiting = this.state() === 'waiting' || this.state() === 'timeout';
    this.visible.set(false);
    if (wasWaiting) {
      this.billingStateService.reloadBillingStateQuietly();
    }
  }

  cancel(): void {
    this.visible.set(false);
  }

  // ─── Iframe load / init handshake ─────────────────────────────────────────

  onMasterFrameLoad(): void {
    this.framesLoaded.master = true;
    this.sendInitIfReady();
    this.maybeReady();
  }

  onCardNumberFrameLoad(): void {
    this.framesLoaded.cardNumber = true;
    this.sendInitIfReady();
    this.maybeReady();
  }

  onCvvFrameLoad(): void {
    this.framesLoaded.cvv = true;
    this.sendInitIfReady();
    this.maybeReady();
  }

  /**
   * `init` carries the field CSS, and the master relays it onward as `setStyles`
   * the moment it arrives. The card-number frame only registers its `message`
   * listener on DOMContentLoaded, so an `init` sent before that frame has loaded
   * is delivered into the void and the field stays unstyled — permanently, since
   * CardCom never re-sends. Gate on ALL THREE frames, not just the master.
   */
  private sendInitIfReady(): void {
    const lowProfileId = this.lowProfileId();
    if (
      this.masterInitSent ||
      !this.framesLoaded.master ||
      !this.framesLoaded.cardNumber ||
      !this.framesLoaded.cvv ||
      !lowProfileId
    ) {
      return;
    }
    this.masterInitSent = true;
    this.postToMaster({
      action: 'init',
      cardFieldCSS: CARD_FIELD_CSS,
      cvvFieldCSS: CVV_FIELD_CSS,
      reCaptchaFieldCSS: CARD_FIELD_CSS,
      placeholder: '0000 0000 0000 0000',
      cvvPlaceholder: 'CVV',
      lowProfileCode: lowProfileId,
      language: 'he',
    });
  }

  private maybeReady(): void {
    if (
      this.state() === 'loading' &&
      !this.initFailed() &&
      this.masterInitSent &&
      this.framesLoaded.cardNumber &&
      this.framesLoaded.cvv
    ) {
      this.clearInitTimeout();
      this.state.set('ready');
    }
  }

  private armInitTimeout(): void {
    this.clearInitTimeout();
    this.initTimeoutHandle = setTimeout(() => {
      if (this.state() === 'loading' && !this.initFailed()) {
        this.initFailed.set(true);
        this.errorMessage.set('טעינת טופס הכרטיס המאובטח נמשכת זמן רב מדי.');
      }
    }, ChangePaymentMethodDialogComponent.INIT_TIMEOUT_MS);
  }

  private clearInitTimeout(): void {
    if (this.initTimeoutHandle) {
      clearTimeout(this.initTimeoutHandle);
      this.initTimeoutHandle = null;
    }
  }

  // ─── postMessage protocol (CardCom Open Fields) ───────────────────────────

  private attachMessageListener(): void {
    if (this.messageListenerAttached) return;
    this.messageListenerAttached = true;
    window.addEventListener('message', this.onCardcomMessage);
  }

  private detachMessageListener(): void {
    if (!this.messageListenerAttached) return;
    this.messageListenerAttached = false;
    window.removeEventListener('message', this.onCardcomMessage);
  }

  /**
   * Single inbound gate for CardCom messages. Hard requirements:
   *   - event.origin must be the exact CardCom origin
   *   - event.source must be OUR master iframe's contentWindow
   *   - action must be one of the known Open Fields events
   * Payloads are never logged — they belong to CardCom's protocol.
   */
  private readonly onCardcomMessage = (event: MessageEvent): void => {
    if (event.origin !== CARDCOM_ORIGIN) return;
    const masterWindow = this.masterFrame()?.nativeElement?.contentWindow ?? null;
    if (!masterWindow || event.source !== masterWindow) return;

    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (!ALLOWED_ACTIONS.includes(msg.action)) return;

    switch (msg.action) {
      case 'handleValidations':
        this.onValidationMessage(msg);
        break;
      case 'HandleSubmit':
        this.onSubmitResultMessage(msg);
        break;
      case 'HandleEror': // CardCom's official spelling
        this.onErrorMessage(msg);
        break;
    }
  };

  private onValidationMessage(msg: { field?: string; isValid?: boolean }): void {
    const isValid = msg.isValid === true;
    switch (msg.field) {
      case 'cardNumber':
        this.cardNumberValid.set(isValid);
        this.postToMaster({
          action: isValid ? 'removeCardNumberFieldClass' : 'addCardNumberFieldClass',
          className: 'invalid',
        });
        break;
      case 'cvv':
        this.cvvValid.set(isValid);
        this.postToMaster({
          action: isValid ? 'removeCvvFieldClass' : 'addCvvFieldClass',
          className: 'invalid',
        });
        break;
      case 'reCaptcha':
        this.reCaptchaValid.set(isValid);
        break;
    }
  }

  private onSubmitResultMessage(msg: { data?: { IsSuccess?: boolean; Description?: string } }): void {
    if (this.state() !== 'submitting') return;
    if (msg.data?.IsSuccess === true) {
      this.startWaitingForWebhook();
    } else {
      this.state.set('ready');
      this.errorMessage.set(
        typeof msg.data?.Description === 'string' && msg.data.Description
          ? `אימות הכרטיס נכשל: ${msg.data.Description}`
          : 'אימות הכרטיס נכשל. בדוק את הפרטים ונסה שוב.',
      );
    }
  }

  private onErrorMessage(msg: { message?: string }): void {
    const detail = typeof msg.message === 'string' && msg.message ? msg.message : null;
    if (this.state() === 'loading') {
      this.clearInitTimeout();
      this.initFailed.set(true);
      this.errorMessage.set(detail ?? 'טעינת טופס הכרטיס המאובטח נכשלה.');
      return;
    }
    if (this.state() === 'submitting' || this.state() === 'ready') {
      this.state.set('ready');
      this.errorMessage.set(detail ?? 'אירעה שגיאה בעדכון הכרטיס. נסה שוב.');
    }
  }

  private postToMaster(payload: Record<string, unknown>): void {
    const masterWindow = this.masterFrame()?.nativeElement?.contentWindow;
    if (!masterWindow) return;
    // Exact target origin — never '*'.
    masterWindow.postMessage(payload, CARDCOM_ORIGIN);
  }

  // ─── Expiry selects ────────────────────────────────────────────────────────

  onExpiryMonthChange(value: unknown): void {
    this.expiryMonth.set(typeof value === 'string' ? value : null);
  }

  onExpiryYearChange(value: unknown): void {
    this.expiryYear.set(typeof value === 'string' ? value : null);
  }

  // ─── Submit + webhook wait ─────────────────────────────────────────────────

  submit(): void {
    if (!this.canSave() || this.state() !== 'ready') return; // duplicate-submit guard
    this.errorMessage.set(null);
    this.state.set('submitting');

    // Cardholder context for CardCom (3DS requires email or phone). The card
    // number and CVV never pass through here — they live in CardCom's iframes.
    const user = this.authService.getUserDataFromLocalStorage();
    const cardOwnerName = [user?.fName, user?.lName].filter(Boolean).join(' ');

    this.postToMaster({
      action: 'doTransaction',
      // Placeholder identity number, as in the official CardCom example.
      cardOwnerId: '000000000',
      cardOwnerName: cardOwnerName || 'לקוח',
      cardOwnerEmail: user?.email ?? '',
      cardOwnerPhone: user?.phone ?? '',
      expirationMonth: this.expiryMonth(),
      expirationYear: this.expiryYear(),
      numberOfPayments: '1',
    });
  }

  /**
   * Waits for THIS attempt's outcome, correlated by the LowProfileId we
   * submitted — never by "the latest payment-method event for this user".
   *
   * Polling does not stop when the dialog switches to its "still processing"
   * copy: the loop keeps running (more slowly) for as long as the dialog is
   * open, so a late webhook — or the backend's reconciliation fallback, which
   * these later ticks trigger — can still finish the flow with no user action.
   */
  private startWaitingForWebhook(): void {
    const lowProfileId = this.lowProfileId();
    if (!lowProfileId) {
      // Cannot correlate an attempt without its id; surface it rather than
      // spinning forever on a poll that could never resolve.
      this.state.set('ready');
      this.errorMessage.set('אירעה שגיאה בעדכון הכרטיס. נסה שוב.');
      return;
    }

    this.state.set('waiting');
    const generation = this.generation;
    const isCancelled = () => generation !== this.generation || !this.visible();

    this.billingStateService
      .pollChangePaymentMethodStatus({
        lowProfileId,
        isCancelled,
        // The webhook is taking longer than expected. Keep polling — only the
        // message changes.
        onSlowdown: () => {
          if (isCancelled()) return;
          this.state.set('timeout');
        },
      })
      .then((result) => {
        if (isCancelled() || !result) return;

        if (result.status === 'SUCCESS') {
          this.messageService.add({
            severity: 'success',
            summary: 'אמצעי התשלום עודכן',
            detail: result.last4
              ? `הכרטיס המסתיים ב-${result.last4} נשמר בהצלחה.`
              : 'הכרטיס החדש נשמר בהצלחה.',
            life: 5000,
            key: 'br',
          });
          this.visible.set(false);
          return;
        }

        this.state.set('ready');
        this.errorMessage.set(
          'עדכון אמצעי התשלום נכשל. אמצעי התשלום הקודם נשאר פעיל — ניתן לנסות שוב.',
        );
      });
  }

  // ─── Fallback (legacy redirect, SAME LowProfile) ───────────────────────────

  redirectFallback(): void {
    const url = this.paymentUrl();
    if (!url) return;
    // Same marker the legacy flow writes — my-account shows the CHANGE_PM
    // banner and polls billing/me when the user returns from CardCom.
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('tm.cardcomFlow', 'CHANGE_PM');
    }
    window.location.href = url;
  }
}
