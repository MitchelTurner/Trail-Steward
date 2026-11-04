import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient, findRepoRoot, importGuideFromFile, seedPathways } from 'db';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email.service';
import { configureHttp } from '../src/main';

const execFileAsync = promisify(execFile);

const federal = {
  community: 'Sitka',
  landTypes: ['usfs'],
  stage: 'planned',
  match: 'yes',
};
const tribal = {
  community: 'Kake',
  landTypes: ['tribal'],
  stage: 'idea',
  match: 'yes',
};
const localNoMatch = {
  community: 'Juneau',
  landTypes: ['local'],
  stage: 'designed',
  match: 'no',
};
const permitted = {
  community: 'Haines',
  landTypes: ['state-parks'],
  stage: 'permitted',
  match: 'yes',
};

async function signIn(app: INestApplication, email: string) {
  EmailService.sent = [];
  const agent = request.agent(app.getHttpServer());
  await agent.post('/api/auth/magic-link').send({ email }).expect(204);
  const sent = EmailService.sent.at(-1);
  const token = sent?.text.match(/token=([^\s]+)/)?.[1];
  expect(token).toBeTruthy();
  await agent.post('/api/auth/verify').send({ token }).expect(204);
  return agent;
}

describe('API', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let editor: request.SuperAgentTest;
  let coordinator: request.SuperAgentTest;
  let admin: request.SuperAgentTest;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "ChangeRequest",
        "Workday",
        "Issue",
        "Asset",
        "Trail",
        "AuditLog",
        "Suggestion",
        "Checklist",
        "StepResource",
        "PathwayStep",
        "Pathway",
        "MagicLinkToken",
        "Resource",
        "PlayerRole",
        "TopicLearning",
        "RoleType",
        "Topic",
        "User",
        "Organization"
      RESTART IDENTITY CASCADE
    `);
    const root = findRepoRoot(process.cwd());
    const file = path.join(root, 'data', 'SEC_Trail_Coordination_Guide_Draft_V2.xlsx');
    await importGuideFromFile(prisma, file);
    await seedPathways(prisma, root);
    await prisma.pathway.update({
      where: { slug: 'funding-application' },
      data: { status: 'PUBLISHED' },
    });
    await prisma.user.createMany({
      data: [
        { email: 'editor@example.com', name: 'Eddy Editor', role: 'EDITOR' },
        { email: 'coordinator@example.com', name: 'Cora Coordinator', role: 'COORDINATOR' },
        { email: 'admin@example.com', name: 'Ada Admin', role: 'ADMIN' },
      ],
    });

    app = await NestFactory.create(AppModule, { logger: false });
    configureHttp(app);
    await app.init();
    editor = await signIn(app, 'editor@example.com');
    coordinator = await signIn(app, 'coordinator@example.com');
    admin = await signIn(app, 'admin@example.com');
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('reports health', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(response.body).toEqual({ status: 'ok', db: 'ok', redis: 'ok' });
  });

  it('lists 12 topics and a topic page in the documented order', async () => {
    const list = await request(app.getHttpServer()).get('/api/topics').expect(200);
    expect(list.body).toHaveLength(12);
    expect(list.body[0].slug).toBe('jurisdiction-land-management');
    expect(list.body[0].documentedPlayerCount).toBeGreaterThan(0);
    const topic = await request(app.getHttpServer())
      .get('/api/topics/permitting-land-access')
      .expect(200);
    expect(topic.body.question).toContain('approvals');
    expect(topic.body.players.documented.length).toBeGreaterThan(0);
    expect(topic.body.players.noRole.length).toBeGreaterThan(0);
    expect(topic.body.players.documented[0].freshness).toBe('never-reviewed');
    expect(topic.body.players.documented[0].maintainer).toBeNull();
  });

  it('hides organizations that are not public', async () => {
    const created = await editor
      .post('/api/organizations')
      .send({ name: 'Quiet Partners', kind: 'OTHER', visibility: 'PRIVATE' })
      .expect(201);
    const slug = created.body.slug as string;
    const list = await request(app.getHttpServer())
      .get('/api/organizations')
      .query({ q: 'Quiet' })
      .expect(200);
    expect(list.body.items).toHaveLength(0);
    await request(app.getHttpServer()).get(`/api/organizations/${slug}`).expect(404);
    const staff = await editor.get(`/api/organizations/${slug}`).expect(200);
    expect(staff.body.visibility).toBe('PRIVATE');
    const managed = await editor
      .get('/api/organizations')
      .query({ q: 'Quiet', scope: 'manage' })
      .expect(200);
    expect(managed.body.items).toHaveLength(1);
    expect(managed.body.items[0].maintainer).toBeNull();
  });

  it('searches and filters resources', async () => {
    const search = await request(app.getHttpServer())
      .get('/api/search')
      .query({ q: 'recreation data hub' })
      .expect(200);
    expect(
      search.body.resources.some(
        (item: { title: string }) => item.title === 'State recreation data hub',
      ),
    ).toBe(true);
    const resources = await request(app.getHttpServer())
      .get('/api/resources')
      .query({ kind: 'data', q: 'recreation' })
      .expect(200);
    expect(resources.body.items.length).toBeGreaterThan(0);
    expect(resources.body.pageSize).toBe(50);
    await request(app.getHttpServer())
      .get('/api/organizations')
      .query({ pageSize: 201 })
      .expect(400);
  });

  it('builds the four pilot checklists and keeps edits on the private link', async () => {
    const cases: { answers: Record<string, unknown>; keys: string[] }[] = [
      {
        answers: federal,
        keys: [
          'confirm-land',
          'approvals',
          'federal-review',
          'wetlands',
          'maintenance-owner',
          'pick-program',
          'evidence',
          'partners',
          'apply',
        ],
      },
      {
        answers: tribal,
        keys: [
          'confirm-land',
          'check-plan',
          'approvals',
          'wetlands',
          'tribal-g2g',
          'maintenance-owner',
          'pick-program',
          'evidence',
          'partners',
          'apply',
        ],
      },
      {
        answers: localNoMatch,
        keys: [
          'confirm-land',
          'approvals',
          'wetlands',
          'maintenance-owner',
          'pick-program',
          'match',
          'evidence',
          'partners',
          'apply',
        ],
      },
      {
        answers: permitted,
        keys: [
          'confirm-land',
          'approvals',
          'maintenance-owner',
          'pick-program',
          'evidence',
          'partners',
          'apply',
        ],
      },
    ];
    for (const item of cases) {
      const created = await request(app.getHttpServer())
        .post('/api/checklists')
        .send({ pathwaySlug: 'funding-application', answers: item.answers })
        .expect(201);
      const loaded = await request(app.getHttpServer())
        .get(`/api/checklists/${created.body.token}`)
        .expect(200);
      expect(loaded.body.steps.map((step: { key: string }) => step.key)).toEqual(item.keys);
    }

    const created = await request(app.getHttpServer())
      .post('/api/checklists')
      .send({ pathwaySlug: 'funding-application', answers: federal })
      .expect(201);
    const token = created.body.token as string;
    const first = await request(app.getHttpServer()).get(`/api/checklists/${token}`).expect(200);
    const contactNames = first.body.steps[0].contacts.map(
      (contact: { name: string }) => contact.name,
    );
    expect(contactNames.some((name: string) => name.includes('Forest Service'))).toBe(true);
    expect(contactNames.some((name: string) => name.includes('Southeast Conference'))).toBe(true);
    expect(
      first.body.steps[0].resources.some((resource: { url: string }) =>
        resource.url.includes('dnr.alaska.gov'),
      ),
    ).toBe(true);

    await request(app.getHttpServer())
      .patch(`/api/checklists/${token}`)
      .send({
        title: 'Sitka waterfront',
        stepState: {
          'confirm-land': { done: true, note: 'Called the district' },
          approvals: { done: true },
        },
      })
      .expect(200);
    const again = await request(app.getHttpServer()).get(`/api/checklists/${token}`).expect(200);
    expect(again.body.title).toBe('Sitka waterfront');
    expect(again.body.steps[0].done).toBe(true);
    expect(again.body.steps[0].note).toBe('Called the district');
    expect(again.body.progress.done).toBe(2);

    const pdf = await request(app.getHttpServer())
      .get(`/api/checklists/${token}/pdf`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const dir = await mkdtemp(path.join(tmpdir(), 'ts-pdf-'));
    const file = path.join(dir, 'checklist.pdf');
    await writeFile(file, pdf.body as Buffer);
    const { stdout } = await execFileAsync('pdftotext', [file, '-']);
    expect(stdout).toContain('Sitka waterfront');
    expect(stdout).toContain('Confirm who owns and manages');
    expect(stdout).toContain('https://dnr.alaska.gov/parks/asp/recreation-data');
    expect(stdout).toContain('Content reviewed');
    await rm(dir, { recursive: true, force: true });
  });

  it('stores suggestions, ignores the honeypot, and lets an editor resolve one', async () => {
    await request(app.getHttpServer())
      .post('/api/suggestions')
      .send({ targetType: 'general', message: 'The phone number is old.', fax: '555' })
      .expect(201);
    const stored = await prisma.suggestion.count({
      where: { message: 'The phone number is old.' },
    });
    expect(stored).toBe(0);
    const created = await request(app.getHttpServer())
      .post('/api/suggestions')
      .send({
        targetType: 'organization',
        message: 'Please add a phone number.',
        submitterName: 'Sam',
      })
      .expect(201);
    expect(created.body.ok).toBe(true);
    const list = await editor.get('/api/suggestions').expect(200);
    const open = list.body.items.find(
      (item: { message: string }) => item.message === 'Please add a phone number.',
    );
    expect(open.status).toBe('OPEN');
    const resolved = await editor
      .post(`/api/suggestions/${open.id}/resolve`)
      .send({ status: 'ACCEPTED', resolutionNote: 'Added.' })
      .expect(201);
    expect(resolved.body.status).toBe('ACCEPTED');
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'suggestion.resolve', entityId: open.id },
    });
    expect(audit).toBeTruthy();
  });

  it('signs editors in without revealing unknown emails, and writes an audit row on edits', async () => {
    EmailService.sent = [];
    await request(app.getHttpServer())
      .post('/api/auth/magic-link')
      .send({ email: 'nobody@example.com' })
      .expect(204);
    expect(EmailService.sent).toHaveLength(0);
    const me = await editor.get('/api/auth/me').expect(200);
    expect(me.body.role).toBe('EDITOR');
    const org = await prisma.organization.findFirst({ where: { name: 'Southeast Conference' } });
    expect(org).toBeTruthy();
    await editor.post(`/api/organizations/${org?.id}/review`).expect(403);
    await coordinator
      .patch(`/api/organizations/${org?.id}/maintainer`)
      .send({ maintainerId: me.body.id })
      .expect(200);
    const reviewed = await editor.post(`/api/organizations/${org?.id}/review`).expect(200);
    expect(reviewed.body.freshness).toBe('current');
    const row = await prisma.auditLog.findFirst({
      where: { action: 'review', entityType: 'organization', entityId: org?.id },
    });
    expect(row?.actorId).toBe(me.body.id);
    await editor.post('/api/auth/logout').expect(204);
    await editor.get('/api/auth/me').expect(401);
    editor = await signIn(app, 'editor@example.com');
  });

  it('lets a coordinator publish and an admin read the audit log and queue an import', async () => {
    const pathway = await prisma.pathway.findUnique({ where: { slug: 'funding-application' } });
    await editor.patch(`/api/pathways/${pathway?.id}`).send({ status: 'DRAFT' }).expect(403);
    await coordinator
      .patch(`/api/pathways/${pathway?.id}`)
      .send({ status: 'PUBLISHED' })
      .expect(200);
    await coordinator
      .post('/api/users')
      .send({ email: 'new@example.com', role: 'ADMIN' })
      .expect(403);
    const created = await coordinator
      .post('/api/users')
      .send({ email: 'new@example.com', role: 'EDITOR' })
      .expect(201);
    expect(created.body.role).toBe('EDITOR');
    const dashboard = await coordinator.get('/api/review/dashboard').expect(200);
    expect(dashboard.body.sections.length).toBeGreaterThanOrEqual(4);
    expect(dashboard.body.metrics.checklistsCreated).toBeGreaterThan(0);
    await editor.get('/api/review/dashboard').expect(403);
    const audit = await admin.get('/api/audit').query({ entityType: 'organization' }).expect(200);
    expect(audit.body.total).toBeGreaterThan(0);
    await coordinator.get('/api/audit').expect(403);
    const root = findRepoRoot(process.cwd());
    const queued = await admin
      .post('/api/admin/import')
      .attach('file', path.join(root, 'data', 'SEC_Trail_Coordination_Guide_Draft_V2.xlsx'))
      .expect(201);
    expect(queued.body.id).toBeTruthy();
    const job = await admin.get(`/api/admin/jobs/${queued.body.id}`).expect(200);
    expect(['waiting', 'delayed', 'active', 'completed', 'failed']).toContain(job.body.state);
  });

  it('publishes a trail, filters it by map box, and keeps drafts off the public map', async () => {
    const org = await prisma.organization.findFirst({ where: { status: 'PUBLISHED' } });
    const created = await editor
      .post('/api/trails')
      .send({
        name: 'Harbor path',
        summary: 'A short path by the harbor.',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        line: {
          type: 'LineString',
          coordinates: [
            [-135.33, 57.05],
            [-135.2, 57.08],
          ],
        },
        dataStewardOrgId: org?.id,
      })
      .expect(201);
    expect(created.body.slug).toBe('harbor-path');
    expect(created.body.line.coordinates).toHaveLength(2);
    const withPoint = await editor.post('/api/trails/harbor-path/assets').send({
      name: 'Harbor bridge',
      kind: 'BRIDGE',
      point: { type: 'Point', coordinates: [-135.3, 57.06] },
    });
    expect(withPoint.status).toBe(201);
    expect(withPoint.body.assets).toHaveLength(1);

    const pub = await request(app.getHttpServer()).get('/api/trails').expect(200);
    expect(pub.body.items.some((item: { slug: string }) => item.slug === 'harbor-path')).toBe(true);
    const inside = await request(app.getHttpServer())
      .get('/api/trails')
      .query({ west: -136, south: 57, east: -135, north: 58 })
      .expect(200);
    expect(inside.body.items.some((item: { slug: string }) => item.slug === 'harbor-path')).toBe(true);
    const outside = await request(app.getHttpServer())
      .get('/api/trails')
      .query({ west: -120, south: 40, east: -119, north: 41 })
      .expect(200);
    expect(outside.body.items.some((item: { slug: string }) => item.slug === 'harbor-path')).toBe(false);

    await editor
      .post('/api/trails')
      .send({
        name: 'Hidden path',
        status: 'DRAFT',
        line: {
          type: 'LineString',
          coordinates: [
            [-135.1, 57.01],
            [-135.0, 57.02],
          ],
        },
      })
      .expect(201);
    const hidden = await request(app.getHttpServer()).get('/api/trails/hidden-path').expect(404);
    expect(hidden.body.message).toBeTruthy();
    const managed = await editor.get('/api/trails/hidden-path').expect(200);
    expect(managed.body.status).toBe('DRAFT');

    const report = await request(app.getHttpServer())
      .post('/api/issues')
      .send({ title: 'Washout', detail: 'The bridge approach is gone.', trailSlug: 'harbor-path' })
      .expect(201);
    expect(report.body.ok).toBe(true);
    const listed = await editor.get('/api/issues').expect(200);
    expect(listed.body.items.some((item: { title: string }) => item.title === 'Washout')).toBe(true);
    const dashboard = await coordinator.get('/api/review/dashboard').expect(200);
    const issues = dashboard.body.sections.find(
      (section: { key: string }) => section.key === 'issues',
    );
    expect(issues.items.some((item: { label: string }) => item.label === 'Washout')).toBe(true);
  });

  it('plans a work day, lists a map change, and downloads the work list', async () => {
    const created = await editor
      .post('/api/trails/harbor-path/workdays')
      .send({ title: 'Harbor cleanup', workDate: '2026-11-18', notes: 'Bring gloves.' })
      .expect(201);
    const pub = await request(app.getHttpServer()).get('/api/trails/harbor-path').expect(200);
    expect(pub.body.workdays.some((item: { title: string }) => item.title === 'Harbor cleanup')).toBe(
      true,
    );
    await editor
      .patch(`/api/trails/harbor-path/workdays/${created.body.id}`)
      .send({ status: 'DONE' })
      .expect(200);
    const hidden = await request(app.getHttpServer()).get('/api/trails/harbor-path').expect(200);
    expect(hidden.body.workdays.some((item: { title: string }) => item.title === 'Harbor cleanup')).toBe(
      false,
    );
    await request(app.getHttpServer())
      .post('/api/trails/harbor-path/change-requests')
      .send({ message: 'The line should follow the dock.' })
      .expect(201);
    const dashboard = await coordinator.get('/api/review/dashboard').expect(200);
    const section = dashboard.body.sections.find(
      (item: { key: string }) => item.key === 'changeRequests',
    );
    expect(section.kind).toBe('queue');
    expect(
      section.items.some((item: { label: string }) => item.label.includes('follow the dock')),
    ).toBe(true);
    const board = await editor.get('/api/maintenance/board').expect(200);
    expect(board.body.trails.some((item: { slug: string }) => item.slug === 'harbor-path')).toBe(true);
    const packet = await editor
      .get('/api/trails/harbor-path/packet')
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(packet.headers['content-type']).toContain('application/pdf');
    const dir = await mkdtemp(path.join(tmpdir(), 'ts-work-list-'));
    const file = path.join(dir, 'work-list.pdf');
    await writeFile(file, packet.body as Buffer);
    const { stdout } = await execFileAsync('pdftotext', [file, '-']);
    expect(stdout).toContain('Harbor path work list');
    expect(stdout).toContain('Washout');
    expect(stdout).toContain('follow the dock');
    await rm(dir, { recursive: true, force: true });
  });
});
