import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default function globalSetup(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  execSync('pnpm --filter db exec tsx scripts/prepare-pilot.ts', {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://trail:trail@127.0.0.1:5432/trail_steward',
    },
  });
  const editorTokenHash = createHash('sha256').update('map-editor-token-value').digest('hex');
  execSync(
    `psql "postgresql://trail:trail@127.0.0.1:5432/trail_steward" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "Trail" (
  id, slug, name, summary, status, visibility, line, "reviewIntervalDays", "createdAt", "updatedAt"
) VALUES (
  'seedtrailharbor',
  'harbor-path',
  'Harbor path',
  'A short path by the harbor.',
  'PUBLISHED',
  'PUBLIC',
  '{"type":"LineString","coordinates":[[-135.33,57.05],[-135.2,57.08]]}'::jsonb,
  365,
  NOW(),
  NOW()
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  summary = EXCLUDED.summary,
  status = EXCLUDED.status,
  visibility = EXCLUDED.visibility,
  line = EXCLUDED.line,
  "updatedAt" = NOW();
UPDATE "Trail"
SET geom = ST_SetSRID(ST_GeomFromGeoJSON(line::text), 4326)::geometry(LineString, 4326)
WHERE slug = 'harbor-path';
DELETE FROM "Asset" WHERE "trailId" = (SELECT id FROM "Trail" WHERE slug = 'harbor-path');
INSERT INTO "Asset" (
  id, "trailId", name, kind, notes, point, "reviewIntervalDays", "createdAt", "updatedAt"
) VALUES (
  'seedassetharbor',
  (SELECT id FROM "Trail" WHERE slug = 'harbor-path'),
  'Harbor bridge',
  'BRIDGE',
  'Timber bridge.',
  '{"type":"Point","coordinates":[-135.3,57.06]}'::jsonb,
  365,
  NOW(),
  NOW()
);
UPDATE "Asset"
SET geom = ST_SetSRID(ST_GeomFromGeoJSON(point::text), 4326)::geometry(Point, 4326)
WHERE id = 'seedassetharbor';
INSERT INTO "Workday" (id, "trailId", title, notes, "workDate", status, "createdAt", "updatedAt")
VALUES (
  'seedworkharbor',
  (SELECT id FROM "Trail" WHERE slug = 'harbor-path'),
  'Harbor cleanup',
  'Bring gloves.',
  DATE '2026-11-18',
  'PLANNED',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  notes = EXCLUDED.notes,
  "workDate" = EXCLUDED."workDate",
  status = EXCLUDED.status,
  "updatedAt" = NOW();
INSERT INTO "User" (id, email, name, role, "isActive", "createdAt")
VALUES ('seedmapeditor', 'map-editor@example.com', 'Map editor', 'EDITOR', true, NOW())
ON CONFLICT (email) DO NOTHING;
DELETE FROM "MagicLinkToken" WHERE email = 'map-editor@example.com';
INSERT INTO "MagicLinkToken" (id, email, "tokenHash", "expiresAt", "createdAt")
VALUES ('seedmaptoken', 'map-editor@example.com', '${editorTokenHash}', NOW() + INTERVAL '1 day', NOW());
DELETE FROM "Trail" WHERE slug LIKE 'playwright-creek%';
SQL`,
    { cwd: root, stdio: 'inherit' },
  );
}
