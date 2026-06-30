import api from '@/lib/axios';
import { useAuthStore } from '@/store/authStore';

export const authService = {
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  refresh: () => {
    const refreshToken = useAuthStore.getState().refreshToken;
    return api.post(
      '/auth/refresh',
      refreshToken ? { refresh_token: refreshToken } : {}
    );
  },
  getMe: () => api.get('/auth/me'),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPassword: (data) => api.post('/auth/reset-password', data),
  changeFirstPassword: (data) => api.post('/auth/change-first-password', data),
};
