import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginRequest, LoginResponse, User } from '@cti/shared';
import { UNAUTHORIZED_EVENT, apiGet, apiSend, getToken, setToken } from '../api/client';

interface AuthValue {
  user: User | null;
  loading: boolean;
  /** True when the last session ended on its own (expired), so the sign-in page can say so. */
  sessionExpired: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [token, setTok] = useState<string | null>(getToken);
  const [sessionExpired, setSessionExpired] = useState(false);
  const me = useQuery({
    queryKey: ['me', token],
    queryFn: () => apiGet<User>('/me'),
    enabled: !!token,
    retry: false,
    staleTime: Infinity
  });

  const clear = useCallback(() => {
    setToken(null);
    qc.clear();
    setTok(null);
  }, [qc]);

  useEffect(() => {
    const onUnauthorized = () => {
      setSessionExpired(true);
      clear();
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [clear]);

  const signIn = async (email: string, password: string) => {
    const body: LoginRequest = { email, password };
    const res = await apiSend<LoginResponse>('POST', '/auth/login', body);
    setToken(res.token);
    qc.clear();
    qc.setQueryData(['me', res.token], res.user);
    setSessionExpired(false);
    setTok(res.token);
  };

  const value: AuthValue = {
    user: token ? me.data ?? null : null,
    loading: !!token && me.isLoading,
    sessionExpired,
    signIn,
    signOut: () => {
      setSessionExpired(false);
      clear();
    }
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
