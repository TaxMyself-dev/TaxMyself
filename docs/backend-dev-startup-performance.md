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
