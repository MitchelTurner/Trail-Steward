# Trail Steward

Trail Steward helps Southeast Alaska communities see what to do next on a trail project, and who to talk to.

Phase 1 is the planning navigator: a directory of organizations from Southeast Conference's Trail Coordination Guide, one guided pathway for preparing a funding application, saved checklists with a private link and a PDF, and a review queue for editors. The map adds published trail lines, places on those trails, and a public problem report. The maintenance board adds planned work days, map-change requests, and a PDF work list. Counters record how many visits a trail counter showed on a date.

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

`apps/api/railway.toml` compiles `shared` and `db`, then the API, and runs `prisma migrate deploy` before the API listens. The health check path is `/api/health`. `apps/worker/railway.toml` compiles the same packages, then the worker. `railpack.json` installs OpenSSL in the image. Prisma's engine needs `libssl.so.3`, and without it both the API and the worker exit as soon as they start.

Deploy the latest `main` commit. A log whose archive is 820 KB is the original Phase 1 snapshot: its web build script is `tsc` and it never compiles `shared`. Redeploy on that failed deployment repeats it. The current `main` archive is larger, and the web build script starts with `pnpm --filter shared build`.

The web service listens on Railway's `PORT` and proxies `/api` to `API_UPSTREAM` (or `API_BASE_URL`). Set `API_UPSTREAM` on the web service to the API private URL, including the port.

The Postgres service must provide PostGIS (`postgis/postgis:16-3.4`). Railway's default Postgres does not. The API release command runs `CREATE EXTENSION postgis` and exits if that extension is missing.

Linking Postgres fills `DATABASE_URL` only. Reference the Redis service `REDIS_URL` on the API and the worker. `TZ` defaults to `America/Anchorage`. Host variables `REDISHOST`, `REDISPORT`, `REDISUSER`, and `REDISPASSWORD` are used when `REDIS_URL` itself is unset.

When `JWT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`, or `API_BASE_URL` is unset, the service boots with test values: secret `trail-steward-test-secret`, mail key `re_test` (mail is not sent), sender `Trail Steward <noreply@example.com>`, and the service's Railway public URL for both base URLs. Replace those before real use. The startup log names each test value it filled.

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET` (at least 16 characters)
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `APP_BASE_URL` (public web URL)
- `API_BASE_URL` (public API URL)

A crash that prints `Invalid environment` is one of those values. The next lines name the missing ones.

The Dockerfiles in `apps/web`, `apps/api`, and `apps/worker` do those same steps when a service uses the Dockerfile builder.

The browser talks to the web origin only, so the session cookie stays on that site. The Docker image proxies `/api` the same way, with `API_UPSTREAM` defaulting to `http://api:3000`.

The Monday link check (03:00), review reminders (08:00), and monthly checklist cleanup use America/Anchorage.

This environment does not ship with Railway credentials, so production deploy and the production seed stay a manual step after the services exist.

## Session cookie

The session cookie is `httpOnly`, `SameSite=Lax`, and `Secure` only when `NODE_ENV=production`. Local HTTP and the browser tests need the cookie without `Secure`.
