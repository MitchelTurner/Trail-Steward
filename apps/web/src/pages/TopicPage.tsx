import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { MarkdownText } from '../markdown';
import type { PlayerRow, TopicDetail } from '../types';
import { FreshnessBadge, LinkStatus, WrongLink } from '../ui';

function PlayerCard({ player }: { player: PlayerRow }) {
  return (
    <article className="rounded border border-line bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link to={`/orgs/${player.organization.slug}`} className="font-semibold">
          {player.organization.name}
        </Link>
        <FreshnessBadge value={player.freshness} reviewedAt={player.reviewedAt} />
      </div>
      <p className="mt-1 text-sm">{player.roleLabel}</p>
      {player.resourcesText ? <p className="mt-2 text-sm">{player.resourcesText}</p> : null}
      {player.needsText ? <p className="mt-2 text-sm">Needs: {player.needsText}</p> : null}
      {player.resources.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {player.resources.map((resource) => (
            <li key={resource.id} className="flex flex-wrap items-center gap-2">
              <a href={resource.url}>{resource.title}</a>
              <LinkStatus status={resource.linkStatus} />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2">
        <WrongLink type="playerRole" id={player.id} />
      </div>
    </article>
  );
}

export function TopicPage() {
  const { slug = '' } = useParams();
  const topic = useQuery({
    queryKey: ['topic', slug],
    queryFn: () => api<TopicDetail>(`/api/topics/${slug}`),
  });
  if (topic.isLoading) return <p>Loading…</p>;
  if (topic.error instanceof ApiError) return <p>{topic.error.message}</p>;
  if (!topic.data) return <p>Topic not found.</p>;
  const data = topic.data;
  const groups = new Map<string, PlayerRow[]>();
  for (const player of data.players.documented) {
    const names = player.roleTypeNames.length > 0 ? player.roleTypeNames : ['Other'];
    for (const name of names) {
      const list = groups.get(name) ?? [];
      list.push(player);
      groups.set(name, list);
    }
  }
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">
          <Link to="/">Home</Link>
        </p>
        <h1 className="text-2xl font-semibold text-navy">{data.name}</h1>
        <p className="mt-2 text-lg">{data.question}</p>
      </div>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-navy">What we learned</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.learnings.map((learning) => (
            <li key={learning.id} className="rounded border border-line bg-card p-3">
              <h3 className="font-semibold text-navy">{learning.heading}</h3>
              <MarkdownText text={learning.body} />
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-navy">Who does what</h2>
        {[...groups.entries()].map(([name, players]) => (
          <div key={name} className="space-y-2">
            <h3 className="font-semibold text-navy">{name}</h3>
            <p className="text-sm text-muted">
              {data.roleTypes.find((role) => role.name === name)?.definition}
            </p>
            <div className="space-y-2">
              {players.map((player) => (
                <PlayerCard key={`${name}-${player.id}`} player={player} />
              ))}
            </div>
          </div>
        ))}
        <details className="rounded border border-line bg-card p-3">
          <summary className="cursor-pointer font-medium">
            Not yet documented ({data.players.notDocumented.length})
          </summary>
          <div className="mt-3 space-y-2">
            {data.players.notDocumented.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
          </div>
        </details>
        <details className="rounded border border-line bg-card p-3">
          <summary className="cursor-pointer font-medium">
            No role ({data.players.noRole.length})
          </summary>
          <div className="mt-3 space-y-2">
            {data.players.noRole.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
          </div>
        </details>
      </section>
    </div>
  );
}
