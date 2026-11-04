import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './ui';
import { HomePage } from './pages/HomePage';

const TopicPage = lazy(() =>
  import('./pages/TopicPage').then((mod) => ({ default: mod.TopicPage })),
);
const OrgsPage = lazy(() => import('./pages/OrgsPage').then((mod) => ({ default: mod.OrgsPage })));
const OrgPage = lazy(() => import('./pages/OrgPage').then((mod) => ({ default: mod.OrgPage })));
const StartPage = lazy(() =>
  import('./pages/StartPage').then((mod) => ({ default: mod.StartPage })),
);
const ChecklistPage = lazy(() =>
  import('./pages/ChecklistPage').then((mod) => ({ default: mod.ChecklistPage })),
);
const SuggestPage = lazy(() =>
  import('./pages/SuggestPage').then((mod) => ({ default: mod.SuggestPage })),
);
const LoginPage = lazy(() =>
  import('./pages/LoginPage').then((mod) => ({ default: mod.LoginPage })),
);
const VerifyPage = lazy(() =>
  import('./pages/VerifyPage').then((mod) => ({ default: mod.VerifyPage })),
);
const AdminApp = lazy(() => import('./admin/AdminApp').then((mod) => ({ default: mod.AdminApp })));
const MapPage = lazy(() => import('./pages/MapPage').then((mod) => ({ default: mod.MapPage })));
const TrailPage = lazy(() => import('./pages/TrailPage').then((mod) => ({ default: mod.TrailPage })));

export function App() {
  return (
    <Layout>
      <Suspense fallback={<p>Loading…</p>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/topics/:slug" element={<TopicPage />} />
          <Route path="/orgs" element={<OrgsPage />} />
          <Route path="/orgs/:slug" element={<OrgPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/trails/:slug" element={<TrailPage />} />
          <Route path="/start/:pathwaySlug" element={<StartPage />} />
          <Route path="/c/:token" element={<ChecklistPage />} />
          <Route path="/suggest" element={<SuggestPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/verify" element={<VerifyPage />} />
          <Route path="/admin/*" element={<AdminApp />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
