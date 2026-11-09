import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, UNAUTHORIZED_EVENT } from './api';
import type { Me } from './types';

type AuthState = {
  user: Me | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<Me>;
  signOut: () => Promise<void>;
  refresh: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.get<{ user: Me }>('/auth/me')).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Any 401 from the API (expired or revoked session) signs the UI out.
  useEffect(() => {
    const handle = () => {
      queryClient.setQueryData(['me'], null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handle);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handle);
  }, [queryClient]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { user } = await api.post<{ user: Me }>('/auth/login', { email, password });
      queryClient.clear();
      queryClient.setQueryData(['me'], user);
      return user;
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      queryClient.clear();
      queryClient.setQueryData(['me'], null);
    }
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({
      user: me.data ?? null,
      loading: me.isPending,
      signIn,
      signOut,
      refresh: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
    }),
    [me.data, me.isPending, signIn, signOut, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** For pages that are only rendered behind a role guard. */
export function useUser(): Me {
  const { user } = useAuth();
  if (!user) throw new Error('useUser called without a signed-in user');
  return user;
}
