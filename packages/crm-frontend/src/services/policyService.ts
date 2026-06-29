import api from '@/lib/axios';

export interface PolicyType {
  id: string;
  name: string;
  is_active: boolean;
}

export interface PremiumBreakdown {
  rate_source: 'DB' | 'MANUAL';
  zone: 'A' | 'B';
  cc_bracket: string;
  age_bracket: string;
  od_rate_percent: number;
  fixed_basic_premium: number | null;
  fixed_tp_premium: number | null;
  basic_premium: number;
  discount_percent: number;
  basic_after_discount: number;
  ncb_percent: number;
  od_premium: number;
  addon_premium: number;
  tp_premium: number;
  total_od_premium: number;
  net_premium: number;
  gst_on_od_percent: number;
  gst_on_tp_percent: number;
  gst_on_od: number;
  gst_on_tp: number;
  total_gst: number;
  total_premium: number;
}

export interface PremiumCalcInput {
  product_id?: string;
  sub_product_id?: string;
  rto_city?: string;
  zone?: 'A' | 'B';
  cubic_capacity?: number;
  manufacture_year?: number;
  idv?: number;
  discount_percent?: number;
  ncb_percent?: number;
  addon_premium?: number;
  basic_premium?: number;
  tp_premium?: number;
}

export interface PolicyAddOnPayload {
  add_on_coverage_id?: string;
  add_on_name: string;
  amount?: number;
}

export interface PolicyDocumentPayload {
  id?: string;
  category?: string;
  file_name: string;
  file_url: string;
  mime_type?: string;
}

export interface MotorDetailPayload {
  package_type?: string;
  idv?: number;
  electric_accessory_idv?: number;
  non_electric_accessory_idv?: number;
  od_start_date?: string;
  od_end_date?: string;
  tp_start_date?: string;
  tp_end_date?: string;
  rate_source?: 'DB' | 'MANUAL';
  basic_premium?: number;
  discount_percent?: number;
  basic_after_discount?: number;
  ncb_percent?: number;
  od_premium?: number;
  tp_premium?: number;
  addon_premium?: number;
  total_od_premium?: number;
  net_premium?: number;
  gst_on_od?: number;
  gst_on_tp?: number;
  total_gst?: number;
  total_premium?: number;
  pa_owner?: boolean;
  pa_owner_amount?: number;
  pa_passenger_1l?: boolean;
  pa_passenger_2l?: boolean;
  pa_passenger_amount?: number;
  paid_driver?: boolean;
  paid_driver_amount?: number;
  payment_mode?: string;
  payment_reference?: string;
  is_full_payment?: boolean;
  amount_received?: number;
}

export interface PreviousPolicyPayload {
  previous_policy_number?: string;
  previous_insurance_company_id?: string;
  claim_status?: string;
  claim_amount?: number;
  claim_description?: string;
}

export interface HealthDetailPayload {
  health_plan_id?: string;
  deductible?: number;
  sum_insured?: number;
  cumulative_bonus?: number;
  base_premium?: number;
  gst_percent?: number;
  gst_amount?: number;
  net_premium?: number;
  total_premium?: number;
  payment_mode?: string;
  payment_reference?: string;
  is_full_payment?: boolean;
  amount_received?: number;
}

export interface HealthMemberPayload {
  customer_id?: string;
  relation?: string;
  member_name: string;
  member_phone?: string;
  member_email?: string;
  member_age?: number;
  is_covered?: boolean;
}

export interface PolicyPayload {
  customer_id: string;
  policy_number: string;
  lob_id?: string;
  product_id?: string;
  sub_product_id?: string;
  insurance_company_id?: string;
  policy_type_id?: string;
  vehicle_id?: string;
  referred_by_type?: 'SUB_BROKER' | 'CUSTOMER' | 'SELF';
  referred_by_sub_broker_id?: string;
  referred_by_customer_id?: string;
  start_date?: string;
  end_date?: string;
  issue_date?: string;
  notes?: string;
  motor_detail?: MotorDetailPayload;
  health_detail?: HealthDetailPayload;
  health_members?: HealthMemberPayload[];
  add_ons?: PolicyAddOnPayload[];
  documents?: PolicyDocumentPayload[];
  previous_policy?: PreviousPolicyPayload;
}

export interface CommissionItemPayload {
  component_type: 'OD' | 'TP' | 'ADDON' | 'PREMIUM';
  base_amount?: number;
  percentage?: number;
  commission_amount: number;
}

export interface CommissionPayload {
  our_commission?: {
    items?: CommissionItemPayload[];
    total_commission_amount?: number;
    notes?: string;
  };
  sub_broker_share?: {
    enabled?: boolean;
    sub_broker_id?: string;
    commission_basis?: 'PREMIUM_PERCENTAGE' | 'COMMISSION_PERCENTAGE' | 'FIXED_AMOUNT';
    items?: CommissionItemPayload[];
    total_commission_amount?: number;
  };
}

export interface PolicyListParams {
  search?: string;
  status?: string;
  lob_id?: string;
  customer_id?: string;
  page?: number;
  limit?: number;
}

export const policyService = {
  list: (params?: PolicyListParams) => api.get('/policies', { params }),
  get: (id: string) => api.get(`/policies/${id}`),
  create: (data: PolicyPayload) => api.post('/policies', data),
  update: (id: string, data: Partial<PolicyPayload>) => api.put(`/policies/${id}`, data),
  delete: (id: string) => api.delete(`/policies/${id}`),

  getPolicyTypes: () => api.get('/policies/policy-types'),
  checkNumber: (policy_number: string, exclude_id?: string) =>
    api.get('/policies/check-number', { params: { policy_number, exclude_id } }),
  lookupByNumber: (policy_number: string) =>
    api.get('/policies/lookup', { params: { policy_number } }),
  calculatePremium: (data: PremiumCalcInput) => api.post('/policies/calculate-premium', data),

  getCommission: (id: string) => api.get(`/policies/${id}/commission`),
  finalizeCommission: (id: string, data: CommissionPayload) => api.post(`/policies/${id}/commission`, data),

  listChangeRequests: (status = 'PENDING') =>
    api.get('/policies/change-requests', { params: { status } }),
  createChangeRequest: (
    policyId: string,
    data: { request_type: 'EDIT' | 'DELETE'; payload?: Partial<PolicyPayload>; reason?: string },
  ) => api.post(`/policies/${policyId}/change-requests`, data),
  reviewChangeRequest: (requestId: string, data: { action: 'APPROVE' | 'REJECT'; review_note?: string }) =>
    api.post(`/policies/change-requests/${requestId}/review`, data),
};

export default policyService;
