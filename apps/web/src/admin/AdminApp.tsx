import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { ORG_KIND_LABELS, contentStatuses, orgKinds, visibilities } from 'shared/kinds';
import { api, ApiError } from '../api';
import type {
  Dashboard,
  OrgListItem,
  Page,
  PathwayOutline,
  SessionUser,
  SuggestionRow,
} from '../types';
import { FreshnessBadge, Field, buttonClass, inputClass, kindLabel } from '../ui';

function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<SessionUser>('/api/auth/me'),
    retry: false,
  });
}

function Shell({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isLoading) return <p>Loading…</p>;
  if (me.error) return <Navigate to="/login" replace />;
  const role = me.data?.role;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-navy">Editor tools</h1>
        <p className="text-sm">{me.data?.email}</p>
      </div>
      <nav className="flex flex-wrap gap-3 text-sm">
        {role === 'COORDINATOR' || role === 'ADMIN' ? <NavLink to="/admin">Review</NavLink> : null}
        <NavLink to="/admin/orgs">Organizations</NavLink>
        <NavLink to="/admin/roles">Roles</NavLink>
        <NavLink to="/admin/resources">Resources</NavLink>
        <NavLink to="/admin/pathways/funding-application">Pathway</NavLink>
        <NavLink to="/admin/suggestions">Suggestions</NavLink>
        {role === 'COORDINATOR' || role === 'ADMIN' ? (
          <NavLink to="/admin/users">People</NavLink>
        ) : null}
        {role === 'ADMIN' ? <NavLink to="/admin/import">Import</NavLink> : null}
      </nav>
      {children}
    </div>
  );
}

