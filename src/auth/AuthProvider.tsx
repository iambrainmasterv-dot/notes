import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api, getToken, setToken } from '../api/client';
import { readResetTokenFromUrl, looksLikePasswordResetToken } from './resetTokenFromUrl';

const GUEST_SESSION_KEY = 'notesapp_guest_session';
const USER_CACHE_KEY = 'notesapp_user_cache';

export interface AppUser {
  id: string;
  email: string;
}

interface AuthCtx {
  user: AppUser | null;
  /** Local-only session: notes/tasks/settings on device, no account sync or Jarvis API */
  isGuest: boolean;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  continueAsGuest: () => void;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

function readGuestFlag(): boolean {
  try {
    return sessionStorage.getItem(GUEST_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const reset = readResetTokenFromUrl();
    if (looksLikePasswordResetToken(reset)) {
      setToken(null);
    }
    const token = getToken();
    if (token) {
      api.me()
        .then(({ user: u }) => {
          setUser(u);
          setIsGuest(false);
          try {
            sessionStorage.removeItem(GUEST_SESSION_KEY);
            localStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
          } catch {
            /* ignore */
          }
        })
        .catch(() => {
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            try {
              const raw = localStorage.getItem(USER_CACHE_KEY);
              if (raw) {
                const u = JSON.parse(raw) as AppUser;
                if (u?.id && u?.email) {
                  setUser(u);
                  return;
                }
              }
            } catch {
              /* ignore */
            }
          }
          setToken(null);
        })
        .finally(() => setLoading(false));
      return;
    }
    if (readGuestFlag()) {
      setIsGuest(true);
    }
    setLoading(false);
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      const { token, user: u } = await api.signup(email, password);
      setToken(token);
      setUser(u);
      setIsGuest(false);
      try {
        sessionStorage.removeItem(GUEST_SESSION_KEY);
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
      } catch {
        /* ignore */
      }
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
      setIsGuest(false);
      try {
        sessionStorage.removeItem(GUEST_SESSION_KEY);
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
      } catch {
        /* ignore */
      }
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }, []);

  const signOut = useCallback(async () => {
    setToken(null);
    setUser(null);
    setIsGuest(false);
    try {
      sessionStorage.removeItem(GUEST_SESSION_KEY);
      localStorage.removeItem(USER_CACHE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const continueAsGuest = useCallback(() => {
    setToken(null);
    setUser(null);
    setIsGuest(true);
    try {
      sessionStorage.setItem(GUEST_SESSION_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isGuest, loading, signUp, signIn, signOut, continueAsGuest }}
    >
      {children}
    </AuthContext.Provider>
  );
}
