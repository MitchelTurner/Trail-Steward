import { z } from 'zod';
import { lineStringSchema, pointSchema } from './geo';
import {
  assetKinds,
  changeRequestStatuses,
  contentStatuses,
  counterKinds,
  orgKinds,
  packetStatuses,
  userRoles,
  visibilities,
  workdayStatuses,
} from './kinds';

export {
  ASSET_KIND_LABELS,
  COUNTER_KIND_LABELS,
  ORG_KIND_LABELS,
  assetKinds,
  changeRequestStatuses,
  contentStatuses,
  counterKinds,
  issueStatuses,
  linkStatuses,
  orgKinds,
  suggestionStatuses,
  userRoles,
  visibilities,
  workdayStatuses,
} from './kinds';

export const pageQuerySchema = z.object({
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const optionValueSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

export const questionSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string().min(1),
    type: z.literal('select-or-text'),
    label: z.string().min(1),
    options: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('multi'),
    label: z.string().min(1),
    options: z.array(optionValueSchema).min(1),
  }),
  z.object({
    id: z.string().min(1),
    type: z.literal('single'),
    label: z.string().min(1),
    options: z.array(optionValueSchema).min(1),
  }),
]);

export const questionsSchema = z.array(questionSchema);

export type Question = z.infer<typeof questionSchema>;

export const condSchema: z.ZodType<
  | { q: string; includes: string }
  | { q: string; in: string[] }
  | { all: CondNode[] }
  | { any: CondNode[] }
  | { not: CondNode }
> = z.lazy(() =>
  z.union([
    z.object({ q: z.string(), includes: z.string() }),
    z.object({ q: z.string(), in: z.array(z.string()) }),
    z.object({ all: z.array(condSchema) }),
    z.object({ any: z.array(condSchema) }),
    z.object({ not: condSchema }),
  ]),
);

type CondNode = z.infer<typeof condSchema>;

export const contactQuerySchema = z.object({
  topics: z.array(z.string()),
  roleTypes: z.array(z.string()).optional(),
  landTypes: z.boolean().optional(),
});

export type ContactQuery = z.infer<typeof contactQuerySchema>;

export function buildAnswerSchema(questions: Question[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const question of questions) {
    if (question.type === 'multi') {
      const allowed = new Set(question.options.map((option) => option.value));
      shape[question.id] = z
        .array(z.string())
        .min(1)
        .refine((values) => values.every((value) => allowed.has(value)), 'Pick a listed option.');
    } else if (question.type === 'single') {
      const allowed = new Set(question.options.map((option) => option.value));
      shape[question.id] = z
        .string()
        .refine((value) => allowed.has(value), 'Pick a listed option.');
    } else {
      shape[question.id] = z.string().trim().min(1);
    }
  }
  return z.object(shape).strict();
}

export const checklistCreateSchema = z.object({
  pathwaySlug: z.string().min(1),
  answers: z.record(z.unknown()),
});

export const stepStateSchema = z.record(
  z.object({
    done: z.boolean(),
    note: z.string().max(2000).optional(),
    doneAt: z.string().optional(),
  }),
);

export const checklistPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    stepState: stepStateSchema.optional(),
  })
  .refine((value) => value.title !== undefined || value.stepState !== undefined, {
    message: 'Nothing to update.',
  });

export const suggestionCreateSchema = z.object({
  targetType: z.enum(['organization', 'playerRole', 'resource', 'pathwayStep', 'general']),
  targetId: z.string().min(1).optional(),
  message: z.string().trim().min(1).max(5000),
  proposedUrl: z.union([z.string().url(), z.literal('')]).optional(),
  submitterName: z.string().trim().max(200).optional(),
  submitterEmail: z.union([z.string().email(), z.literal('')]).optional(),
  fax: z.string().optional(),
});

export const suggestionResolveSchema = z.object({
  status: z.enum(['ACCEPTED', 'REJECTED']),
  resolutionNote: z.string().trim().max(2000).optional(),
});

