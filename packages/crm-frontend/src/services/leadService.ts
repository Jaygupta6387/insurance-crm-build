import api from '@/lib/axios';

export interface Lead {
  id: string;
  lead_code: string;
  lead_name: string;
  phone_number: string;
  email?: string | null;
  expected_premium?: number | null;
  referred_by_type: 'SUB_BROKER' | 'CUSTOMER' | 'SELF';
  referred_by_sub_broker_id?: string | null;
  referred_by_customer_id?: string | null;
  lob_id?: string | null;
  product_id?: string | null;
  sub_product_id?: string | null;
  assigned_to?: string | null;
  status: 'NEW' | 'HOT' | 'WARM' | 'COLD' | 'CONVERTED' | 'LOST';
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  lob?: { id: string; name: string } | null;
  product?: { id: string; name: string } | null;
  sub_product?: { id: string; name: string } | null;
  assignee?: { id: string; full_name: string } | null;
  follow_ups: LeadFollowUp[];
  documents: LeadDocument[];
}

export interface LeadFollowUp {
  id?: string;
  lead_id?: string;
  notes?: string;
  follow_up_date?: string;
  is_done: boolean;
}

export interface LeadDocument {
  id?: string;
  lead_id?: string;
  document_type: string;
  file_name: string;
  file_url: string;
}

export const leadService = {
  create:  (data: Record<string, unknown>) => api.post('/leads', data),
  list:    (params?: Record<string, unknown>) => api.get('/leads', { params }),
  get:     (id?: string) => api.get(`/leads/${id}`),
  update:  (id: string | undefined, data: Record<string, unknown>) => api.put(`/leads/${id}`, data),
  delete:  (id: string) => api.delete(`/leads/${id}`),
  convert: (id: string) => api.patch(`/leads/${id}/convert`),
};
