import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Feed from './pages/Feed.jsx';
import Communities from './pages/Communities.jsx';
import PostPage from './pages/PostPage.jsx';
import Submit from './pages/Submit.jsx';
import Search from './pages/Search.jsx';
import Notifications from './pages/Notifications.jsx';
import Profile from './pages/Profile.jsx';
import Admin from './pages/Admin.jsx';
import Moderation from './pages/Moderation.jsx';
import { Login, Register } from './pages/Auth.jsx';

function Protected({ children, need }) {
  const { user, loading, isMod, isAdmin } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="empty">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (need === 'mod' && !isMod) return <div className="empty">Moderators only.</div>;
  if (need === 'admin' && !isAdmin) return <div className="empty">Admins only.</div>;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<Layout />}>
        <Route index element={<Feed mode="home" />} />
        <Route path="/all" element={<Feed mode="all" />} />
        <Route path="/c" element={<Communities />} />
        <Route path="/c/:name" element={<Feed mode="community" />} />
        <Route path="/post/:id" element={<PostPage />} />
        <Route path="/submit" element={<Protected><Submit /></Protected>} />
        <Route path="/search" element={<Search />} />
        <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
        <Route path="/u/:username" element={<Profile />} />
        <Route path="/moderation" element={<Protected need="mod"><Moderation /></Protected>} />
        <Route path="/admin" element={<Protected need="admin"><Admin /></Protected>} />
        <Route path="*" element={<div className="empty">Page not found.</div>} />
      </Route>
    </Routes>
  );
}
