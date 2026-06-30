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
  refreshToken: string | null;
  user: AuthUser | null;
  companySlug: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (args: {
    accessToken: string;
    refreshToken?: string | null;
    user: AuthUser;
    companySlug: string;
  }) => void;
  setAccessToken: (token: string) => void;
  setRefreshToken: (token: string | null) => void;
  setUser: (user: AuthUser) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  setCompanySlug: (slug: string) => void;
}

const SESSION_KEY = 'insurecrm_desktop_auth';

export const isDesktopCrm = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === '127.0.0.1' || host === 'localhost';
};

const loadDesktopSession = (): Partial<AuthState> => {
  if (!isDesktopCrm()) return {};
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as {
      accessToken?: string;
      refreshToken?: string;
      user?: AuthUser;
      companySlug?: string;
    };
    if (parsed.accessToken && parsed.user && parsed.companySlug) {
      return {
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken ?? null,
        user: parsed.user,
        companySlug: parsed.companySlug,
        isAuthenticated: true,
        isLoading: false,
      };
    }
  } catch {
    // ignore corrupt session
  }
  return {};
};

const persistDesktopSession = (state: AuthState): void => {
  if (!isDesktopCrm()) return;
  if (!state.accessToken || !state.user || !state.companySlug) {
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      accessToken: state.accessToken,
      refreshToken: state.refreshToken,
      user: state.user,
      companySlug: state.companySlug,
    })
  );
};

const desktopBootstrap = loadDesktopSession();

/**
 * Access token is kept in memory (cloud) or sessionStorage (desktop Electron).
 * Refresh token uses httpOnly cookie + sessionStorage fallback on desktop.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: desktopBootstrap.accessToken ?? null,
  refreshToken: desktopBootstrap.refreshToken ?? null,
  user: desktopBootstrap.user ?? null,
  companySlug: desktopBootstrap.companySlug ?? null,
  isAuthenticated: desktopBootstrap.isAuthenticated ?? false,
  isLoading: desktopBootstrap.isLoading ?? true,

  setAuth: ({ accessToken, refreshToken, user, companySlug }) => {
    const next = {
      accessToken,
      refreshToken: refreshToken ?? get().refreshToken,
      user,
      companySlug,
      isAuthenticated: true,
      isLoading: false,
    };
    set(next);
    persistDesktopSession({ ...get(), ...next });
  },

  setAccessToken: (accessToken) => {
    set({ accessToken });
    persistDesktopSession(get());
  },

  setRefreshToken: (refreshToken) => {
    set({ refreshToken });
    persistDesktopSession(get());
  },

  setUser: (user) => {
    set({ user });
    persistDesktopSession(get());
  },

  setLoading: (isLoading) => set({ isLoading }),

  logout: () => {
    sessionStorage.removeItem(SESSION_KEY);
    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },

  setCompanySlug: (companySlug) => set({ companySlug }),
}));