export const trailWriteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(4000).optional(),
  status: z.enum(contentStatuses).optional(),
  visibility: z.enum(visibilities).optional(),
  line: lineStringSchema,
  dataStewardOrgId: z.string().nullable().optional(),
  maintenanceOwnerOrgId: z.string().nullable().optional(),
  reviewIntervalDays: z.number().int().positive().max(3650).optional(),
});

export const assetWriteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(assetKinds),
  notes: z.string().trim().max(2000).optional(),
  point: pointSchema,
  reviewIntervalDays: z.number().int().positive().max(3650).optional(),
});

export const issueCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().min(1).max(4000),
  trailSlug: z.string().trim().max(200).optional(),
  fax: z.string().optional(),
});

export const issueOwnerSchema = z.object({
  organizationId: z.string().nullable(),
});

const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }, 'Enter a real date.');

export const workdayWriteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(4000).optional(),
  workDate: calendarDay,
  status: z.enum(workdayStatuses).optional(),
  hostOrgId: z.string().nullable().optional(),
});

export const changeRequestCreateSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  submitterName: z.string().trim().max(200).optional(),
  fax: z.string().optional(),
});

export const counterWriteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(counterKinds),
  notes: z.string().trim().max(2000).optional(),
  reviewIntervalDays: z.number().int().positive().max(3650).optional(),
});

export const packetWriteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(4000).optional(),
  status: z.enum(packetStatuses).optional(),
  issueIds: z.array(z.string()).max(100).optional(),
  workdayIds: z.array(z.string()).max(100).optional(),
  fileIds: z.array(z.string()).max(50).optional(),
});

export const packetSendSchema = z.object({
  to: z.string().trim().email().max(200),
});

export const counterReadingSchema = z.object({
  recordedOn: calendarDay,
  count: z.number().int().nonnegative().max(10_000_000),
  notes: z.string().trim().max(2000).optional(),
});

export const changeRequestResolveSchema = z.object({
  status: z.enum(['ACCEPTED', 'REJECTED'] satisfies [
    (typeof changeRequestStatuses)[number],
    (typeof changeRequestStatuses)[number],
  ]),
  resolutionNote: z.string().trim().max(2000).optional(),
});

export const magicLinkSchema = z.object({
  email: z.string().trim().email(),
});

export const verifySchema = z.object({
  token: z.string().min(20),
});

export const orgWriteSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().min(1).optional(),
  shortName: z.string().trim().max(200).nullable().optional(),
  kind: z.enum(orgKinds),
  websiteUrl: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  description: z.string().max(8000).nullable().optional(),
  communities: z.array(z.string()).optional(),
  isGroup: z.boolean().optional(),
  visibility: z.enum(visibilities).optional(),
  contactName: z.string().max(200).nullable().optional(),
  contactEmail: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
  contactPhone: z.string().max(80).nullable().optional(),
  status: z.enum(contentStatuses).optional(),
  reviewIntervalDays: z.number().int().min(1).max(3650).optional(),
});

export const roleWriteSchema = z.object({
  organizationId: z.string().min(1),
  topicId: z.string().min(1),
  roleLabel: z.string().trim().min(1),
  roleTypeNames: z.array(z.string()),
  roleQualifier: z.string().nullable().optional(),
  isDocumented: z.boolean().optional(),
  hasRole: z.boolean().optional(),
  resourcesText: z.string().nullable().optional(),
  needsText: z.string().nullable().optional(),
  status: z.enum(contentStatuses).optional(),
  sourceSheet: z.string().optional(),
  sourceRow: z.number().int().optional(),
  resourceIds: z.array(z.string()).optional(),
  reviewIntervalDays: z.number().int().min(1).max(3650).optional(),
});

