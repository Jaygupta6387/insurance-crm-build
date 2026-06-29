import api from '@/lib/axios';

export interface PendingBalance {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  pending_amount: string | number;
  last_transaction?: { created_at: string; policy_number?: string | null; product_name?: string | null } | null;
}

export interface CustomerWalletTransaction {
  id: string;
  customer_id: string;
  type: 'CREDIT' | 'DEBIT';
  amount: string | number;
  balance_after: string | number;
  reason?: string | null;
  policy_id?: string | null;
  policy_number?: string | null;
  product_name?: string | null;
  note?: string | null;
  created_at: string;
}

export const customerWalletService = {
  getPending: (params?: { search?: string; page?: number; limit?: number }) =>
    api.get('/customer-wallet/pending', { params }),
  getLedger: (customerId: string) => api.get(`/customer-wallet/${customerId}`),
  recordPayment: (customerId: string, data: { amount: number; policy_number?: string; note?: string }) =>
    api.post(`/customer-wallet/${customerId}/payment`, data),
  adjustWallet: (
    customerId: string,
    data: {
      type: 'CREDIT' | 'DEBIT';
      amount: number;
      reason?: 'PAYMENT_RECEIVED' | 'MANUAL_ADD' | 'MANUAL_SETTLE' | 'ADJUSTMENT';
      note?: string;
      policy_number?: string;
    },
  ) => api.post(`/customer-wallet/${customerId}/adjust`, data),
};

export default customerWalletService;
