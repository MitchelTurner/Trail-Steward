import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ASSET_KIND_LABELS, assetKinds } from 'shared/kinds';
import { api, ApiError } from '../api';
import { TrailMap, type MapLine, type MapPoint } from '../features/map/TrailMap';
import { Field, FreshnessBadge, buttonClass, formatDay, inputClass } from '../ui';
import type { Freshness } from 'shared';

type TrailDetail = {
  slug: string;
  name: string;
  summary: string;
  line: MapLine | null;
  dataSteward: { slug: string; name: string } | null;
  maintenanceOwner: { slug: string; name: string } | null;
  assets: {
    id: string;
    name: string;
    kind: string;
    notes: string | null;
    point: MapPoint | null;
  }[];
  freshness: Freshness;
  reviewedAt: string | null;
  workdays: {
    id: string;
    title: string;
    notes: string | null;
    workDate: string;
    status?: string;
    hostOrg: { slug: string; name: string } | null;
  }[];
};

function kindName(kind: string): string {
  if ((assetKinds as readonly string[]).includes(kind)) {
    return ASSET_KIND_LABELS[kind as (typeof assetKinds)[number]];
  }
  return kind;
}

export function TrailPage() {
  const { slug = '' } = useParams();
  const trail = useQuery({
    queryKey: ['trail', slug],
    queryFn: () => api<TrailDetail>(`/api/trails/${slug}`),
  });
  const [sent, setSent] = useState(false);
  const [changeSent, setChangeSent] = useState(false);
  const [error, setError] = useState('');
  const [changeError, setChangeError] = useState('');
  const report = useMutation({
    mutationFn: (body: { title: string; detail: string; fax: string }) =>
      api('/api/issues', {
        method: 'POST',
        body: JSON.stringify({ ...body, trailSlug: slug }),
      }),
    onSuccess: () => {
      setSent(true);
      setError('');
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Could not send that report.');
    },
  });
  const ask = useMutation({
    mutationFn: (body: { message: string; fax: string }) =>
      api(`/api/trails/${slug}/change-requests`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setChangeSent(true);
      setChangeError('');
    },
    onError: (err: unknown) => {
      setChangeError(err instanceof ApiError ? err.message : 'Could not send that request.');
    },
  });

  function onChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    ask.mutate({
      message: String(form.get('message') ?? ''),
      fax: String(form.get('fax') ?? ''),
    });
  }

  function onReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    report.mutate({
      title: String(form.get('title') ?? ''),
      detail: String(form.get('detail') ?? ''),
      fax: String(form.get('fax') ?? ''),
    });
  }

  if (trail.isLoading) return <p>Loading…</p>;
  if (trail.error instanceof ApiError) return <p>{trail.error.message}</p>;
  if (!trail.data) return null;
  const data = trail.data;

  return (
    <div className="space-y-6">
      <p>
        <Link to="/map">Trail map</Link>
      </p>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-navy">{data.name}</h1>
        <FreshnessBadge value={data.freshness} reviewedAt={data.reviewedAt} />
        {data.summary ? <p>{data.summary}</p> : null}
      </div>
      {data.line ? <TrailMap trails={[data]} /> : <p>This trail has no line yet.</p>}
      <section className="space-y-1">
        <h2 className="font-semibold text-navy">Who looks after the data</h2>
        {data.dataSteward ? (
          <p>
            <Link to={`/orgs/${data.dataSteward.slug}`}>{data.dataSteward.name}</Link>
          </p>
        ) : (
          <p>No data steward is named yet.</p>
        )}
        <h2 className="font-semibold text-navy">Who looks after the trail</h2>
        {data.maintenanceOwner ? (
          <p>
            <Link to={`/orgs/${data.maintenanceOwner.slug}`}>{data.maintenanceOwner.name}</Link>
          </p>
        ) : (
          <p>No maintenance owner is named yet.</p>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold text-navy">Planned work</h2>
        {data.workdays.filter((day) => !day.status || day.status === 'PLANNED').length === 0 ? (
          <p>No work day is planned.</p>
        ) : null}
        <ul className="space-y-2">
          {data.workdays
            .filter((day) => !day.status || day.status === 'PLANNED')
            .map((day) => (
            <li key={day.id} className="rounded border border-line bg-card p-3">
              <p className="font-medium">
                {formatDay(day.workDate)} — {day.title}
              </p>
              {day.hostOrg ? <p className="text-sm">Host: {day.hostOrg.name}</p> : null}
              {day.notes ? <p className="text-sm">{day.notes}</p> : null}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold text-navy">Places on this trail</h2>
        {data.assets.length === 0 ? <p>None listed.</p> : null}
        <ul className="space-y-2">
          {data.assets.map((asset) => (
            <li key={asset.id} className="rounded border border-line bg-card p-3">
              <p className="font-medium">
                {asset.name} · {kindName(asset.kind)}
              </p>
              {asset.notes ? <p className="text-sm">{asset.notes}</p> : null}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold text-navy">Report a problem</h2>
        {sent ? <p>Thanks. An editor will see this on the review board.</p> : null}
        {sent ? null : (
          <form className="max-w-xl space-y-3" onSubmit={onReport}>
            <Field label="Short title">
              <input className={inputClass} name="title" required maxLength={200} />
            </Field>
            <Field label="What is wrong">
              <textarea className={inputClass} name="detail" required rows={4} maxLength={4000} />
            </Field>
            <input className="hidden" name="fax" tabIndex={-1} autoComplete="off" />
            {error ? <p className="text-stale">{error}</p> : null}
            <button className={buttonClass()} type="submit" disabled={report.isPending}>
              Send report
            </button>
          </form>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold text-navy">Ask for a map change</h2>
        <p className="text-sm">Use this when the line, the name, or the owner on the map is wrong.</p>
        {changeSent ? <p>Thanks. An editor will see this request.</p> : null}
        {changeSent ? null : (
          <form className="max-w-xl space-y-3" onSubmit={onChange}>
            <Field label="What should change">
              <textarea className={inputClass} name="message" required rows={4} maxLength={4000} />
            </Field>
            <input className="hidden" name="fax" tabIndex={-1} autoComplete="off" />
            {changeError ? <p className="text-stale">{changeError}</p> : null}
            <button className={buttonClass('quiet')} type="submit" disabled={ask.isPending}>
              Send request
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
