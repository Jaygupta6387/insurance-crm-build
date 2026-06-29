import api from '@/lib/axios';

export const customerService = {
  // CRUD
  create: (data) => api.post('/customers', data),
  list: (params) => api.get('/customers', { params }),
  get: (id) => api.get(`/customers/${id}`),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),

  // Utility
  generateFamilyCode: (name, phone) =>
    api.get('/customers/generate-family-code', { params: { name, phone } }),
  lookupFamilyCode: (code: string) =>
    api.get('/customers/lookup-family-code', { params: { code } }),
  searchFamilyCodes: (q: string, limit = 10) =>
    api.get('/customers/search-family-codes', { params: { q, limit } }),
};
