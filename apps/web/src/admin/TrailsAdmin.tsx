import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { lineStringSchema, pointSchema, type GeoPoint, type LineString } from 'shared';
import {
  ASSET_KIND_LABELS,
  COUNTER_KIND_LABELS,
  PACKET_STATUS_LABELS,
  assetKinds,
  contentStatuses,
  counterKinds,
  packetStatuses,
  visibilities,
} from 'shared/kinds';
import { api, ApiError } from '../api';
import type { MapLine, MapPoint } from '../features/map/TrailMap';
import type { OrgListItem, Page } from '../types';
import { Field, FreshnessBadge, buttonClass, formatCount, formatDay, inputClass } from '../ui';

type TrailRow = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  status: string;
  visibility: string;
  line: MapLine | null;
  dataStewardOrgId: string | null;
  maintenanceOwnerOrgId: string | null;
  assets: {
    id: string;
    name: string;
    kind: string;
    notes: string | null;
    point: MapPoint | null;
  }[];
  workdays: {
    id: string;
    title: string;
    notes: string | null;
    workDate: string;
    status: string;
    hostOrg: { name: string } | null;
  }[];
  counters: {
    id: string;
    name: string;
    kind: string;
    notes: string | null;
    latest: { id: string; recordedOn: string; count: number } | null;
    readings?: { id: string; recordedOn: string; count: number }[];
    freshness: 'current' | 'due' | 'stale' | 'never-reviewed';
    reviewedAt: string | null;
  }[];
  files: { id: string; name: string; contentType: string; visibility: string }[];
  issues: { id: string; title: string }[];
  packets: {
    id: string;
    title: string;
    notes: string;
    status: string;
    issueIds: string[];
    workdayIds: string[];
    fileIds: string[];
    sentAt: string | null;
    sentTo: string | null;
  }[];
};

function parseLine(text: string): LineString | null {
  const coordinates: [number, number][] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(',').map((part) => part.trim());
    if (parts.length !== 2) return null;
    coordinates.push([Number(parts[0]), Number(parts[1])]);
  }
  const parsed = lineStringSchema.safeParse({ type: 'LineString', coordinates });
  return parsed.success ? parsed.data : null;
}

function formatLine(line: MapLine | null): string {
  if (!line) return '';
  return line.coordinates.map(([lng, lat]) => `${lng}, ${lat}`).join('\n');
}

function parsePoint(text: string): GeoPoint | null {
  const parts = text.split(',').map((part) => part.trim());
  if (parts.length !== 2) return null;
  const parsed = pointSchema.safeParse({
    type: 'Point',
    coordinates: [Number(parts[0]), Number(parts[1])],
  });
  return parsed.success ? parsed.data : null;
}

