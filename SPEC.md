# Trail Steward — Phase 1

Planning navigator pilot. Later phases (maps, maintenance, counters, repair packets) are not built. The schema keeps `Organization` as the owner directory, `freshness()` is generic, and the review dashboard is a list of sections so those modules can be added later.

PostGIS is enabled in the first migration and unused. `apps/web/src/features/map/` is reserved.

## What it does

- Searchable directory of organizations, their role on each topic, the resources they named, and the needs they named.
- One pathway: prepare a trail project for a funding application. Four intake questions, then an ordered checklist.
- Checklists are saved with an unguessable link. No public account. The owner can tick steps, add notes, and download a PDF.
- Editors sign in with a magic link. Coordinators assign maintainers and see the review dashboard. Admins run the spreadsheet import and read the audit log.

## Stack

pnpm workspaces and Turborepo. React 18, Vite, Tailwind, React Router, TanStack Query. NestJS 10, Prisma, Zod. PostgreSQL 16 and PostGIS. Redis and BullMQ. Resend. PDF rendering in the API with `@react-pdf/renderer`.

## Apps

- `apps/web` public pages and a lazy-loaded `/admin`.
- `apps/api` HTTP API under `/api`.
- `apps/worker` BullMQ processors.
- `packages/db` Prisma schema, import, and pathway seed.
- `packages/shared` freshness, pathway conditions, and Zod schemas.
- `content/pathways/funding-application.json` is the seed, not the live copy after an editor changes a step.

The pathway stays `DRAFT` until a coordinator publishes it. `scripts/prepare-pilot.ts` publishes it for local use.

## Review

`freshness(reviewedAt, intervalDays)` returns `current`, `due` (within 30 days of the due date, including the due instant), `stale` (after the due date), or `never-reviewed`.

An editor can mark a record reviewed only when they are its maintainer, or when they are a coordinator or admin.

## Jobs

- `link-check`: Mondays 03:00 America/Anchorage. HEAD, then GET if the server refuses HEAD. Up to 5 redirects. 10 second timeout. User-Agent `TrailStewardLinkCheck/1.0`. Four checks at a time.
- `review-reminders`: Mondays 08:00 America/Anchorage.
- `checklist-cleanup`: monthly. Deletes checklists not opened for 18 months.
- `import-guide`: on demand from the admin upload. The workbook is carried in the job because Phase 1 has no file storage.

Organization websites are checked and logged. The schema has no link-status columns for them.
