import api from '@/lib/axios';

export const bankAccountService = {
  add: (data) => api.post('/customer-bank-accounts', data),
  list: (customerId) => api.get(`/customer-bank-accounts/${customerId}`),
  update: (id, data) => api.put(`/customer-bank-accounts/${id}/update`, data),
  delete: (id) => api.delete(`/customer-bank-accounts/${id}`),
};
