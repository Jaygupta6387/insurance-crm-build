import { create } from 'zustand';

export interface AuthUser {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: 'ADMIN' | 'EXECUTIVE';
  is_active: boolean;
  is_blocked: boolean;
  must_change_password: boolean;
  permissions: Record<string, boolean> | null;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  companySlug: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (args: { accessToken: string; user: AuthUser; companySlug: string }) => void;
  setAccessToken: (token: string) => void;
  setUser: (user: AuthUser) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  setCompanySlug: (slug: string) => void;
}

/**
 * Auth store — access token is kept in memory only (not localStorage) for XSS protection.
 * Refresh token lives in an httpOnly cookie managed by the browser.
 */
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  companySlug: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: ({ accessToken, user, companySlug }) =>
    set({ accessToken, user, companySlug, isAuthenticated: true, isLoading: false }),

  setAccessToken: (accessToken) => set({ accessToken }),

  setUser: (user) => set({ user }),

  setLoading: (isLoading) => set({ isLoading }),

  logout: () =>
    set({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
    }),

  setCompanySlug: (companySlug) => set({ companySlug }),
}));
