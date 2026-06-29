import api from '@/lib/axios';

export const employeeService = {
  create: (data) => api.post('/employees', data),
  list: () => api.get('/employees'),
  get: (id) => api.get(`/employees/${id}`),
  update: (id, data) => api.put(`/employees/${id}`, data),
  block: (id) => api.patch(`/employees/${id}/block`),
  unblock: (id) => api.patch(`/employees/${id}/unblock`),
  delete: (id) => api.delete(`/employees/${id}`),
};
