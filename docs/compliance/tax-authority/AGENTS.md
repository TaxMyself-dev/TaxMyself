# Tax Authority compliance evidence

## Purpose

Maintains an official-primary-source map of Israeli Tax Authority requirements
relevant to Keepintax document issuance, computerized bookkeeping, VAT/SHAAM
interfaces, uniform files, security, retention, testing, and software
registration. It is engineering evidence, not legal or accounting advice.

## Key files

- `README.md` — scope, authority hierarchy, limitations, and maintenance.
- `source-index.md` / `sources/` — source metadata and unchanged retained PDFs.
- `requirements-matrix.md` — requirement-to-source-to-implementation evidence.
- `gaps-and-roadmap.md` — prioritized gaps and approval gates.
- `testing-and-certification.md` — verification and official-registration path.
- `shaam-reconciliation.md` — reconciliation with the earlier SHAAM audit.
- `shaam-integration-lessons.md` — current engineering and operational
  invariants learned from OAuth scopes, token lifecycle, allocation recovery,
  observability, and the separate Uniform File Daily Token integration.
- `shaam-security-incident-runbook.md` — evidence-preserving incident response,
  escalation roles and the 72-hour reporting deadline.
- `shaam-security-monitoring.md` — safe application security events and the
  manual Google Cloud alert/channel activation procedure.

## Main flow

Start with the source index, classify each statement by authority, map it to
repository evidence without claiming certification, and open separately
approved implementation tasks for gaps. Recheck dynamic official pages and
effective dates before every production decision.

## Related topics

- `backend/src/documents/AGENTS.md`
- `backend/src/shaam/AGENTS.md`
- `backend/src/reports/AGENTS.md`
- `docs/research/shaam-integration-audit.md`
- `docs/coordination/QUALITY_GATES.md`
