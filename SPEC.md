# Trail Steward

Phase 1 is the planning navigator. Phase 2 adds the trail map. Phase 3 is the maintenance board. Phase 4 adds trail counters. Phase 5 stores a PDF or photo on a trail. Phase 6 saves a work packet. Phase 7 stores the Monday check of each organization's website. Phase 8 emails that packet. Phase 9 asks whether the project is seeking federal funding. The design doc did not name an object store, so the file bytes live in Postgres.

`Organization` stays the owner directory. A trail points at it with `dataStewardOrgId` and `maintenanceOwnerOrgId`. `freshness()` covers trails and places. The review dashboard adds sections for trails, map points, and issues that have no owner.

## Map

A trail is a line of longitude, latitude pairs. A place on a trail is a point: trailhead, bridge, culvert, sign, or other. PostGIS stores the same shape so the map can ask which trails cross a box. The public map is a drawing of those lines, not a street basemap.

Published public trails show on `/map` and `/trails/:slug`. Drafts stay in the editor. Anyone can report a problem. The report lands as an unowned issue until an editor names an organization or closes it.

## Maintenance board

A work day is a date, a title, and an optional host from the directory. Planned days show on the trail page. Marking a day done takes it off that public list.

A map change request is a note that the line, the name, or the owner is wrong. Accepting it does not move the line. The editor still edits the trail.

The maintenance board lists trails that have an open problem, a planned work day, an open map change, or a saved work packet. Download work list makes a PDF of everything open right now, including the latest count for each counter. That download is a snapshot. It is not stored.

## Counters

A counter belongs to one trail. Its kind is a trail counter, a cabin count, or other. An editor records how many visits the counter showed on a date. A newer date replaces the number shown on the trail page. Older numbers stay in the editor list. The review board and the Monday reminder include counters.

## Files

An editor uploads a PDF or a photo, up to 5 MB, onto a trail. The file stays with editors unless they mark it public. A public file on a published trail can be downloaded from the trail page. The spreadsheet import still carries the workbook in the job.

## Work packets

An editor saves a work packet on one trail. The packet has a title, notes, and a status: draft, ready to send, or done. It keeps the problems, work days, and files the editor checked. Download packet prints that saved set. It does not add problems that were left off. Send packet emails that same PDF to an address the editor types. The maintenance owner's email is filled in when one is stored. The packet stays with editors. A draft or a packet that is ready to send shows on the maintenance board. Marking it done takes it off the board. Sending it does not mark it done.

## What it does

- Searchable directory of organizations, their role on each topic, the resources they named, and the needs they named.
- One pathway: prepare a trail project for a funding application. Five intake questions, then an ordered checklist. The federal review step shows for Forest Service or National Park Service land, and when the project is asking for federal funding or is not sure yet.
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
- `import-guide`: on demand from the admin upload. The workbook is still carried in the job.

The Monday link check stores a status on each organization website: not checked, ok, redirects, or broken. A broken website shows on the organization page, in the review dashboard's broken links, and in the Monday reminder. Changing the website address clears that status. Resource links are checked the same way.