export function TrailsAdmin() {
  const trails = useQuery({
    queryKey: ['trails', 'manage'],
    queryFn: () => api<Page<TrailRow>>('/api/trails?scope=manage&pageSize=200'),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-navy">Trails</h2>
        <Link to="/admin/trails/new" className={buttonClass()}>
          Add a trail
        </Link>
      </div>
      {trails.isLoading ? <p>Loading…</p> : null}
      {trails.error instanceof ApiError ? <p>{trails.error.message}</p> : null}
      <ul className="space-y-2">
        {trails.data?.items.map((trail) => (
          <li key={trail.id}>
            <Link to={`/admin/trails/edit/${trail.slug}`}>{trail.name}</Link>
            <span className="text-sm text-muted">
              {' '}
              · {trail.status === 'PUBLISHED' ? 'Published' : 'Draft'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TrailForm() {
  const { slug } = useParams();
  const creating = !slug;
  const navigate = useNavigate();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const trail = useQuery({
    queryKey: ['trail', 'manage', slug],
    queryFn: () => api<TrailRow>(`/api/trails/${slug}`),
    enabled: Boolean(slug),
  });
  const orgs = useQuery({
    queryKey: ['orgs', 'manage', 'trail-form'],
    queryFn: () => api<Page<OrgListItem>>('/api/organizations?scope=manage&pageSize=200'),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<TrailRow>(creating ? '/api/trails' : `/api/trails/${slug}`, {
        method: creating ? 'POST' : 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: async (saved) => {
      await client.invalidateQueries({ queryKey: ['trails'] });
      navigate(`/admin/trails/edit/${saved.slug}`);
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Could not save the trail.');
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/api/trails/${slug}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['trails'] });
      navigate('/admin/trails');
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const line = parseLine(String(form.get('line') ?? ''));
    if (!line) {
      setError('Enter at least two points. Each line is longitude, latitude.');
      return;
    }
    setError('');
    const steward = String(form.get('dataStewardOrgId') ?? '');
    const owner = String(form.get('maintenanceOwnerOrgId') ?? '');
    save.mutate({
      name: String(form.get('name') ?? ''),
      summary: String(form.get('summary') ?? ''),
      status: String(form.get('status') ?? 'DRAFT'),
      visibility: String(form.get('visibility') ?? 'PUBLIC'),
      line,
      dataStewardOrgId: steward || null,
      maintenanceOwnerOrgId: owner || null,
    });
  }

  if (!creating && trail.isLoading) return <p>Loading…</p>;
  if (trail.error instanceof ApiError) return <p>{trail.error.message}</p>;
  const data = trail.data;

  return (
    <div className="space-y-6">
      <p>
        <Link to="/admin/trails">Trails</Link>
      </p>
      <h2 className="text-xl font-semibold text-navy">{creating ? 'Add a trail' : data?.name}</h2>
      <form className="max-w-xl space-y-3" onSubmit={onSubmit}>
        <Field label="Name">
          <input className={inputClass} name="name" required defaultValue={data?.name ?? ''} />
        </Field>
        <Field label="Summary">
          <textarea className={inputClass} name="summary" rows={3} defaultValue={data?.summary ?? ''} />
        </Field>
        <Field label="Line (longitude, latitude — one point per line)">
          <textarea
            className={inputClass}
            name="line"
            rows={6}
            required
            defaultValue={formatLine(data?.line ?? null)}
            placeholder={'-135.33, 57.05\n-135.20, 57.08'}
          />
        </Field>
        <Field label="Status">
          <select className={inputClass} name="status" defaultValue={data?.status ?? 'DRAFT'}>
            {contentStatuses.map((status) => (
              <option key={status} value={status}>
                {status === 'PUBLISHED' ? 'Published' : status === 'DRAFT' ? 'Draft' : 'Archived'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Who can see it">
          <select className={inputClass} name="visibility" defaultValue={data?.visibility ?? 'PUBLIC'}>
            {visibilities.map((value) => (
              <option key={value} value={value}>
                {value === 'PUBLIC' ? 'Public' : value === 'PARTNERS' ? 'Partners' : 'Private'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Data steward">
          <select
            className={inputClass}
            name="dataStewardOrgId"
            defaultValue={data?.dataStewardOrgId ?? ''}
          >
            <option value="">None yet</option>
            {orgs.data?.items.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Maintenance owner">
          <select
            className={inputClass}
            name="maintenanceOwnerOrgId"
            defaultValue={data?.maintenanceOwnerOrgId ?? ''}
          >
            <option value="">None yet</option>
            {orgs.data?.items.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </Field>
        {error ? <p className="text-stale">{error}</p> : null}
        <button className={buttonClass()} type="submit" disabled={save.isPending}>
          Save trail
        </button>
      </form>
      {data ? <AssetEditor slug={data.slug} assets={data.assets} /> : null}
      {data ? (
        <WorkdayEditor slug={data.slug} workdays={data.workdays} orgs={orgs.data?.items ?? []} />
      ) : null}
      {data ? <CounterEditor slug={data.slug} counters={data.counters} /> : null}
      {data ? <FileEditor slug={data.slug} files={data.files} /> : null}
      {data ? (
        <PacketEditor
          slug={data.slug}
          issues={data.issues}
          workdays={data.workdays}
          files={data.files}
          packets={data.packets}
          ownerEmail={
            orgs.data?.items.find((org) => org.id === data.maintenanceOwnerOrgId)?.contactEmail ?? ''
          }
        />
      ) : null}
      {data ? (
        <a className={buttonClass('quiet')} href={`/api/trails/${data.slug}/packet`}>
          Download work list
        </a>
      ) : null}
      {data ? (
        <button
          className={buttonClass('quiet')}
          type="button"
          onClick={() => {
            if (window.confirm('Remove this trail from the map?')) remove.mutate();
          }}
        >
          Remove trail
        </button>
      ) : null}
    </div>
  );
}

function AssetEditor({ slug, assets }: { slug: string; assets: TrailRow['assets'] }) {
  const client = useQueryClient();
  const [error, setError] = useState('');
  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/api/trails/${slug}/assets`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: async () => {
      setError('');
      await client.invalidateQueries({ queryKey: ['trail', 'manage', slug] });
      await client.invalidateQueries({ queryKey: ['trails'] });
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Could not add that place.');
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/trails/${slug}/assets/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['trail', 'manage', slug] });
    },
  });

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const point = parsePoint(String(data.get('point') ?? ''));
    if (!point) {
      setError('Enter the place as longitude, latitude.');
      return;
    }
    add.mutate(
      {
        name: String(data.get('name') ?? ''),
        kind: String(data.get('kind') ?? 'OTHER'),
        notes: String(data.get('notes') ?? ''),
        point,
      },
      { onSuccess: () => form.reset() },
    );
  }

  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-navy">Places on this trail</h3>
      <ul className="space-y-2">
        {assets.map((asset) => (
          <li key={asset.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {asset.name} · {ASSET_KIND_LABELS[asset.kind as (typeof assetKinds)[number]] ?? asset.kind}
            </span>
            <button className={buttonClass('quiet')} type="button" onClick={() => remove.mutate(asset.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form className="max-w-xl space-y-3" onSubmit={onAdd}>
        <Field label="Place name">
          <input className={inputClass} name="name" required />
        </Field>
        <Field label="Kind">
          <select className={inputClass} name="kind" defaultValue="TRAILHEAD">
            {assetKinds.map((kind) => (
              <option key={kind} value={kind}>
                {ASSET_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes">
          <input className={inputClass} name="notes" />
        </Field>
        <Field label="Point (longitude, latitude)">
          <input className={inputClass} name="point" required placeholder="-135.33, 57.05" />
        </Field>
        {error ? <p className="text-stale">{error}</p> : null}
        <button className={buttonClass('quiet')} type="submit" disabled={add.isPending}>
          Add place
        </button>
      </form>
    </section>
  );
}

function WorkdayEditor({
  slug,
  workdays,
  orgs,
}: {
  slug: string;
  workdays: TrailRow['workdays'];
  orgs: { id: string; name: string }[];
}) {
  const client = useQueryClient();
  const [error, setError] = useState('');
  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/api/trails/${slug}/workdays`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: async () => {
      setError('');
      await client.invalidateQueries({ queryKey: ['trail', 'manage', slug] });
      await client.invalidateQueries({ queryKey: ['maintenance-board'] });
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Could not add that work day.');
    },
  });
  const markDone = useMutation({
    mutationFn: (id: string) =>
      api(`/api/trails/${slug}/workdays/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'DONE' }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['trail', 'manage', slug] });
      await client.invalidateQueries({ queryKey: ['maintenance-board'] });
    },
  });

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const host = String(data.get('hostOrgId') ?? '');
    add.mutate(
      {
        title: String(data.get('title') ?? ''),
        workDate: String(data.get('workDate') ?? ''),
        notes: String(data.get('notes') ?? ''),
        hostOrgId: host || null,
      },
      { onSuccess: () => form.reset() },
    );
  }

  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-navy">Work days</h3>
      <ul className="space-y-2">
        {workdays.map((day) => (
          <li key={day.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {formatDay(day.workDate)} — {day.title}
              {day.status === 'PLANNED' ? '' : ` · ${day.status === 'DONE' ? 'Done' : 'Canceled'}`}
              {day.hostOrg ? ` · ${day.hostOrg.name}` : ''}
            </span>
            {day.status === 'PLANNED' ? (
              <button className={buttonClass('quiet')} type="button" onClick={() => markDone.mutate(day.id)}>
                Mark done
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <form className="max-w-xl space-y-3" onSubmit={onAdd}>
        <Field label="Work day title">
          <input className={inputClass} name="title" required />
        </Field>
        <Field label="Date">
          <input className={inputClass} name="workDate" type="date" required />
        </Field>
        <Field label="Work notes">
          <input className={inputClass} name="notes" />
        </Field>
        <Field label="Host">
          <select className={inputClass} name="hostOrgId" defaultValue="">
            <option value="">None yet</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </Field>
        {error ? <p className="text-stale">{error}</p> : null}
        <button className={buttonClass('quiet')} type="submit" disabled={add.isPending}>
          Add work day
        </button>
      </form>
    </section>
  );
}

function CounterEditor({ slug, counters }: { slug: string; counters: TrailRow['counters'] }) {
  const client = useQueryClient();
  const [error, setError] = useState('');
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['trail', 'manage', slug] });
    await client.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/api/trails/${slug}/counters`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: async () => {
      setError('');
      await refresh();
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Could not add that counter.');
    },
  });
  const addReading = useMutation({
    mutationFn: (body: { id: string; recordedOn: string; count: number }) =>
      api(`/api/trails/${slug}/counters/${body.id}/readings`, {
        method: 'POST',
        body: JSON.stringify({ recordedOn: body.recordedOn, count: body.count }),
      }),
    onSuccess: async () => {
      setError('');
      await refresh();
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Could not save that count.');
    },
  });
  const review = useMutation({
    mutationFn: (id: string) => api(`/api/trails/${slug}/counters/${id}/review`, { method: 'POST' }),
    onSuccess: refresh,
  });

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    add.mutate(
      {
        name: String(data.get('name') ?? ''),
        kind: String(data.get('kind') ?? 'TRAIL'),
        notes: String(data.get('notes') ?? ''),
      },
      { onSuccess: () => form.reset() },
    );
  }

  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-navy">Counters</h3>
      <p className="text-sm">Enter the number from the counter for that date. It is not added to older numbers.</p>
      <ul className="space-y-3">
        {counters.map((counter) => (
          <li key={counter.id} className="space-y-2 rounded border border-line p-3">
            <p className="font-medium">
              {counter.name} · {COUNTER_KIND_LABELS[counter.kind as (typeof counterKinds)[number]] ?? counter.kind}
            </p>
            <FreshnessBadge value={counter.freshness} reviewedAt={counter.reviewedAt} />
            {counter.latest ? (
              <p>
                Latest: {formatCount(counter.latest.count)} visits on {formatDay(counter.latest.recordedOn)}
              </p>
            ) : (
              <p>No count yet.</p>
            )}
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const count = Number(data.get('count'));
                if (!Number.isInteger(count) || count < 0) {
                  setError('Enter a whole number of visits.');
                  return;
                }
                addReading.mutate(
                  {
                    id: counter.id,
                    recordedOn: String(data.get('recordedOn') ?? ''),
                    count,
                  },
                  { onSuccess: () => event.currentTarget.reset() },
                );
              }}
            >
              <Field label="Count date">
                <input className={inputClass} name="recordedOn" type="date" required />
              </Field>
              <Field label="Count">
                <input className={inputClass} name="count" type="number" min={0} required />
              </Field>
              <button className={buttonClass('quiet')} type="submit" disabled={addReading.isPending}>
                Add count
              </button>
            </form>
            <button className={buttonClass('quiet')} type="button" onClick={() => review.mutate(counter.id)}>
              Mark reviewed
            </button>
          </li>
        ))}
      </ul>
      <form className="max-w-xl space-y-3" onSubmit={onAdd}>
        <Field label="Counter name">
          <input className={inputClass} name="name" required />
        </Field>
        <Field label="Counter kind">
          <select className={inputClass} name="kind" defaultValue="TRAIL">
            {counterKinds.map((kind) => (
              <option key={kind} value={kind}>
                {COUNTER_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Counter notes">
          <input className={inputClass} name="notes" />
        </Field>
        {error ? <p className="text-stale">{error}</p> : null}
        <button className={buttonClass('quiet')} type="submit" disabled={add.isPending}>
          Add counter
        </button>
      </form>
    </section>
  );
}

function FileEditor({ slug, files }: { slug: string; files: TrailRow['files'] }) {
  const client = useQueryClient();
  const [error, setError] = useState('');
  const refresh = () => client.invalidateQueries({ queryKey: ['trail', 'manage', slug] });
  const upload = useMutation({
    mutationFn: (body: FormData) => api(`/api/trails/${slug}/files`, { method: 'POST', body }),
    onSuccess: async () => {
      setError('');
      await refresh();
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Could not upload that file.');
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/trails/${slug}/files/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    upload.mutate(new FormData(form), { onSuccess: () => form.reset() });
  }

  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-navy">Files</h3>
      <p className="text-sm">PDF or photo, up to 5 MB. A public file shows on the trail page.</p>
      <ul className="space-y-2">
        {files.map((file) => (
          <li key={file.id} className="flex flex-wrap items-center justify-between gap-2">
            <a href={`/api/files/${file.id}`}>{file.name}</a>
            <span className="text-sm">{file.visibility === 'PUBLIC' ? 'Public' : 'Only editors'}</span>
            <button className={buttonClass('quiet')} type="button" onClick={() => remove.mutate(file.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form className="max-w-xl space-y-3" onSubmit={onUpload}>
        <Field label="Trail file">
          <input
            className={inputClass}
            name="file"
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            required
          />
        </Field>
        <Field label="Who can download it">
          <select className={inputClass} name="visibility" defaultValue="PRIVATE">
            <option value="PRIVATE">Only editors</option>
            <option value="PUBLIC">Public</option>
          </select>
        </Field>
        {error ? <p className="text-stale">{error}</p> : null}
        <button className={buttonClass('quiet')} type="submit" disabled={upload.isPending}>
          Upload file
        </button>
      </form>
    </section>
  );
}

function formatSent(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Anchorage',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function PacketEditor({
  slug,
  issues,
  workdays,
  files,
  packets,
  ownerEmail,
}: {
  slug: string;
  issues: TrailRow['issues'];
  workdays: TrailRow['workdays'];
  files: TrailRow['files'];
  packets: TrailRow['packets'];
  ownerEmail: string;
}) {
  const client = useQueryClient();
  const [error, setError] = useState('');
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['trail', 'manage', slug] });
    await client.invalidateQueries({ queryKey: ['maintenance-board'] });
  };
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/api/trails/${slug}/packets`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: async () => {
      setError('');
      await refresh();
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Could not save that work packet.');
    },
  });
  const update = useMutation({
    mutationFn: (body: { id: string; status: string }) =>
      api(`/api/packets/${body.id}`, { method: 'PATCH', body: JSON.stringify({ status: body.status }) }),
    onSuccess: refresh,
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Could not update that work packet.');
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/packets/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const send = useMutation({
    mutationFn: (body: { id: string; to: string }) =>
      api(`/api/packets/${body.id}/send`, { method: 'POST', body: JSON.stringify({ to: body.to }) }),
    onSuccess: async () => {
      setError('');
      await refresh();
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Could not send that work packet.');
    },
  });

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    save.mutate(
      {
        title: String(data.get('title') ?? ''),
        notes: String(data.get('notes') ?? ''),
        status: String(data.get('status') ?? 'DRAFT'),
        issueIds: data.getAll('issueIds').map(String),
        workdayIds: data.getAll('workdayIds').map(String),
        fileIds: data.getAll('fileIds').map(String),
      },
      { onSuccess: () => form.reset() },
    );
  }

  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-navy">Work packets</h3>
      <p className="text-sm">
        Save the problems, work days, and files you want in one packet. Download prints that packet, not everything open today.
      </p>
      <ul className="space-y-3">
        {packets.map((packet) => (
          <li key={packet.id} className="space-y-2 rounded border border-line p-3">
            <p className="font-medium">
              {packet.title} · {PACKET_STATUS_LABELS[packet.status as (typeof packetStatuses)[number]] ?? packet.status}
            </p>
            {packet.notes ? <p className="text-sm">{packet.notes}</p> : null}
            <Field label={`Status for ${packet.title}`}>
              <select
                className={inputClass}
                value={packet.status}
                onChange={(event) => update.mutate({ id: packet.id, status: event.target.value })}
              >
                {packetStatuses.map((status) => (
                  <option key={status} value={status}>
                    {PACKET_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </Field>
            {packet.sentTo && packet.sentAt ? (
              <p className="text-sm">
                Sent to {packet.sentTo} on {formatSent(packet.sentAt)}
              </p>
            ) : null}
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                send.mutate({ id: packet.id, to: String(data.get('to') ?? '') });
              }}
            >
              <Field label={`Send ${packet.title} to`}>
                <input
                  key={ownerEmail || 'none'}
                  className={inputClass}
                  name="to"
                  type="email"
                  required
                  defaultValue={ownerEmail}
                />
              </Field>
              <button className={buttonClass('quiet')} type="submit" disabled={send.isPending}>
                Send packet
              </button>
            </form>
            <div className="flex flex-wrap gap-2">
              <a className={buttonClass('quiet')} href={`/api/packets/${packet.id}/pdf`}>
                Download packet
              </a>
              <button className={buttonClass('quiet')} type="button" onClick={() => remove.mutate(packet.id)}>
                Remove packet
              </button>
            </div>
          </li>
        ))}
      </ul>
      <form className="max-w-xl space-y-3" onSubmit={onSave}>
        <Field label="Packet title">
          <input className={inputClass} name="title" required />
        </Field>
        <Field label="Packet notes">
          <input className={inputClass} name="notes" />
        </Field>
        <Field label="Packet status">
          <select className={inputClass} name="status" defaultValue="DRAFT">
            {packetStatuses.map((status) => (
              <option key={status} value={status}>
                {PACKET_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </Field>
        <div className="space-y-2">
          <p className="text-sm font-medium text-navy">Problems</p>
          {issues.length === 0 ? <p className="text-sm">None.</p> : null}
          {issues.map((issue) => (
            <label key={issue.id} className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="issueIds" value={issue.id} />
              {issue.title}
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-navy">Work days</p>
          {workdays.length === 0 ? <p className="text-sm">None.</p> : null}
          {workdays.map((day) => (
            <label key={day.id} className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="workdayIds" value={day.id} />
              {formatDay(day.workDate)} — {day.title}
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-navy">Files in the packet</p>
          {files.length === 0 ? <p className="text-sm">None.</p> : null}
          {files.map((file) => (
            <label key={file.id} className="flex min-h-11 items-center gap-2">
              <input type="checkbox" name="fileIds" value={file.id} />
              {file.name}
            </label>
          ))}
        </div>
        {error ? <p className="text-stale">{error}</p> : null}
        <button className={buttonClass('quiet')} type="submit" disabled={save.isPending}>
          Save work packet
        </button>
      </form>
    </section>
  );
}
