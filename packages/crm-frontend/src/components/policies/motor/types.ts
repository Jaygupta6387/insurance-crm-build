import type { Vehicle } from '@/services/vehicleService';
import type { DropdownOption } from './shared';

export interface WizardMasters {
  products: DropdownOption[];
  subProducts: DropdownOption[];
  insurers: DropdownOption[];
  policyTypes: { id: string; name: string }[];
  subBrokers: DropdownOption[];
  addOnCoverages: { id: string; add_on_name: string }[];
  loadingProducts: boolean;
  loadingSubProducts: boolean;
  loadingInsurers: boolean;
  loadingPolicyTypes: boolean;
  loadingSubBrokers: boolean;
  loadingAddOns: boolean;
}

export interface StepProps {
  data: MotorWizardData;
  update: (patch: Partial<MotorWizardData>) => void;
  errors: Record<string, string>;
  masters: WizardMasters;
  excludePolicyId?: string;
}

export interface SelectedCustomer {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  city?: string | null;
}

export interface WizardDocument {
  id?: string;
  file_name: string;
  file_url: string;
  category?: string;
  mime_type?: string;
}

export interface AddOnSelection {
  add_on_coverage_id: string;
  add_on_name: string;
  checked: boolean;
  amount: string;
}

export interface CommissionRow {
  percentage: string;
  amount: string;
}

/**
 * Single accumulator for the whole wizard ("paper state"). Inputs are kept as
 * strings for controlled fields; conversion to the API payload happens on save.
 */
export interface MotorWizardData {
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

  // Step 2 — vehicle & coverage
  vehicle_id: string;
  vehicle: Vehicle | null;
  insurance_company_id: string;
  package_type: string;
  od_start_date: string;
  od_end_date: string;
  tp_start_date: string;
  tp_end_date: string;
  idv: string;
  electric_accessory_idv: string;
  non_electric_accessory_idv: string;
  add_ons: AddOnSelection[];
  pa_owner: boolean;
  pa_passenger_1l: boolean;
  pa_passenger_2l: boolean;
  paid_driver: boolean;

  // Step 3 — premium & payment
  rate_source: 'DB' | 'MANUAL';
  fixed_basic_premium: number | null;
  fixed_tp_premium: number | null;
  basic_premium: string;
  discount_percent: string;
  basic_after_discount: string;
  ncb_percent: string;
  od_premium: string;
  tp_premium: string;
  addon_premium: string;
  addon_premium_expr: string;
  total_od_premium: string;
  net_premium: string;
  gst_on_od_percent: number;
  gst_on_tp_percent: number;
  gst_on_od: string;
  gst_on_tp: string;
  total_gst: string;
  total_premium: string;
  payment_mode: string;
  payment_reference: string;
  is_full_payment: boolean;
  amount_received: string;

  // Step 4 — claims / previous policy (optional)
  previous_policy_number: string;
  previous_insurance_company_id: string;
  claim_status: string;
  claim_amount: string;
  claim_description: string;
  claim_documents: WizardDocument[];

  // Step 5 — commission
  commission_od: CommissionRow;
  commission_tp: CommissionRow;
  commission_addon: CommissionRow;
  commission_notes: string;

  // Sub-broker commission share (popup)
  share_with_sub_broker: boolean;
  share_basis: 'COMMISSION_AMOUNT' | 'PREMIUM';
  share_od: CommissionRow;
  share_tp: CommissionRow;
  share_addon: CommissionRow;

  notes: string;
}

export const createInitialWizardData = (): MotorWizardData => ({
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

  vehicle_id: '',
  vehicle: null,
  insurance_company_id: '',
  package_type: '',
  od_start_date: '',
  od_end_date: '',
  tp_start_date: '',
  tp_end_date: '',
  idv: '',
  electric_accessory_idv: '',
  non_electric_accessory_idv: '',
  add_ons: [],
  pa_owner: false,
  pa_passenger_1l: false,
  pa_passenger_2l: false,
  paid_driver: false,

  rate_source: 'MANUAL',
  fixed_basic_premium: null,
  fixed_tp_premium: null,
  basic_premium: '',
  discount_percent: '',
  basic_after_discount: '',
  ncb_percent: '',
  od_premium: '',
  tp_premium: '',
  addon_premium: '',
  addon_premium_expr: '',
  total_od_premium: '',
  net_premium: '',
  gst_on_od_percent: 0,
  gst_on_tp_percent: 0,
  gst_on_od: '',
  gst_on_tp: '',
  total_gst: '',
  total_premium: '',
  payment_mode: '',
  payment_reference: '',
  is_full_payment: true,
  amount_received: '',

  previous_policy_number: '',
  previous_insurance_company_id: '',
  claim_status: '',
  claim_amount: '',
  claim_description: '',
  claim_documents: [],

  commission_od: { percentage: '', amount: '' },
  commission_tp: { percentage: '', amount: '' },
  commission_addon: { percentage: '', amount: '' },
  commission_notes: '',
  share_with_sub_broker: false,
  share_basis: 'COMMISSION_AMOUNT',
  share_od: { percentage: '', amount: '' },
  share_tp: { percentage: '', amount: '' },
  share_addon: { percentage: '', amount: '' },

  notes: '',
});
