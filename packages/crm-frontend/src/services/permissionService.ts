import api from '@/lib/axios';

export const permissionService = {
  getMyPermissions: () => api.get('/permissions/me'),
  getPermissions: (executiveId) => api.get(`/permissions/${executiveId}`),
  updatePermissions: (executiveId, data) => api.put(`/permissions/${executiveId}`, data),
};