function DashboardPage() {
  const me = useMe();
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('/api/review/dashboard'),
    enabled: me.data?.role === 'COORDINATOR' || me.data?.role === 'ADMIN',
  });
  if (me.data && me.data.role === 'EDITOR') return <Navigate to="/admin/orgs" replace />;
  if (dashboard.isLoading) return <p>Loading…</p>;
  if (dashboard.error instanceof ApiError) return <p>{dashboard.error.message}</p>;
  if (!dashboard.data) return null;
  const data = dashboard.data;
  return (
    <div className="space-y-6">
      <section className="rounded border border-line bg-card p-3 text-sm">
        <h2 className="font-semibold text-navy">Pilot counts</h2>
        <p>Checklists started: {data.metrics.checklistsCreated}</p>
        <p>Steps marked done: {data.metrics.stepsCompleted}</p>
        <p>PDF downloads: {data.metrics.pdfDownloads}</p>
        <ul>
          {data.metrics.checklistsByCommunity.map((row) => (
            <li key={row.community}>
              {row.community}: {row.count}
            </li>
          ))}
        </ul>
      </section>
      {data.sections.map((section) => (
        <section key={section.key}>
          <h2 className="font-semibold text-navy">{section.title}</h2>
          <p className="text-sm">
            Needs review {section.counts.stale} · Review due {section.counts.due} · Not yet reviewed{' '}
            {section.counts.neverReviewed} · No maintainer {section.counts.unassigned}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {section.items.slice(0, 30).map((item) => (
              <li key={item.id}>
                {item.label} — {item.freshness}
                {item.maintainerName ? ` · ${item.maintainerName}` : ' · No maintainer'}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section>
        <h2 className="font-semibold text-navy">Broken links</h2>
        {data.brokenLinks.length === 0 ? <p className="text-sm">None.</p> : null}
        <ul className="text-sm">
          {data.brokenLinks.map((link) => (
            <li key={link.id}>
              <a href={link.url}>{link.label}</a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

type RoleRow = {
  id: string;
  roleLabel: string;
  resourcesText: string | null;
  needsText: string | null;
  hasRole: boolean;
  isDocumented: boolean;
  status: string;
  organizationId: string;
  topicId: string;
  organization: { name: string };
  topic: { name: string; slug: string };
  roleTypeNames: string[];
  roleQualifier: string | null;
  sourceSheet: string;
  sourceRow: number;
  reviewedAt: string | null;
  freshness: OrgListItem['freshness'];
  maintainer: { id?: string; name: string | null } | null;
};

type ResourceRow = {
  id: string;
  title: string;
  url: string;
  kind: string;
  description: string | null;
  ownerOrgId: string | null;
  linkStatus: string;
  reviewedAt: string | null;
  freshness: OrgListItem['freshness'];
  maintainer: { id?: string; name: string | null } | null;
};

function ReviewButtons({
  path,
  reviewedAt,
  freshness,
}: {
  path: string;
  reviewedAt: string | null;
  freshness: OrgListItem['freshness'];
}) {
  const client = useQueryClient();
  const review = useMutation({
    mutationFn: () => api(path, { method: 'POST' }),
    onSuccess: () => void client.invalidateQueries(),
  });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <FreshnessBadge value={freshness} reviewedAt={reviewedAt} />
      <button
        className={buttonClass('quiet')}
        type="button"
        onClick={() => review.mutate()}
        disabled={review.isPending}
      >
        Mark reviewed
      </button>
      {review.error instanceof Error ? (
        <span className="text-sm text-stale">{review.error.message}</span>
      ) : null}
    </div>
  );
}

function MaintainerField({ path, current }: { path: string; current: string | null }) {
  const me = useMe();
  const client = useQueryClient();
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api<{ id: string; name: string | null; email: string }[]>('/api/users'),
    enabled: me.data?.role === 'COORDINATOR' || me.data?.role === 'ADMIN',
  });
  const save = useMutation({
    mutationFn: (maintainerId: string | null) =>
      api(path, { method: 'PATCH', body: JSON.stringify({ maintainerId }) }),
    onSuccess: () => void client.invalidateQueries(),
  });
  if (me.data?.role === 'EDITOR') return null;
  return (
    <label className="block text-sm">
      <span className="font-medium text-navy">Maintainer</span>
      <select
        className={inputClass}
        value={current ?? ''}
        onChange={(event) => save.mutate(event.target.value || null)}
      >
        <option value="">No maintainer</option>
        {users.data?.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name || user.email}
          </option>
        ))}
      </select>
    </label>
  );
}

function OrgsAdmin() {
  const [q, setQ] = useState('');
  const orgs = useQuery({
    queryKey: ['admin-orgs', q],
    queryFn: () =>
      api<Page<OrgListItem>>(
        `/api/organizations?scope=manage&pageSize=100&q=${encodeURIComponent(q)}`,
      ),
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-navy">Organizations</h2>
        <Link className={buttonClass()} to="/admin/orgs/new">
          Add
        </Link>
      </div>
      <input
        className={inputClass}
        placeholder="Search"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
      <ul className="space-y-2">
        {orgs.data?.items.map((org) => (
          <li key={org.id}>
            <Link to={`/admin/orgs/${org.id}`}>{org.name}</Link>
            <span className="ml-2 text-sm text-muted">{kindLabel(org.kind)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrgForm() {
  const { id = '' } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const client = useQueryClient();
  const existing = useQuery({
    queryKey: ['admin-org', id],
    queryFn: () => api<OrgListItem>(`/api/organizations/manage/${id}`),
    enabled: !isNew,
  });
  const [form, setForm] = useState({
    name: '',
    shortName: '',
    kind: 'OTHER',
    websiteUrl: '',
    description: '',
    communities: '',
    visibility: 'PUBLIC',
    status: 'PUBLISHED',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    isGroup: false,
  });
  useEffect(() => {
    if (!existing.data) return;
    const org = existing.data;
    setForm({
      name: org.name,
      shortName: org.shortName ?? '',
      kind: org.kind,
      websiteUrl: org.websiteUrl ?? '',
      description: org.description ?? '',
      communities: org.communities.join(', '),
      visibility: org.visibility,
      status: org.status,
      contactName: org.contactName ?? '',
      contactEmail: org.contactEmail ?? '',
      contactPhone: org.contactPhone ?? '',
      isGroup: org.isGroup,
    });
  }, [existing.data]);
  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        communities: form.communities
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        shortName: form.shortName || null,
        websiteUrl: form.websiteUrl || null,
        description: form.description || null,
        contactName: form.contactName || null,
        contactEmail: form.contactEmail || null,
        contactPhone: form.contactPhone || null,
      };
      if (isNew)
        return api<OrgListItem>('/api/organizations', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      return api<OrgListItem>(`/api/organizations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    },
    onSuccess: (org) => {
      void client.invalidateQueries();
      if (isNew) navigate(`/admin/orgs/${org.id}`);
    },
  });
  return (
    <form
      className="max-w-xl space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <h2 className="text-xl font-semibold text-navy">{isNew ? 'New organization' : form.name}</h2>
      {!isNew && existing.data ? (
        <>
          <ReviewButtons
            path={`/api/organizations/${id}/review`}
            reviewedAt={existing.data.reviewedAt}
            freshness={existing.data.freshness}
          />
          <MaintainerField
            path={`/api/organizations/${id}/maintainer`}
            current={existing.data.maintainer?.id ?? null}
          />
        </>
      ) : null}
      <Field label="Name">
        <input
          className={inputClass}
          required
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </Field>
      <Field label="Short name">
        <input
          className={inputClass}
          value={form.shortName}
          onChange={(event) => setForm({ ...form, shortName: event.target.value })}
        />
      </Field>
      <Field label="Kind">
        <select
          className={inputClass}
          value={form.kind}
          onChange={(event) => setForm({ ...form, kind: event.target.value })}
        >
          {orgKinds.map((kind) => (
            <option key={kind} value={kind}>
              {ORG_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Website">
        <input
          className={inputClass}
          value={form.websiteUrl}
          onChange={(event) => setForm({ ...form, websiteUrl: event.target.value })}
        />
      </Field>
      <Field label="Description">
        <textarea
          className={inputClass}
          rows={4}
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
      </Field>
      <Field label="Communities, separated by commas">
        <input
          className={inputClass}
          value={form.communities}
          onChange={(event) => setForm({ ...form, communities: event.target.value })}
        />
      </Field>
      <Field label="Who can see this">
        <select
          className={inputClass}
          value={form.visibility}
          onChange={(event) => setForm({ ...form, visibility: event.target.value })}
        >
          {visibilities.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Status">
        <select
          className={inputClass}
          value={form.status}
          onChange={(event) => setForm({ ...form, status: event.target.value })}
        >
          {contentStatuses.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isGroup}
          onChange={(event) => setForm({ ...form, isGroup: event.target.checked })}
        />
        This row is a group, not one office
      </label>
      <Field label="Contact name">
        <input
          className={inputClass}
          value={form.contactName}
          onChange={(event) => setForm({ ...form, contactName: event.target.value })}
        />
      </Field>
      <Field label="Contact email">
        <input
          className={inputClass}
          value={form.contactEmail}
          onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
        />
      </Field>
      <Field label="Contact phone">
        <input
          className={inputClass}
          value={form.contactPhone}
          onChange={(event) => setForm({ ...form, contactPhone: event.target.value })}
        />
      </Field>
      {save.error instanceof Error ? <p className="text-stale">{save.error.message}</p> : null}
      <button className={buttonClass()} type="submit" disabled={save.isPending}>
        Save
      </button>
    </form>
  );
}

function RolesAdmin() {
  const [q, setQ] = useState('');
  const roles = useQuery({
    queryKey: ['admin-roles', q],
    queryFn: () => api<Page<RoleRow>>(`/api/player-roles?pageSize=50&q=${encodeURIComponent(q)}`),
  });
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold text-navy">Roles</h2>
      <input
        className={inputClass}
        placeholder="Search"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
      <ul className="space-y-2 text-sm">
        {roles.data?.items.map((role) => (
          <li key={role.id}>
            <Link to={`/admin/roles/${role.id}`}>
              {role.organization.name} — {role.topic.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoleForm() {
  const { id = '' } = useParams();
  const client = useQueryClient();
  const role = useQuery({
    queryKey: ['admin-role', id],
    queryFn: () => api<RoleRow>(`/api/player-roles/${id}`),
  });
  const [form, setForm] = useState({
    roleLabel: '',
    resourcesText: '',
    needsText: '',
    hasRole: true,
    isDocumented: true,
    status: 'PUBLISHED',
  });
  useEffect(() => {
    if (!role.data) return;
    setForm({
      roleLabel: role.data.roleLabel,
      resourcesText: role.data.resourcesText ?? '',
      needsText: role.data.needsText ?? '',
      hasRole: role.data.hasRole,
      isDocumented: role.data.isDocumented,
      status: role.data.status,
    });
  }, [role.data]);
  const save = useMutation({
    mutationFn: () =>
      api(`/api/player-roles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          organizationId: role.data?.organizationId,
          topicId: role.data?.topicId,
          roleLabel: form.roleLabel,
          roleTypeNames: role.data?.roleTypeNames ?? [],
          roleQualifier: role.data?.roleQualifier ?? null,
          resourcesText: form.resourcesText || null,
          needsText: form.needsText || null,
          hasRole: form.hasRole,
          isDocumented: form.isDocumented,
          status: form.status,
          sourceSheet: role.data?.sourceSheet,
          sourceRow: role.data?.sourceRow,
        }),
      }),
    onSuccess: () => void client.invalidateQueries(),
  });
  if (!role.data) return <p>Loading…</p>;
  return (
    <form
      className="max-w-xl space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <h2 className="text-xl font-semibold text-navy">
        {role.data.organization.name} — {role.data.topic.name}
      </h2>
      <ReviewButtons
        path={`/api/player-roles/${id}/review`}
        reviewedAt={role.data.reviewedAt}
        freshness={role.data.freshness}
      />
      <MaintainerField
        path={`/api/player-roles/${id}/maintainer`}
        current={role.data.maintainer?.id ?? null}
      />
      <Field label="Role">
        <textarea
          className={inputClass}
          rows={3}
          value={form.roleLabel}
          onChange={(event) => setForm({ ...form, roleLabel: event.target.value })}
        />
      </Field>
      <Field label="Resources they named">
        <textarea
          className={inputClass}
          rows={3}
          value={form.resourcesText}
          onChange={(event) => setForm({ ...form, resourcesText: event.target.value })}
        />
      </Field>
      <Field label="Needs they named">
        <textarea
          className={inputClass}
          rows={3}
          value={form.needsText}
          onChange={(event) => setForm({ ...form, needsText: event.target.value })}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.hasRole}
          onChange={(event) => setForm({ ...form, hasRole: event.target.checked })}
        />
        Has a role on this topic
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isDocumented}
          onChange={(event) => setForm({ ...form, isDocumented: event.target.checked })}
        />
        Role is documented
      </label>
      {save.error instanceof Error ? <p className="text-stale">{save.error.message}</p> : null}
      <button className={buttonClass()} type="submit">
        Save
      </button>
    </form>
  );
}

function ResourcesAdmin() {
  const [q, setQ] = useState('');
  const rows = useQuery({
    queryKey: ['admin-resources', q],
    queryFn: () =>
      api<Page<ResourceRow>>(`/api/resources?scope=manage&pageSize=100&q=${encodeURIComponent(q)}`),
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-navy">Resources</h2>
        <Link className={buttonClass()} to="/admin/resources/new">
          Add
        </Link>
      </div>
      <input
        className={inputClass}
        placeholder="Search"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
      <ul className="space-y-1 text-sm">
        {rows.data?.items.map((resource) => (
          <li key={resource.id}>
            <Link to={`/admin/resources/${resource.id}`}>{resource.title}</Link>
            <span className="ml-2 text-muted">{resource.linkStatus}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResourceForm() {
  const { id = '' } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const client = useQueryClient();
  const existing = useQuery({
    queryKey: ['admin-resource', id],
    queryFn: () => api<ResourceRow>(`/api/resources/${id}`),
    enabled: !isNew,
  });
  const [form, setForm] = useState({ title: '', url: '', kind: 'guide', description: '' });
  useEffect(() => {
    if (!existing.data) return;
    setForm({
      title: existing.data.title,
      url: existing.data.url,
      kind: existing.data.kind,
      description: existing.data.description ?? '',
    });
  }, [existing.data]);
  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        description: form.description || null,
        ownerOrgId: existing.data?.ownerOrgId ?? null,
      };
      if (isNew)
        return api<ResourceRow>('/api/resources', { method: 'POST', body: JSON.stringify(body) });
      return api(`/api/resources/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    },
    onSuccess: (saved) => {
      void client.invalidateQueries();
      if (isNew && saved && typeof saved === 'object' && 'id' in saved)
        navigate(`/admin/resources/${saved.id}`);
    },
  });
  return (
    <form
      className="max-w-xl space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <h2 className="text-xl font-semibold text-navy">{isNew ? 'New resource' : form.title}</h2>
      {!isNew && existing.data ? (
        <>
          <ReviewButtons
            path={`/api/resources/${id}/review`}
            reviewedAt={existing.data.reviewedAt}
            freshness={existing.data.freshness}
          />
          <MaintainerField
            path={`/api/resources/${id}/maintainer`}
            current={existing.data.maintainer?.id ?? null}
          />
          <p className="text-sm">Link: {existing.data.linkStatus}</p>
        </>
      ) : null}
      <Field label="Title">
        <input
          className={inputClass}
          required
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
      </Field>
      <Field label="URL">
        <input
          className={inputClass}
          required
          value={form.url}
          onChange={(event) => setForm({ ...form, url: event.target.value })}
        />
      </Field>
      <Field label="Kind">
        <input
          className={inputClass}
          value={form.kind}
          onChange={(event) => setForm({ ...form, kind: event.target.value })}
        />
      </Field>
      <Field label="Description">
        <textarea
          className={inputClass}
          rows={3}
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
      </Field>
      {save.error instanceof Error ? <p className="text-stale">{save.error.message}</p> : null}
      <button className={buttonClass()} type="submit">
        Save
      </button>
    </form>
  );
}

function PathwayAdmin() {
  const { slug = '' } = useParams();
  const me = useMe();
  const client = useQueryClient();
  const pathway = useQuery({
    queryKey: ['admin-pathway', slug],
    queryFn: () => api<PathwayOutline>(`/api/pathways/${slug}`),
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: '', why: '', howTo: '', examples: '' });
  const save = useMutation({
    mutationFn: (stepId: string) =>
      api(`/api/pathways/${pathway.data?.id}/steps/${stepId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: draft.title,
          why: draft.why,
          howTo: draft.howTo,
          examples: draft.examples || null,
        }),
      }),
    onSuccess: () => {
      setEditing(null);
      void client.invalidateQueries();
    },
  });
  const publish = useMutation({
    mutationFn: (status: string) =>
      api(`/api/pathways/${pathway.data?.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => void client.invalidateQueries(),
  });
  if (!pathway.data) return <p>Loading…</p>;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-navy">{pathway.data.title}</h2>
      <p className="text-sm">Status: {pathway.data.status}</p>
      <ReviewButtons
        path={`/api/pathways/${pathway.data.id}/review`}
        reviewedAt={pathway.data.reviewedAt}
        freshness={pathway.data.freshness}
      />
      <MaintainerField
        path={`/api/pathways/${pathway.data.id}/maintainer`}
        current={pathway.data.maintainer?.id ?? null}
      />
      {me.data?.role === 'COORDINATOR' || me.data?.role === 'ADMIN' ? (
        <button
          className={buttonClass('quiet')}
          type="button"
          onClick={() =>
            publish.mutate(pathway.data?.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED')
          }
        >
          {pathway.data.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
        </button>
      ) : null}
      <ol className="space-y-3">
        {pathway.data.steps.map((step) => (
          <li key={step.id} className="rounded border border-line bg-card p-3">
            {editing === step.id ? (
              <div className="space-y-2">
                <Field label="Title">
                  <input
                    className={inputClass}
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  />
                </Field>
                <Field label="Why">
                  <textarea
                    className={inputClass}
                    rows={3}
                    value={draft.why}
                    onChange={(event) => setDraft({ ...draft, why: event.target.value })}
                  />
                </Field>
                <Field label="How to">
                  <textarea
                    className={inputClass}
                    rows={4}
                    value={draft.howTo}
                    onChange={(event) => setDraft({ ...draft, howTo: event.target.value })}
                  />
                </Field>
                <Field label="Examples">
                  <textarea
                    className={inputClass}
                    rows={3}
                    value={draft.examples}
                    onChange={(event) => setDraft({ ...draft, examples: event.target.value })}
                  />
                </Field>
                <button
                  className={buttonClass()}
                  type="button"
                  onClick={() => save.mutate(step.id)}
                >
                  Save step
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="font-semibold">{step.title}</p>
                <button
                  className={buttonClass('quiet')}
                  type="button"
                  onClick={() => {
                    setEditing(step.id);
                    setDraft({
                      title: step.title,
                      why: step.why ?? '',
                      howTo: step.howTo ?? '',
                      examples: step.examples ?? '',
                    });
                  }}
                >
                  Edit
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function SuggestionsAdmin() {
  const client = useQueryClient();
  const rows = useQuery({
    queryKey: ['suggestions'],
    queryFn: () => api<Page<SuggestionRow>>('/api/suggestions?status=OPEN&pageSize=100'),
  });
  const resolve = useMutation({
    mutationFn: (input: { id: string; status: 'ACCEPTED' | 'REJECTED' }) =>
      api(`/api/suggestions/${input.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ status: input.status }),
      }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['suggestions'] }),
  });
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold text-navy">Suggestions</h2>
      {rows.data?.items.length === 0 ? <p>None waiting.</p> : null}
      <ul className="space-y-3">
        {rows.data?.items.map((item) => (
          <li key={item.id} className="rounded border border-line bg-card p-3 text-sm">
            <p>{item.message}</p>
            <p className="text-muted">
              {item.targetType}
              {item.submitterName ? ` · ${item.submitterName}` : ''}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                className={buttonClass()}
                type="button"
                onClick={() => resolve.mutate({ id: item.id, status: 'ACCEPTED' })}
              >
                Accept
              </button>
              <button
                className={buttonClass('quiet')}
                type="button"
                onClick={() => resolve.mutate({ id: item.id, status: 'REJECTED' })}
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UsersAdmin() {
  const client = useQueryClient();
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () =>
      api<{ id: string; email: string; name: string | null; role: string; isActive: boolean }[]>(
        '/api/users',
      ),
  });
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('EDITOR');
  const create = useMutation({
    mutationFn: () =>
      api('/api/users', { method: 'POST', body: JSON.stringify({ email, name, role }) }),
    onSuccess: () => {
      setEmail('');
      setName('');
      void client.invalidateQueries({ queryKey: ['users'] });
    },
  });
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-navy">People</h2>
      <form
        className="grid gap-2 sm:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <input
          className={inputClass}
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          className={inputClass}
          placeholder="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <select
          className={inputClass}
          value={role}
          onChange={(event) => setRole(event.target.value)}
        >
          <option value="EDITOR">Editor</option>
          <option value="COORDINATOR">Coordinator</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button className={buttonClass()} type="submit">
          Add
        </button>
      </form>
      {create.error instanceof Error ? <p className="text-stale">{create.error.message}</p> : null}
      <ul className="space-y-1 text-sm">
        {users.data?.map((user) => (
          <li key={user.id}>
            {user.email} — {user.role}
            {user.isActive ? '' : ' (inactive)'}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ImportAdmin() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const job = useQuery({
    queryKey: ['import-job', jobId],
    queryFn: () =>
      api<{
        state: string;
        result: { warnings?: string[]; created?: Record<string, number> } | null;
        failedReason: string | null;
      }>(`/api/admin/jobs/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === 'completed' || state === 'failed' ? false : 1500;
    },
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      const created = await api<{ id: string }>('/api/admin/import', {
        method: 'POST',
        body: data,
      });
      setJobId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  }
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold text-navy">Import the guide</h2>
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <input className="block text-sm" type="file" name="file" accept=".xlsx" required />
        <button className={buttonClass()} type="submit">
          Upload
        </button>
      </form>
      {error ? <p className="text-stale">{error}</p> : null}
      {job.data ? (
        <div className="text-sm">
          <p>Status: {job.data.state}</p>
          {job.data.failedReason ? <p className="text-stale">{job.data.failedReason}</p> : null}
          {job.data.result?.warnings ? <p>Warnings: {job.data.result.warnings.length}</p> : null}
          {job.data.result?.created ? (
            <ul>
              {Object.entries(job.data.result.created).map(([key, count]) => (
                <li key={key}>
                  {key}: {count} created
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AdminApp() {
  return (
    <Shell>
      <Routes>
        <Route index element={<DashboardPage />} />
        <Route path="orgs" element={<OrgsAdmin />} />
        <Route path="orgs/:id" element={<OrgForm />} />
        <Route path="roles" element={<RolesAdmin />} />
        <Route path="roles/:id" element={<RoleForm />} />
        <Route path="resources" element={<ResourcesAdmin />} />
        <Route path="resources/:id" element={<ResourceForm />} />
        <Route path="pathways/:slug" element={<PathwayAdmin />} />
        <Route path="suggestions" element={<SuggestionsAdmin />} />
        <Route path="users" element={<UsersAdmin />} />
        <Route path="import" element={<ImportAdmin />} />
      </Routes>
    </Shell>
  );
}
