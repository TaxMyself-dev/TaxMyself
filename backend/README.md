# Keepintax backend

NestJS API for authentication, businesses, billing, documents, expenses,
bookkeeping, reports, banking integrations and background imports.

## Development

Use npm because this package has a `package-lock.json`.

```bash
npm ci
npm run start:dev
```

Run focused tests for changed modules and then build:

```bash
npm test -- --runInBand <spec-file>
npm run build
```

Before changing a module, read the root `AGENTS.md` and that module's nearest
`AGENTS.md`. Work involving categories, booking accounts, journal entries or
reports must also follow `docs/redesign/categories-redesign-master-plan.md`.

Do not connect to live production or use production credentials. The binding
delivery and environment rules are under `docs/coordination/`.
