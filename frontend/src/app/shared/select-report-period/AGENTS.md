## Purpose
Small reusable form-fragment component that renders a reporting-period-type selector wired into a parent's `FormGroup`.

## Key entities/files
- `select-report-period.component.ts` — class `SelectMonthFormatComponent`, selector `app-select-report-period`. Inputs: `oneMonth`, `parentForm`, `optionsTypes` (defaults to `reportingPeriodTypeOptionsList` from `shared/enums`), `title`. Emits `onSelectionChange` when the period type changes.
- `select-report-period.component.html`/`.scss` — dropdown markup.

## Main flows
- Render a period-type dropdown bound into the parent's reactive form.
- Emit a selection-change event so the parent can react (e.g. adjust its own date-range validators).

## Related topics
- Frontend pages: my-storage (currently the only consumer — binds `[parentForm]` and listens to `(onSelectionChange)` to set form validators)
