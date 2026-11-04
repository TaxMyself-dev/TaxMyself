# Lychee intake from the saved spouse phone

Approved requirement: User.phone and existing User.spousePhone both identify the
same user account and all its businesses. One business imports automatically;
multiple businesses always require selection per document from either sender.
Continue WhatsApp worktree on b6e0dd83; do not deploy, push or send real messages.

Shared normalized phone lookup checks both fields in a single OR query bounded
to two account rows. A number on two accounts (primary/primary, primary/spouse,
spouse/spouse) remains ambiguous. Two matching fields on one row are one account.
No business-phone lookup, spouse-only business filtering or new phone field.

Intake, result recipient checks and question delivery use the same lookup. Prompt
preflight now checks cross-account uniqueness as well as the recorded owner,
either current saved phone, existing business ownership and original sender.
Changing/removing the spouse phone prevents new account-scoped sends. Responses
and questions return to the original sender; quote ownership remains phone-scoped.
Phone-only rejection explanations keep their existing restricted behavior.

No schema, environment or profile UI changes: spousePhone already exists and is
editable through the existing account spouse settings. No data edits/backfill.
The user explicitly authorizes the spouse profile phone as an intake identity;
no new phone verification enrollment flow is introduced by this request.

Verification: 18 suites / 259 mocked tests passed. Cases cover both senders with
one/two businesses, spouse question/result delivery, normalization, cross-account
collision cancellation and existing receipt/dedup behavior. Backend build and
diff check passed. No live messages, cloud/data changes, deployment or push.
