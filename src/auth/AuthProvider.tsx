import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api, getToken, setToken } from '../api/client';

export interface AppUser {
  id: string;
  email: string;
}

interface AuthCtx {
  user: AppUser | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api.me()
      .then(({ user: u }) => setUser(u))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      const { token, user: u } = await api.signup(email, password);
      setToken(token);
      setUser(u);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      const { token, user: u } = await api.login(email, password);
      setToken(token);
      setUser(u);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }, []);

  const signOut = useCallback(async () => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
