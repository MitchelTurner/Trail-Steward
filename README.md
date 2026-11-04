# Trail Steward

Trail Steward helps Southeast Alaska communities see what to do next on a trail project, and who to talk to.

Phase 1 is the planning navigator: a directory of organizations from Southeast Conference's Trail Coordination Guide, one guided pathway for preparing a funding application, saved checklists with a private link and a PDF, and a review queue for editors.

## Run it locally

Postgres 16 with PostGIS and Redis must be listening on ports 5432 and 6379. `docker compose up -d` starts both when Docker is available. This repository also runs against a local Postgres role `trail` / password `trail` and database `trail_steward`.

```bash
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env
pnpm install
pnpm --filter db exec prisma migrate deploy
pnpm --filter db exec tsx scripts/prepare-pilot.ts
pnpm dev
```

- Web: http://localhost:5173
- API health: http://localhost:3000/api/health

`prepare-pilot.ts` imports `data/SEC_Trail_Coordination_Guide_Draft_V2.xlsx` and publishes the funding pathway so the public intake can be tried. The workbook in this repo is a synthetic stand-in with the same sheet layout. Replace that file with Southeast Conference's guide and run the import again. `pnpm --filter db seed:pathways` loads the pathway JSON and leaves it as a draft until a coordinator publishes it.

Create the first admin with:

```bash
ADMIN_EMAIL=you@example.com pnpm --filter db seed:admin
```

Sign-in emails are sent with Resend. A key that starts with `re_test` is kept in memory and not sent.

## Scripts

| Command                                                                            | What it does                             |
| ---------------------------------------------------------------------------------- | ---------------------------------------- |
| `pnpm dev`                                                                         | Web, API, and worker                     |
| `pnpm --filter db import:guide -- data/SEC_Trail_Coordination_Guide_Draft_V2.xlsx` | Idempotent spreadsheet import            |
| `pnpm --filter db seed:pathways`                                                   | Upsert pathway JSON. Does not unpublish. |
| `pnpm test`                                                                        | Unit tests, API tests, and Playwright    |
| `pnpm --filter db exec prisma migrate deploy`                                      | Apply migrations                         |

## Backups and restore

Turn on Railway's nightly Postgres backups for the production database.

To restore:

1. In the Railway Postgres service, open Backups and restore the snapshot you need into the database. Railway replaces the current data with that snapshot.
2. Copy the new `DATABASE_URL` into the `api` and `worker` services if the restore created a new connection string.
3. Redeploy `api`. The release command runs `prisma migrate deploy`. Do not run `migrate reset`.
4. Open `/api/health`. It should report `db: ok` and `redis: ok`.
5. Sign in as an admin and open the review dashboard. Confirm a known organization is present before telling staff the site is back.

A downloaded backup can also be restored with `pg_restore` into an empty database that already has the `postgis` extension, then point `DATABASE_URL` at it and run `prisma migrate deploy`.

## Railway

One service each for `web`, `api`, `worker`, Postgres, and Redis. Railpack builds from the repository root.

`apps/api/railway.toml` compiles `shared` and `db`, then the API, and runs `prisma migrate deploy` before the API listens. The health check path is `/api/health`. `apps/worker/railway.toml` compiles the same packages, then the worker. A build log that runs `nest build` by itself is an older snapshot. Redeploy the API from the latest `main`.

The Dockerfiles in `apps/web`, `apps/api`, and `apps/worker` do those same steps when a service uses the Dockerfile builder.

The web container proxies `/api` to `API_UPSTREAM` (default `http://api:3000`). On Railway, set `API_UPSTREAM` to the API service's private URL, including the port. The browser talks to the web origin only, so the session cookie stays on that site.

Set `APP_BASE_URL` to the public web URL and `API_BASE_URL` to the public API URL. Set `TZ=America/Anchorage` on the worker so the Monday link check (03:00), review reminders (08:00), and monthly checklist cleanup use Alaska time.

This environment does not ship with Railway credentials, so production deploy and the production seed stay a manual step after the services exist.

## Session cookie

The session cookie is `httpOnly`, `SameSite=Lax`, and `Secure` only when `NODE_ENV=production`. Local HTTP and the browser tests need the cookie without `Secure`.
