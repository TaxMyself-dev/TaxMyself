## Purpose

Creates expense/income categories and subcategories with accounting recognition
defaults, including accountant-deferred mappings.

## Key entities/files

- `add-category.component.ts` builds category and subcategory payloads and
  enforces form relationships.

## Main flows

- Recognition, equipment, VAT, tax, reduction and P&L defaults are accounting
  behavior. Read the redesign master plan before changing their meaning.
- Deferred-to-accountant rows clear client-owned accounting values; do not send
  a partially active legacy `law` shape for those rows.

## Related topics

- `frontend/src/app/shared/category-management/AGENTS.md`
- `backend/src/expenses/AGENTS.md`
- `backend/src/bookkeeping/AGENTS.md`
