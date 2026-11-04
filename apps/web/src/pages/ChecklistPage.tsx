import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { MarkdownText } from '../markdown';
import type { ChecklistView } from '../types';
import { LinkStatus, buttonClass, inputClass } from '../ui';

type StepDraft = { done: boolean; note: string; doneAt?: string };

export function ChecklistPage() {
  const { token = '' } = useParams();
  const checklist = useQuery({
    queryKey: ['checklist', token],
    queryFn: () => api<ChecklistView>(`/api/checklists/${token}`),
  });
  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState<Record<string, StepDraft>>({});
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<'Saved' | 'Saving…' | 'Offline — will retry'>('Saved');
  const [copied, setCopied] = useState(false);
  const payload = useRef({ title: '', stepState: {} as Record<string, StepDraft> });

  useEffect(() => {
    if (!checklist.data || loaded) return;
    const next: Record<string, StepDraft> = {};
    for (const step of checklist.data.steps) {
      next[step.key] = { done: step.done, note: step.note, doneAt: step.doneAt ?? undefined };
    }
    setTitle(checklist.data.title);
    setSteps(next);
    setLoaded(true);
  }, [checklist.data, loaded]);

  payload.current = { title, stepState: steps };

  async function save() {
    setStatus('Saving…');
    try {
      await api(`/api/checklists/${token}`, {
        method: 'PATCH',
        body: JSON.stringify(payload.current),
      });
      setStatus('Saved');
    } catch {
      setStatus('Offline — will retry');
    }
  }

  useEffect(() => {
    if (!loaded || !dirty) return;
    const handle = window.setTimeout(() => {
      void save();
    }, 800);
    return () => window.clearTimeout(handle);
  }, [title, steps, loaded, dirty, token]);

  useEffect(() => {
    if (status !== 'Offline — will retry') return;
    const handle = window.setInterval(() => {
      void save();
    }, 5000);
    return () => window.clearInterval(handle);
  }, [status, token]);

  async function download() {
    const response = await fetch(`/api/checklists/${token}/pdf`, { credentials: 'include' });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'trail-checklist.pdf';
    link.click();
    URL.revokeObjectURL(url);
  }

  if (checklist.isLoading || !loaded) return <p>Loading…</p>;
  if (checklist.error instanceof ApiError) return <p>{checklist.error.message}</p>;
  if (!checklist.data) return null;
  const done = Object.values(steps).filter((step) => step.done).length;
  const total = checklist.data.steps.length;

  return (
    <div className="space-y-5">
      <label className="block">
        <span className="text-sm font-medium text-navy">Checklist title</span>
        <input
          className={inputClass}
          value={title}
          onChange={(event) => {
            setDirty(true);
            setTitle(event.target.value);
          }}
        />
      </label>
      <p className="text-sm text-muted">{checklist.data.pathway.title}</p>
      <div
        className="rounded border border-line bg-card p-3"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-live="polite"
      >
        <div className="mb-2 text-sm">
          {done} of {total} steps done
        </div>
        <div className="h-2 rounded bg-line">
          <div
            className="h-2 rounded bg-forest"
            style={{ width: total === 0 ? '0%' : `${(done / total) * 100}%` }}
          />
        </div>
      </div>
      <p className="text-sm" aria-live="polite">
        {status}
      </p>
      <p className="text-sm">Anyone with this link can view and edit the checklist.</p>
      <div className="flex flex-wrap gap-2">
        <button
          className={buttonClass('quiet')}
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(window.location.href).then(() => setCopied(true));
          }}
        >
          {copied ? 'Link copied' : 'Copy private link'}
        </button>
        <button className={buttonClass('quiet')} type="button" onClick={() => void download()}>
          Download PDF
        </button>
      </div>
      <ol className="space-y-4">
        {checklist.data.steps.map((step, index) => {
          const draft = steps[step.key] ?? { done: false, note: '' };
          return (
            <li key={step.key} className="rounded border border-line bg-card p-4">
              <label className="flex items-start gap-2">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={draft.done}
                  onChange={(event) => {
                    const doneNow = event.target.checked;
                    setDirty(true);
                    setSteps({
                      ...steps,
                      [step.key]: {
                        ...draft,
                        done: doneNow,
                        doneAt: doneNow ? new Date().toISOString() : undefined,
                      },
                    });
                  }}
                />
                <span className="text-lg font-semibold text-navy">
                  {index + 1}. {step.title}
                </span>
              </label>
              <div className="mt-3 space-y-2 text-sm">
                <MarkdownText text={step.why} />
                <MarkdownText text={step.howTo} />
                {step.examples ? <MarkdownText text={step.examples} /> : null}
              </div>
              {step.resources.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {step.resources.map((resource) => (
                    <li key={resource.id} className="flex flex-wrap items-center gap-2">
                      <a href={resource.url}>{resource.title}</a>
                      <LinkStatus status={resource.linkStatus} />
                    </li>
                  ))}
                </ul>
              ) : null}
              {step.contacts.length > 0 ? (
                <div className="mt-3">
                  <h3 className="text-sm font-semibold text-navy">Who to talk to</h3>
                  <ul className="mt-1 space-y-1 text-sm">
                    {step.contacts.map((contact) => (
                      <li key={contact.name}>
                        {contact.name}
                        {contact.websiteUrl ? (
                          <>
                            {' '}
                            — <a href={contact.websiteUrl}>Website</a>
                          </>
                        ) : null}
                        <span className="text-muted"> · {contact.roleLabel}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {step.topicSlugs.length > 0 ? (
                <p className="mt-3 text-sm">
                  {step.topicSlugs.map((slug) => (
                    <Link key={slug} className="mr-3" to={`/topics/${slug}`}>
                      {slug}
                    </Link>
                  ))}
                </p>
              ) : null}
              <label className="mt-3 block text-sm">
                <span className="font-medium text-navy">Private note</span>
                <textarea
                  className={inputClass}
                  rows={2}
                  value={draft.note}
                  onChange={(event) => {
                    setDirty(true);
                    setSteps({ ...steps, [step.key]: { ...draft, note: event.target.value } });
                  }}
                />
              </label>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
