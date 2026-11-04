# Trail Steward

Phase 1 is the planning navigator. Phase 2 adds the trail map. Phase 3 is the maintenance board. Phase 4 adds trail counters: a named counter on a trail and a whole-number reading for a date. File storage is still later. The design doc named counters and cabin occupancy without fields, so a date and a number is the simplest reading.

`Organization` stays the owner directory. A trail points at it with `dataStewardOrgId` and `maintenanceOwnerOrgId`. `freshness()` covers trails and places. The review dashboard adds sections for trails, map points, and issues that have no owner.

## Map

A trail is a line of longitude, latitude pairs. A place on a trail is a point: trailhead, bridge, culvert, sign, or other. PostGIS stores the same shape so the map can ask which trails cross a box. The public map is a drawing of those lines, not a street basemap.

Published public trails show on `/map` and `/trails/:slug`. Drafts stay in the editor. Anyone can report a problem. The report lands as an unowned issue until an editor names an organization or closes it.

## Maintenance board

A work day is a date, a title, and an optional host from the directory. Planned days show on the trail page. Marking a day done takes it off that public list.

A map change request is a note that the line, the name, or the owner is wrong. Accepting it does not move the line. The editor still edits the trail.

The maintenance board lists trails that have an open problem, a planned work day, or an open map change. Download work list makes a PDF of that snapshot, including the latest count for each counter. It is not stored.

## Counters

A counter belongs to one trail. Its kind is a trail counter, a cabin count, or other. An editor records how many visits the counter showed on a date. A newer date replaces the number shown on the trail page. Older numbers stay in the editor list. The review board and the Monday reminder include counters.

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
