# Backend local startup performance

Measured on 2026-09-02 from `eharel-branch-0` against `keepintax-dev`.

## Measurements

- Nest build: about 64 seconds.
- TypeScript check without emit: 47.23 seconds.
- Compiled server startup with `DISABLE_SYNCHRONIZE=true` and
  `SKIP_BOOT_SEED=true`: 5.76 seconds.
- Compiled server startup with `DISABLE_SYNCHRONIZE=true` and the normal
  catalog boot seed: 9.25 seconds.
- The catalog seed therefore accounted for about 3.5 seconds in this run;
  initial TypeScript compilation is the dominant delay.

The TypeScript diagnostic run loaded 3,132 files, parsed roughly 3.56 million
declaration lines and used about 1.59 GB of memory. The installed `googleapis`
package contains 989 declaration files totalling about 171 MB. Top-level
imports from `googleapis` in the Drive, Gmail and Google OAuth services cause
TypeScript to load its broad API type surface even though Keepintax uses only
a few Google APIs.

## Follow-up options

1. Replace broad `googleapis` imports with narrow Drive, Gmail and auth client
   packages/imports, then compare TypeScript extended diagnostics.
2. Persist incremental compiler state across separate starts; the current
   build produced no reusable `.tsbuildinfo` after Nest cleared `dist`.
3. Evaluate Nest's SWC builder for development while retaining a separate
   TypeScript type-check command.
4. Batch or otherwise reduce the catalog seeder's sequential remote-DB
   lookups. `SKIP_BOOT_SEED=true` can isolate this cost during diagnosis but
   should not become an undocumented default.

## Local command notes

Use `npm run start:watch` for normal local development. It sets
`DISABLE_SYNCHRONIZE=true`, avoiding TypeORM schema synchronization against
the shared dev database. The current `start:dev` package script uses Unix
inline environment syntax and is not a reliable Windows development entry
point; it also runs precompiled `dist` rather than watch mode.

Mailgun does not materially affect the measured startup path.

## 2026-09-06 isolated-worktree validation

KT-004 repeated the investigation in a clean isolated worktree without
starting Nest against a database and without contacting production or
`keepintax_prodcopy`.

### Measurements

- `npm ci --no-audit --no-fund`: 73.364 seconds for 1,118 packages.
- `npm run build`: 159.207 seconds cold, then 53.136 and 113.326 seconds on
  repeated successful runs. The large variance points to filesystem scanning,
  cache state, and memory pressure in addition to compiler work.
- Direct TypeScript diagnostics were much faster: 15.834 seconds without emit
  and 17.231 seconds with emit. The compiler loaded 3,134 files, roughly 3.56
  million declaration lines, and used approximately 1.6-1.8 GB of memory.
- Loading the compiled `AppModule` graph without creating Nest, connecting to a
  database, seeding, listening, or making external requests took 80.666 seconds
  with a cold filesystem cache and 3.188-5.496 seconds warm. It loaded 4,522
  CommonJS modules.
- A warm isolated `googleapis` load took about 1.067 seconds. The installed
  package contains approximately 198 MB across 2,040 files, including about
  163 MB of declaration files.
- The existing safe `keepintax-dev` measurement remains 5.76 seconds for
  compiled startup with the catalog seed skipped and 9.25 seconds with the
  normal seed, attributing roughly 3.5 seconds to boot seeding.

### Confirmed causes

1. The Nest build wrapper and filesystem work dominate local waiting time:
   direct TypeScript work completes in roughly 16-17 seconds, while `nest
   build` varied from 53 to 159 seconds.
2. Broad Google API imports enlarge both the TypeScript declaration surface and
   runtime module graph even though Keepintax uses only a few Google APIs.
3. `CatalogSeedService` checks the seeded catalog through many sequential
   database lookups on every normal boot; an already-populated database still
   pays this cost.
4. TypeORM has no explicit connection retry settings. Its library defaults can
   add at least 24 seconds of retry delays when the configured database is
   unavailable, before connection timeout costs.
5. Firebase, Brevo, CardCom, Google Drive/OAuth, and Anthropic do not perform
   boot-time network requests in the inspected paths. MySQL is the only normal
   boot-time external connection; lazy integrations may instead affect their
   first request.

### Implementation order

1. Add timestamped bootstrap telemetry around module loading,
   `NestFactory.create`, TypeORM initialization, each seed phase, `listen`, and
   selected first requests. Add development-only DB retry/connect timeouts and
   fix the Windows-incompatible `start:dev` workflow documentation/script.
2. Use a development tsconfig that avoids declarations and optional source maps
   and benchmark three clean plus three warm builds.
3. Replace broad `googleapis` imports with narrow Drive/Gmail/auth packages and
   type-only imports, then repeat TypeScript and module-load measurements.
4. Evaluate SWC for development transpilation while retaining a parallel
   TypeScript checker and mandatory CI type-check.
5. Batch catalog-seed reads and create only missing rows while preserving
   edited-row and visibility invariants. A later version/checksum-controlled
   seed can eliminate most normal boot reconciliation, but any schema marker
   still requires explicit approval.

Compiled `node dist/main.js` also needs a separate deployment verification:
there are hundreds of emitted `src/...` alias imports, and raw Node does not
resolve those aliases without a supported rewrite, loader, or bundling step.
