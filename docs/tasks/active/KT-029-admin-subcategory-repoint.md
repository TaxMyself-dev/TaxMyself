# KT-029 - Save admin sub-category card reassignment

- Status: `INTEGRATED`
- Task manager: primary integration manager
- Worker: primary agent in isolated worktree
- Worktree: `C:/Users/harel/.codex/worktrees/kt029/taxmyself-dev`
- Branch: `codex/kt-029-admin-subcategory-repoint`
- Base commit: `89160d84474262e4a18528ef62f13db581c27221`

## Business outcome

An admin can change the card for a SYSTEM sub-category such as עסק/ספקים, and sees success or failure clearly.

## Acceptance criteria

- [x] Changing account `60000` to `60010` persists the new relation and reloads the new card.
- [x] Clearing the card clears both the FK and relation.
- [x] The edit dialog stays open on failure and closes only on success, with a toast in either case.
- [x] Focused backend test and backend/frontend builds pass.

## Scope and constraints

- In scope: admin SYSTEM sub-category edit path, focused regression, UI feedback, topic docs.
- Out of scope: production data updates, existing expense reclassification, schema, card-law edits.
- Required reading: root/topic instructions and categories redesign master plan.
- Approval boundaries: no production access or deployment.

## Handoff

- Result: implementation complete and integrated; source push pending.
- Commit hash(es): worker `883177e5`; integrated `bb28cfc1`.
- Changed files: backend admin update path/test, frontend admin category editor, topic docs, this task file.
- Tests and exact results: focused Jest 2/2 passed; Nest build exit 0; Angular production build exit 0 (existing budget/CommonJS warnings).
- Known pre-existing failures: none encountered in executed checks.
- Schema / production / security / accounting / external impact: no schema or production-data change; future SYSTEM sub-category mapping now saves correctly, existing expenses and journals are untouched.
- Risks and manual checks: after a separate deploy, repoint עסק/ספקים from 60000 to 60010 and confirm a refreshed page still shows 60010.
- Documentation updated: backend expenses and frontend category-management topic docs.

## Integration

- Reviewed by: primary integration manager; full diff and `git show --check` clean.
- Integrated commit: `bb28cfc1` on `origin/main` base `89160d84`.
- Combined verification: the tested worker and integration Git trees are identical (`6d717f76`); focused Jest 2/2, Nest build, and Angular production build all passed on that exact tree.
- `origin/main` verification: pending push.
- User-visible run instructions: after a separate backend/frontend deployment, repoint עסק/ספקים from 60000 to 60010 and reload the page to verify persistence; existing posted expenses remain unchanged.
