import api from '@/lib/axios';

export interface HealthPlan {
  id: string;
  name: string;
  insurance_company_id?: string | null;
  insurance_company?: { id: string; name: string } | null;
  is_active: boolean;
}

export const healthPlanService = {
  list: (params?: { search?: string; is_active?: boolean; insurance_company_id?: string }) =>
    api.get('/policies/health-plans', { params }),
  listMaster: (params?: { search?: string; is_active?: boolean }) =>
    api.get('/master/health-plans', { params }),
  create: (data: { name: string; insurance_company_id?: string; is_active?: boolean }) =>
    api.post('/master/health-plans', data),
  update: (id: string, data: Partial<{ name: string; insurance_company_id?: string; is_active: boolean }>) =>
    api.put(`/master/health-plans/${id}`, data),
  delete: (id: string) => api.delete(`/master/health-plans/${id}`),
  getGst: (params: { lob_id?: string; product_id?: string }) =>
    api.get('/policies/health-gst', { params }),
};

export default healthPlanService;
