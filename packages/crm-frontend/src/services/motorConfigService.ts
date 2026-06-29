import api from '@/lib/axios';

export interface MotorPremiumRate {
  id: string;
  product_id?: string | null;
  sub_product_id?: string | null;
  product?: { id: string; name: string } | null;
  sub_product?: { id: string; name: string } | null;
  zone: 'A' | 'B';
  cc_bracket: string;
  age_bracket: string;
  od_rate_percent: string | number;
  tp_premium: string | number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface GstRate {
  id: string;
  lob_id?: string | null;
  product_id?: string | null;
  lob?: { id: string; name: string } | null;
  product?: { id: string; name: string } | null;
  gst_on_od_percent?: string | number | null;
  gst_on_tp_percent?: string | number | null;
  gst_percent?: string | number | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PremiumRatePayload {
  product_id: string;
  sub_product_id: string;
  zone: 'A' | 'B';
  cc_bracket: string;
  age_bracket: string;
  od_rate_percent: number;
  tp_premium: number;
  is_active?: boolean;
}

export interface GstRatePayload {
  lob_id?: string | null;
  product_id?: string | null;
  gst_on_od_percent?: number | null;
  gst_on_tp_percent?: number | null;
  gst_percent?: number | null;
  apply_to_all_products?: boolean;
  is_active?: boolean;
}

/** Admin master-data for motor premium rates, GST and policy types. */
export const premiumRateService = {
  list: (params?: { product_id?: string; sub_product_id?: string; zone?: string; is_active?: boolean }) =>
    api.get('/master/motor-premium-rates', { params }),
  create: (data: PremiumRatePayload) => api.post('/master/motor-premium-rates', data),
  update: (id: string, data: Partial<PremiumRatePayload>) => api.put(`/master/motor-premium-rates/${id}`, data),
  delete: (id: string) => api.delete(`/master/motor-premium-rates/${id}`),
};

export const motorGstService = {
  list: (params?: { lob_id?: string; product_id?: string; is_active?: boolean }) =>
    api.get('/master/gst-rates', { params }),
  create: (data: GstRatePayload) => api.post('/master/gst-rates', data),
  update: (id: string, data: Partial<GstRatePayload>) => api.put(`/master/gst-rates/${id}`, data),
  delete: (id: string) => api.delete(`/master/gst-rates/${id}`),
};

export const policyTypeService = {
  list: (params?: { is_active?: boolean }) => api.get('/master/policy-types', { params }),
  create: (data: { name: string }) => api.post('/master/policy-types', data),
  update: (id: string, data: { name?: string; is_active?: boolean }) =>
    api.put(`/master/policy-types/${id}`, data),
};
