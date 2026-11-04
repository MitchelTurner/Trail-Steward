import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { lineStringSchema, pointSchema, type GeoPoint, type LineString } from 'shared';
import { ASSET_KIND_LABELS, assetKinds, contentStatuses, visibilities } from 'shared/kinds';
import { api, ApiError } from '../api';
import type { MapLine, MapPoint } from '../features/map/TrailMap';
import type { OrgListItem, Page } from '../types';
import { Field, buttonClass, inputClass } from '../ui';

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
