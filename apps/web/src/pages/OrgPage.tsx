import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import type { OrgDetail } from '../types';
import { FreshnessBadge, LinkStatus, WrongLink, freshnessLabel, kindLabel } from '../ui';

export function OrgPage() {
  const { slug = '' } = useParams();
  const org = useQuery({
    queryKey: ['org', slug],
    queryFn: () => api<OrgDetail>(`/api/organizations/${slug}`),
  });
  if (org.isLoading) return <p>Loading…</p>;
  if (org.error instanceof ApiError) return <p>{org.error.message}</p>;
  if (!org.data) return <p>Organization not found.</p>;
  const data = org.data;
  return (
    <div className="space-y-5">
      <p className="text-sm">
        <Link to="/orgs">Directory</Link>
      </p>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="text-2xl font-semibold text-navy">{data.name}</h1>
        <FreshnessBadge value={data.freshness} reviewedAt={data.reviewedAt} />
      </div>
      <p className="text-sm text-muted">{kindLabel(data.kind)}</p>
      {data.description ? <p>{data.description}</p> : null}
      {data.websiteUrl ? (
        <p>
          <a href={data.websiteUrl}>Website</a>
        </p>
      ) : null}
      {data.contactName || data.contactEmail || data.contactPhone ? (
        <p className="text-sm">
          Contact:{' '}
          {[data.contactName, data.contactEmail, data.contactPhone].filter(Boolean).join(' · ')}
        </p>
      ) : null}
      <WrongLink type="organization" id={data.id} />
      <section>
        <h2 className="text-xl font-semibold text-navy">Role by topic</h2>
        <div className="mt-2 overflow-hidden rounded border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-navy">
              <tr>
                <th className="p-2">Topic</th>
                <th className="p-2">Role</th>
              </tr>
            </thead>
            <tbody>
              {data.rolesByTopic.map((role) => (
                <tr key={role.topicSlug} className="border-t border-line bg-card align-top">
                  <td className="p-2">
                    <Link to={`/topics/${role.topicSlug}`}>{role.topicName}</Link>
                  </td>
                  <td className="p-2">
                    <p>{role.roleLabel ?? 'Not listed'}</p>
                    {role.resourcesText ? (
                      <p className="mt-1">Resources: {role.resourcesText}</p>
                    ) : null}
                    {role.needsText ? <p className="mt-1">Needs: {role.needsText}</p> : null}
                    {role.freshness ? (
                      <p className="mt-1 text-muted">{freshnessLabel(role.freshness, null)}</p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {data.resources.length > 0 ? (
        <section>
          <h2 className="text-xl font-semibold text-navy">Resources</h2>
          <ul className="mt-2 space-y-1">
            {data.resources.map((resource) => (
              <li key={resource.id} className="flex flex-wrap items-center gap-2">
                <a href={resource.url}>{resource.title}</a>
                <LinkStatus status={resource.linkStatus} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
