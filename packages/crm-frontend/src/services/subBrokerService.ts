import api from '@/lib/axios';

export interface SubBroker {
  id: string;
  broker_code: string;
  full_name: string;
  phone: string;
  email?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  wallet_balance: string | number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  _count?: {
    customers: number;
    commissions: number;
    wallet_transactions: number;
  };
}

export interface WalletTransaction {
  id: string;
  sub_broker_id: string;
  type: 'CREDIT' | 'DEBIT';
  reason: 'COMMISSION_EARNED' | 'MANUAL_CREDIT' | 'MANUAL_DEBIT' | 'PAYOUT' | 'ADJUSTMENT';
  amount: string | number;
  balance_after: string | number;
  note?: string | null;
  reference_id?: string | null;
  performed_by?: string | null;
  // Analytics FK fields
  policy_id?: string | null;
  customer_id?: string | null;
  lob_id?: string | null;
  product_id?: string | null;
  sub_product_id?: string | null;
  insurance_company_id?: string | null;
  // Snapshots
  customer_name_snapshot?: string | null;
  insurance_company_name_snapshot?: string | null;
  product_name_snapshot?: string | null;
  created_at: string;
}

export type CommissionBasis = 'PREMIUM_PERCENTAGE' | 'COMMISSION_PERCENTAGE' | 'FIXED_AMOUNT';
export type CommissionComponentType =
  | 'OD' | 'TP' | 'ADDON' | 'RSA' | 'ZERO_DEP'
  | 'PREMIUM' | 'TOPUP' | 'YEAR_1' | 'RENEWAL' | 'OTHER';

export interface CommissionItem {
  id: string;
  commission_id: string;
  component_type: CommissionComponentType;
  base_amount?: string | number | null;
  percentage?: string | number | null;
  commission_amount: string | number;
  created_at: string;
}

export interface Commission {
  id: string;
  sub_broker_id: string;
  // Core references
  policy_id?: string | null;
  policy_number?: string | null;
  customer_id?: string | null;
  customer?: { id: string; customer_name: string } | null;
  // Insurance hierarchy
  lob_id?: string | null;
  lob?: { id: string; name: string } | null;
  product_id?: string | null;
  product?: { id: string; name: string } | null;
  sub_product_id?: string | null;
  sub_product?: { id: string; name: string } | null;
  insurance_company_id?: string | null;
  insurance_company?: { id: string; name: string } | null;
  // Commission
  commission_basis?: CommissionBasis | null;
  total_commission_amount: string | number;
  // Wallet tracking
  is_wallet_credited: boolean;
  wallet_transaction_id?: string | null;
  // Metadata
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  notes?: string | null;
  created_at: string;
  items?: CommissionItem[];
}

// ─── Master Data Types ────────────────────────────────────────────────────────

export interface Lob {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  lob_id: string;
  lob?: { id: string; name: string } | null;
  name: string;
  is_active: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubProductType {
  id: string;
  product_id: string;
  product?: { id: string; name: string; lob_id: string } | null;
  name: string;
  is_active: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InsuranceCompany {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubBrokerListParams {
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  page?: number;
  limit?: number;
}

export const subBrokerService = {
  // ─── CRUD ─────────────────────────────────────────────────────────────────
  create: (data: Partial<SubBroker>) => api.post('/sub-brokers', data),
  list: (params?: SubBrokerListParams) => api.get('/sub-brokers', { params }),
  get: (id: string) => api.get(`/sub-brokers/${id}`),
  update: (id: string, data: Partial<SubBroker>) => api.put(`/sub-brokers/${id}`, data),
  delete: (id: string) => api.delete(`/sub-brokers/${id}`),

  // ─── Analytics ────────────────────────────────────────────────────────────
  getAnalytics: () => api.get('/sub-brokers/analytics'),

  // ─── Wallet ───────────────────────────────────────────────────────────────
  adjustWallet: (
    id: string,
    data: {
      type: 'CREDIT' | 'DEBIT';
      amount: number;
      reason: 'MANUAL_CREDIT' | 'MANUAL_DEBIT' | 'PAYOUT' | 'ADJUSTMENT';
      note?: string;
    }
  ) => api.post(`/sub-brokers/${id}/wallet/adjust`, data),

  getWalletHistory: (
    id: string,
    params?: { page?: number; limit?: number; type?: string; reason?: string }
  ) => api.get(`/sub-brokers/${id}/wallet/history`, { params }),

  // ─── Commissions ──────────────────────────────────────────────────────────
  createCommission: (
    id: string,
    data: {
      policy_id?: string;
      policy_number?: string;
      customer_id?: string;
      lob_id?: string;
      product_id?: string;
      sub_product_id?: string;
      insurance_company_id?: string;
      commission_basis?: CommissionBasis;
      total_commission_amount: number;
      notes?: string;
      items?: {
        component_type: CommissionComponentType;
        base_amount?: number;
        percentage?: number;
        commission_amount: number;
      }[];
    }
  ) => api.post(`/sub-brokers/${id}/commissions`, data),

  getCommissions: (
    id: string,
    params?: { page?: number; limit?: number; status?: string }
  ) => api.get(`/sub-brokers/${id}/commissions`, { params }),

  updateCommissionStatus: (
    brokerId: string,
    commissionId: string,
    data: { status: 'PENDING' | 'PAID' | 'CANCELLED'; notes?: string }
  ) => api.patch(`/sub-brokers/${brokerId}/commissions/${commissionId}/status`, data),
};

// ─── Master Data Service ──────────────────────────────────────────────────────

export const masterDataService = {
  getLobs:       (params?: { is_active?: boolean })                    => api.get('/master/lobs',                { params }),
  createLob:     (data: { name: string })                              => api.post('/master/lobs',                data),
  updateLob:     (id: string, data: Partial<Lob>)                      => api.put(`/master/lobs/${id}`,          data),

  getProducts:   (params?: { lob_id?: string; is_active?: boolean })   => api.get('/master/products',            { params }),
  createProduct: (data: { lob_id: string; name: string }) =>
                                                                           api.post('/master/products',           data),
  updateProduct: (id: string, data: Partial<Product>)                  => api.put(`/master/products/${id}`,      data),
  deleteProduct: (id: string)                                           => api.delete(`/master/products/${id}`),

  getSubProducts: (params?: { product_id?: string; is_active?: boolean }) => api.get('/master/sub-products',     { params }),
  createSubProduct: (data: { product_id: string; name: string }) =>
                                                                             api.post('/master/sub-products',     data),
  updateSubProduct: (id: string, data: Partial<SubProductType>)        => api.put(`/master/sub-products/${id}`,  data),
  deleteSubProduct: (id: string)                                        => api.delete(`/master/sub-products/${id}`),

  getInsuranceCompanies: (params?: { is_active?: boolean })            => api.get('/master/insurance-companies', { params }),
  createInsuranceCompany: (data: { name: string; description?: string }) =>
                                                                          api.post('/master/insurance-companies', data),
  updateInsuranceCompany: (id: string, data: Partial<InsuranceCompany>) => api.put(`/master/insurance-companies/${id}`, data),
  deleteInsuranceCompany: (id: string)                                  => api.delete(`/master/insurance-companies/${id}`),
};


