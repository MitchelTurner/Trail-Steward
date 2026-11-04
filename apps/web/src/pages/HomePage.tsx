import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api';
import type { TopicSummary } from '../types';
import { TOPIC_COLORS, buttonClass, inputClass } from '../ui';

type SearchHit = {
  topics: { slug: string; name: string; question: string }[];
  organizations: { slug: string; name: string; shortName: string | null }[];
  resources: { id: string; title: string; url: string }[];
};

export function HomePage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const topics = useQuery({
    queryKey: ['topics'],
    queryFn: () => api<TopicSummary[]>('/api/topics'),
  });
  const search = useQuery({
    queryKey: ['search', q],
    queryFn: () => api<SearchHit>(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
  });

  return (
    <div className="space-y-6">
      <p className="text-xl text-navy">
        What do I need to do next to move my trail project forward, and who do I talk to?
      </p>
      <div className="flex flex-wrap gap-3">
        <Link to="/start/funding-application" className={`${buttonClass()} text-lg no-underline`}>
          Start: prepare for a funding application
        </Link>
        <Link to="/map" className={`${buttonClass('quiet')} text-lg no-underline`}>
          See trails on the map
        </Link>
      </div>
      <form className="flex flex-col gap-2 sm:flex-row" action="/" method="get">
        <label className="flex-1">
          <span className="sr-only">Search</span>
          <input
            className={inputClass}
            name="q"
            defaultValue={q}
            placeholder="Search players, topics, resources"
          />
        </label>
        <button className={buttonClass()} type="submit">
          Search
        </button>
      </form>
      {q.trim() && search.data ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-navy">Results for “{q}”</h2>
          {search.data.topics.length +
            search.data.organizations.length +
            search.data.resources.length ===
          0 ? (
            <p>No matches.</p>
          ) : null}
          <ul className="space-y-2">
            {search.data.topics.map((topic) => (
              <li key={topic.slug}>
                <Link to={`/topics/${topic.slug}`}>{topic.name}</Link>
              </li>
            ))}
            {search.data.organizations.map((org) => (
              <li key={org.slug}>
                <Link to={`/orgs/${org.slug}`}>{org.name}</Link>
              </li>
            ))}
            {search.data.resources.map((resource) => (
              <li key={resource.id}>
                <a href={resource.url}>{resource.title}</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {topics.isLoading ? <p>Loading topics…</p> : null}
      {topics.isError ? (
        <p>
          Could not load topics.
          {topics.error instanceof ApiError ? ` ${topics.error.message}` : ''}
        </p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {topics.data?.map((topic) => (
          <li key={topic.slug}>
            <Link
              to={`/topics/${topic.slug}`}
              className="block rounded p-4 text-white no-underline"
              style={{ background: TOPIC_COLORS[topic.slug] ?? '#1b365d' }}
            >
              <span className="block text-sm">{topic.question}</span>
              <span className="mt-2 block text-lg font-semibold">{topic.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
