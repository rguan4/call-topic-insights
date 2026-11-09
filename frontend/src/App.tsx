import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth/AuthContext';
import { AppLayout } from './components/AppLayout';
import { PageSkeleton } from './components/States';
import Emerging from './pages/Emerging';
import Labels from './pages/Labels';
import Notes from './pages/Notes';
import Overview from './pages/Overview';
import Search from './pages/Search';
import SignIn from './pages/SignIn';
import TopicDetail from './pages/TopicDetail';
import Topics from './pages/Topics';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div style={{ padding: 28 }}><PageSkeleton /></div>;
  if (!user) return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/**
 * Routes. Filters (range, version, team) are always in the query string.
 *  /topics                     Topics list
 *  /topics/:topicId            Topic detail, all subtopics
 *  /topics/:topicId/:subId     Topic detail, one subtopic
 *  /notes?topic=&sub=...       Support notes list (see pages/Notes.tsx for params)
 *  /search?q=                  Semantic search results
 *  /emerging, /emerging/candidates/:candidateId
 *  /labels, /labels/review
 */
export default function App() {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Overview />} />
        <Route path="topics" element={<Topics />} />
        <Route path="topics/:topicId" element={<TopicDetail />} />
        <Route path="topics/:topicId/:subId" element={<TopicDetail />} />
        <Route path="notes" element={<Notes />} />
        <Route path="search" element={<Search />} />
        <Route path="emerging" element={<Emerging />} />
        <Route path="emerging/candidates/:candidateId" element={<Emerging />} />
        <Route path="labels" element={<Labels />} />
        <Route path="labels/review" element={<Labels />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
