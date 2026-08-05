## Purpose
Multi-step signup wizard (personal → spouse → children → business, or a shorter company-only path) that collects registration data and calls `AuthService.SignUp` to create the account.

## Key entities/files
- `register.page.ts` — `RegisterPage` (standalone component). Builds one `FormGroup` per step (`personalForm`/`companyForm`, `spouseForm`, `childrenForm` with a dynamic `FormArray`, `businessForm` with a dynamic `FormArray`), step-navigation state machine (`onNextBtnClicked`/`onBackBtnClicked`), and `handleFormRegister()` which reshapes the combined form value into the API payload.
- `register.service.ts` — `RegisterService`. Only endpoint: `GET auth/get-cities` (city autocomplete list).
- `regiater.enum.ts` — `RegisterFormControls` (field name constants) and `RegisterFormModules` (step identifiers: personal/spouse/children/business/company/validation).
- `register.page.html` / `.scss` — step UI, marketing side-images per step (`registerImages`), stepper component.
- `register.page.spec.ts` / `register.service.spec.ts` — minimal/placeholder Angular test scaffolding.

## Main flows
- Step progression driven by `selectedFormModule` signal + an `effect()` that sets title/subtitle/step index per module; branches on family status (single/married/divorced) and self-employment flags (`isIndependent`/`isSpouseIndependent`) to decide which steps are shown/skipped.
- Company toggle (`toggleCompanyMode`) swaps the PERSONAL step between the private-individual form and a dedicated company form, resetting the unused one.
- Dynamic children rows auto-append a new blank row once the last one is filled (`handleChildRowChange`), and validation ignores a trailing empty row.
- Dynamic business rows are pre-seeded from `prepareBusinessLines()` based on independence flags before the BUSINESS step is shown.
- `handleFormRegister()` clones the form value, reshapes company data into the personal/business payload, strips empty child/business rows, converts dates to `YYYY-MM-DD`, and calls `authService.SignUp(formData)`; on success navigates to `/login` (passing email/password in router state), on error shows a toast via `AuthService.getSignupErrorMessage`.
- Dev-only `fillDevDefaults()` pre-fills the personal form outside production builds.

## Related topics
- Backend: auth (SignUp endpoint, get-cities), cities.
- Frontend shared: none directly imported beyond generic input/button/stepper components (`SharedModule`, `StepperComponent`, `InputTextComponent`, `InputDateComponent`, `InputSelectComponent`).
- Depended on by: login (post-registration redirect passes credentials via router state).