export const resourceWriteSchema = z.object({
  title: z.string().trim().min(1),
  url: z.string().url(),
  kind: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  ownerOrgId: z.string().nullable().optional(),
  roleIds: z.array(z.string()).optional(),
  reviewIntervalDays: z.number().int().min(1).max(3650).optional(),
});

export const pathwayWriteSchema = z.object({
  title: z.string().trim().min(1).optional(),
  summary: z.string().trim().min(1).optional(),
  status: z.enum(contentStatuses).optional(),
  questions: questionsSchema.optional(),
  reviewIntervalDays: z.number().int().min(1).max(3650).optional(),
});

export const stepWriteSchema = z.object({
  key: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().optional(),
  title: z.string().trim().min(1).optional(),
  why: z.string().min(1).optional(),
  howTo: z.string().min(1).optional(),
  examples: z.string().nullable().optional(),
  topicSlugs: z.array(z.string()).optional(),
  prerequisiteKeys: z.array(z.string()).optional(),
  showIf: z.unknown().nullable().optional(),
  contactQuery: contactQuerySchema.nullable().optional(),
  resourceIds: z.array(z.string()).optional(),
});

export const maintainerPatchSchema = z.object({
  maintainerId: z.string().min(1).nullable(),
});

export const userWriteSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().max(200).nullable().optional(),
  role: z.enum(userRoles).optional(),
  organizationId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const userPatchSchema = userWriteSchema.partial().omit({ email: true }).extend({
  email: z.string().trim().email().optional(),
});

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(3),
  APP_BASE_URL: z.string().url(),
  API_BASE_URL: z.string().url(),
  TZ: z.string().min(1),
  PORT: z.coerce.number().int().positive().optional(),
  NODE_ENV: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

function present(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function onRailway(source: NodeJS.ProcessEnv): boolean {
  return Boolean(
    present(source.RAILWAY_ENVIRONMENT) ||
      present(source.RAILWAY_PROJECT_ID) ||
      present(source.RAILWAY_PUBLIC_DOMAIN),
  );
}

function hostnameOf(value: string): string | undefined {
  try {
    return new URL(value).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return undefined;
  }
}

function isLoopbackHost(host: string | undefined): boolean {
  return Boolean(host && LOOPBACK_HOSTS.has(host));
}

function isLoopbackUrl(value: string): boolean {
  return isLoopbackHost(hostnameOf(value));
}

function railwayDatabaseUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  let changed = false;
  const host = parsed.hostname;
  if ((host.endsWith('.rlwy.net') || host.endsWith('.up.railway.app')) && !parsed.searchParams.has('sslmode')) {
    parsed.searchParams.set('sslmode', 'require');
    changed = true;
  }
  if ((parsed.port === '6543' || host.includes('pooler')) && !parsed.searchParams.has('pgbouncer')) {
    parsed.searchParams.set('pgbouncer', 'true');
    changed = true;
  }
  return changed ? parsed.toString() : url;
}

export function databaseUrlFrom(source: NodeJS.ProcessEnv): string | undefined {
  const railway = onRailway(source);
  const listed = [
    present(source.DATABASE_URL),
    present(source.DATABASE_PRIVATE_URL),
    present(source.POSTGRES_URL),
    present(source.DATABASE_PUBLIC_URL),
  ].filter((value): value is string => Boolean(value));
  const chosen = (railway ? listed.find((url) => !isLoopbackUrl(url)) : undefined) ?? listed[0];
  if (chosen) return railwayDatabaseUrl(chosen);
  const host = present(source.PGHOST);
  if (!host || (railway && isLoopbackHost(host))) return undefined;
  const user = present(source.PGUSER) || 'postgres';
  const password = present(source.PGPASSWORD);
  const auth = password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
    : encodeURIComponent(user);
  const port = present(source.PGPORT) || '5432';
  const database = present(source.PGDATABASE) || 'railway';
  return railwayDatabaseUrl(`postgresql://${auth}@${host}:${port}/${database}`);
}

