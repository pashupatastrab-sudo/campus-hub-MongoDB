import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(!!getToken());

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setUnread(0); setLoading(false); return; }
    try {
      const d = await api.get('/auth/me');
      setUser(d.user); setUnread(d.unread);
    } catch (e) {
      if (e.status === 401) { setToken(null); setUser(null); }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!user) return;
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [user, refresh]);

  const login = async (identifier, password) => {
    const d = await api.post('/auth/login', { identifier, password });
    setToken(d.token); setUser(d.user); refresh();
  };
  const register = async (form) => {
    const d = await api.post('/auth/register', form);
    setToken(d.token); setUser(d.user); refresh();
  };
  const logout = () => { setToken(null); setUser(null); setUnread(0); };

  const isMod = !!user && (user.role === 'admin' || user.verified_teacher);
  return (
    <Ctx.Provider value={{ user, unread, setUnread, loading, login, register, logout, refresh, isMod, isAdmin: user?.role === 'admin' }}>
      {children}
    </Ctx.Provider>
  );
}
