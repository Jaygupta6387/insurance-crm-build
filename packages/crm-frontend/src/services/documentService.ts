import api from '@/lib/axios';

export const documentService = {
  add: (data) => api.post('/customer-documents', data),
  list: (customerId) => api.get(`/customer-documents/${customerId}`),
  delete: (id) => api.delete(`/customer-documents/${id}`),
};