function redisUrlFrom(source: NodeJS.ProcessEnv): string | undefined {
  const direct = present(source.REDIS_URL) || present(source.REDIS_PRIVATE_URL) || present(source.REDIS_PUBLIC_URL);
  if (direct) return direct;
  const host = present(source.REDISHOST);
  if (!host) return undefined;
  const port = present(source.REDISPORT) || '6379';
  const user = present(source.REDISUSER) || 'default';
  const password = present(source.REDISPASSWORD) || present(source.REDIS_PASSWORD);
  const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@` : `${encodeURIComponent(user)}@`;
  return `redis://${auth}${host}:${port}`;
}

// TODO(spec): these let a Railway service boot before the real variables are set.
const TEST_JWT_SECRET = 'trail-steward-test-secret';
const TEST_RESEND_API_KEY = 're_test';
const TEST_EMAIL_FROM = 'Trail Steward <noreply@example.com>';

function railwayPublicUrl(source: NodeJS.ProcessEnv): string | undefined {
  const domain = present(source.RAILWAY_PUBLIC_DOMAIN);
  if (domain) return `https://${domain}`;
  return present(source.RAILWAY_STATIC_URL);
}

const envHints: Record<string, string> = {
  DATABASE_URL: 'Add a variable reference to the Postgres service DATABASE_URL.',
  REDIS_URL: 'Add a variable reference to the Redis service REDIS_URL.',
  JWT_SECRET: 'Set the same 16+ character secret on the api and worker services.',
  RESEND_API_KEY: 'Set a Resend API key, or re_test until mail is ready.',
  EMAIL_FROM: 'Set the sender, such as Trail Steward <noreply@example.com>.',
  APP_BASE_URL: 'Set the public web URL, including https://.',
  API_BASE_URL: 'Set the public API URL, including https://.',
};

export function loadServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const publicUrl = railwayPublicUrl(source);
  const railway = onRailway(source);
  const appBase = present(source.APP_BASE_URL);
  const apiBase = present(source.API_BASE_URL);
  const filled = {
    JWT_SECRET: present(source.JWT_SECRET) || TEST_JWT_SECRET,
    RESEND_API_KEY: present(source.RESEND_API_KEY) || TEST_RESEND_API_KEY,
    EMAIL_FROM: present(source.EMAIL_FROM) || TEST_EMAIL_FROM,
    APP_BASE_URL: (appBase && !(railway && isLoopbackUrl(appBase)) ? appBase : undefined) || publicUrl || 'http://localhost:5173',
    API_BASE_URL: (apiBase && !(railway && isLoopbackUrl(apiBase)) ? apiBase : undefined) || publicUrl || 'http://localhost:3000',
  };
  const defaults = (Object.keys(filled) as (keyof typeof filled)[]).filter((key) => !present(source[key]));
  if (defaults.length > 0) {
    console.warn(`Using test settings for ${defaults.join(', ')}. Replace them on the service before real use.`);
  }
  const env: NodeJS.ProcessEnv = {
    ...source,
    ...filled,
    DATABASE_URL: databaseUrlFrom(source),
    REDIS_URL: redisUrlFrom(source),
    TZ: present(source.TZ) || 'America/Anchorage',
  };
  const parsed = serverEnvSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => {
        const key = issue.path.join('.') || 'env';
        const hint = envHints[key];
        return hint ? `${key}: ${hint}` : `${key}: ${issue.message}`;
      })
      .join('\n');
    throw new Error(`Invalid environment. Set the missing values and start again.\n${details}`);
  }
  return parsed.data;
}

const RANK: Record<(typeof userRoles)[number], number> = {
  EDITOR: 1,
  COORDINATOR: 2,
  ADMIN: 3,
};

export function roleAtLeast(
  role: (typeof userRoles)[number],
  required: (typeof userRoles)[number],
): boolean {
  return RANK[role] >= RANK[required];
}
