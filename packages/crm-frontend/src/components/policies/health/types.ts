import type { DropdownOption } from '../shared';

export interface WizardMasters {
  products: DropdownOption[];
  subProducts: DropdownOption[];
  insurers: DropdownOption[];
  policyTypes: { id: string; name: string }[];
  subBrokers: DropdownOption[];
  healthPlans: DropdownOption[];
  loadingProducts: boolean;
  loadingSubProducts: boolean;
  loadingInsurers: boolean;
  loadingPolicyTypes: boolean;
  loadingSubBrokers: boolean;
  loadingHealthPlans: boolean;
}

export interface StepProps {
  data: HealthWizardData;
  update: (patch: Partial<HealthWizardData>) => void;
  errors: Record<string, string>;
  masters: WizardMasters;
  excludePolicyId?: string;
  policyId?: string | null;
  isEditMode?: boolean;
  onEnsureDraft?: () => Promise<string | null>;
}

export interface SelectedCustomer {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  city?: string | null;
  family_code?: string | null;
}

export interface WizardDocument {
  id?: string;
  file_name: string;
  file_url: string;
  category?: string;
  mime_type?: string;
}

export interface CommissionRow {
  percentage: string;
  amount: string;
}

export interface HealthMemberRow {
  customer_id: string;
  relation: string;
  member_name: string;
  member_phone: string;
  member_email: string;
  member_age: string;
  is_covered: boolean;
}

export interface HealthWizardData {
  // Step 1 — policy basics
  customer: SelectedCustomer | null;
  policy_documents: WizardDocument[];
  lob_id: string;
  product_id: string;
  sub_product_id: string;
  policy_number: string;
  policy_number_status: 'idle' | 'checking' | 'available' | 'taken';
  policy_type_id: string;
  policy_type_name: string;
  start_date: string;
  end_date: string;
  issue_date: string;
  referred_by_type: 'SELF' | 'SUB_BROKER' | 'CUSTOMER';
  referred_by_sub_broker_id: string;
  referred_sub_broker_name: string;
  referred_by_customer_id: string;
  referred_customer_name: string;

  // Step 2 — cover & members
  insurance_company_id: string;
  health_plan_id: string;
  deductible: string;
  sum_insured: string;
  cumulative_bonus: string;
  family_members: HealthMemberRow[];
  members_loaded: boolean;

  // Step 3 — premium & payment
  base_premium: string;
  gst_percent: number;
  gst_amount: string;
  net_premium: string;
  total_premium: string;
  payment_mode: string;
  payment_reference: string;
  is_full_payment: boolean;
  amount_received: string;
  previous_policy_number: string;
  previous_insurance_company_id: string;
  prev_policy_documents: WizardDocument[];

  // Step 4 — commission
  commission_premium: CommissionRow;
  commission_notes: string;
  share_with_sub_broker: boolean;
  share_basis: 'COMMISSION_AMOUNT' | 'PREMIUM';
  share_premium: CommissionRow;

  notes: string;
}

export const createInitialWizardData = (): HealthWizardData => ({
  customer: null,
  policy_documents: [],
  lob_id: '',
  product_id: '',
  sub_product_id: '',
  policy_number: '',
  policy_number_status: 'idle',
  policy_type_id: '',
  policy_type_name: '',
  start_date: '',
  end_date: '',
  issue_date: '',
  referred_by_type: 'SELF',
  referred_by_sub_broker_id: '',
  referred_sub_broker_name: '',
  referred_by_customer_id: '',
  referred_customer_name: '',

  insurance_company_id: '',
  health_plan_id: '',
  deductible: '',
  sum_insured: '',
  cumulative_bonus: '',
  family_members: [],
  members_loaded: false,

  base_premium: '',
  gst_percent: 0,
  gst_amount: '',
  net_premium: '',
  total_premium: '',
  payment_mode: '',
  payment_reference: '',
  is_full_payment: true,
  amount_received: '',
  previous_policy_number: '',
  previous_insurance_company_id: '',
  prev_policy_documents: [],

  commission_premium: { percentage: '', amount: '' },
  commission_notes: '',
  share_with_sub_broker: false,
  share_basis: 'COMMISSION_AMOUNT',
  share_premium: { percentage: '', amount: '' },

  notes: '',
});
