import type { MotorWizardData, CommissionRow } from './types';

const str = (v: unknown) => (v == null || v === '' ? '' : String(v));

type CommItem = { component_type: string; percentage?: unknown; commission_amount?: unknown };

const rowFromItem = (item?: CommItem): CommissionRow => ({
  percentage: item?.percentage != null ? String(item.percentage) : '',
  amount: item?.commission_amount != null ? String(item.commission_amount) : '',
});

const mapOurCommission = (ourCommissions?: Array<{ items?: CommItem[]; notes?: string | null }>) => {
  const comm = ourCommissions?.[0];
  if (!comm) return {};
  const items = comm.items || [];
  const byType = (t: string) => items.find((i) => i.component_type === t);
  return {
    commission_od: rowFromItem(byType('OD')),
    commission_tp: rowFromItem(byType('TP')),
    commission_addon: rowFromItem(byType('ADDON')),
    commission_notes: comm.notes || '',
  };
};

const mapSubBrokerShare = (
  commissions?: Array<{
    items?: CommItem[];
    commission_basis?: string | null;
    total_commission_amount?: unknown;
    sub_broker_id?: string;
    sub_broker?: { id?: string; full_name?: string };
  }>,
) => {
  const share = commissions?.[0];
  if (!share) return { share_with_sub_broker: false as const };
  const items = share.items || [];
  const hasShare =
    (share.items || []).some((i) => Number(i.commission_amount) > 0)
    || Number(share.total_commission_amount) > 0;
  if (!hasShare) return { share_with_sub_broker: false as const };
  const byType = (t: string) => items.find((i) => i.component_type === t);
  const brokerId = share.sub_broker_id || share.sub_broker?.id;
  return {
    share_with_sub_broker: true,
    share_basis: (share.commission_basis === 'PREMIUM_PERCENTAGE'
      ? 'PREMIUM'
      : 'COMMISSION_AMOUNT') as MotorWizardData['share_basis'],
    share_od: rowFromItem(byType('OD')),
    share_tp: rowFromItem(byType('TP')),
    share_addon: rowFromItem(byType('ADDON')),
    ...(brokerId
      ? {
          referred_by_sub_broker_id: str(brokerId),
          referred_sub_broker_name: str(share.sub_broker?.full_name),
          referred_by_type: 'SUB_BROKER' as const,
        }
      : {}),
  };
};

/** Maps GET /policies/:id response into wizard state for edit mode. */
export function mapPolicyToWizardData(policy: Record<string, unknown>): Partial<MotorWizardData> {
  const m = (policy.motor_detail || {}) as Record<string, unknown>;
  const customer = policy.customer as Record<string, unknown> | undefined;
  const prev = policy.previous_policy as Record<string, unknown> | undefined;
  const addOns = (policy.add_ons as Array<Record<string, unknown>>) || [];
  const docs = (policy.documents as Array<Record<string, unknown>>) || [];
  const referredBroker = policy.referred_broker as { full_name?: string } | undefined;
  const referredCustomer = policy.referred_customer as { customer_name?: string } | undefined;

  return {
    customer: customer
      ? {
          id: String(customer.id),
          customer_name: String(customer.customer_name),
          customer_phone: String(customer.customer_phone || ''),
          customer_email: (customer.customer_email as string) || null,
        }
      : null,
    policy_documents: docs
      .filter((d) => d.category === 'POLICY_PDF')
      .map((d) => ({
        id: d.id as string,
        file_name: String(d.file_name),
        file_url: String(d.file_url),
        category: String(d.category),
        mime_type: (d.mime_type as string) || undefined,
      })),
    lob_id: str(policy.lob_id),
    product_id: str(policy.product_id),
    sub_product_id: str(policy.sub_product_id),
    policy_number: str(policy.policy_number),
    policy_number_status: 'available',
    policy_type_id: str(policy.policy_type_id),
    policy_type_name: str((policy.policy_type as { name?: string })?.name),
    start_date: policy.start_date ? String(policy.start_date).slice(0, 10) : '',
    end_date: policy.end_date ? String(policy.end_date).slice(0, 10) : '',
    issue_date: policy.issue_date ? String(policy.issue_date).slice(0, 10) : '',
    referred_by_type: (policy.referred_by_type as MotorWizardData['referred_by_type'])
      || ((policy.commissions as unknown[])?.length ? 'SUB_BROKER' : 'SELF'),
    referred_by_sub_broker_id: str(policy.referred_by_sub_broker_id),
    referred_sub_broker_name: str(referredBroker?.full_name),
    referred_by_customer_id: str(policy.referred_by_customer_id),
    referred_customer_name: str(referredCustomer?.customer_name),
    vehicle_id: str(policy.vehicle_id),
    vehicle: (policy.vehicle as MotorWizardData['vehicle']) || null,
    insurance_company_id: str(policy.insurance_company_id),
    package_type: str(m.package_type),
    od_start_date: m.od_start_date ? String(m.od_start_date).slice(0, 10) : '',
    od_end_date: m.od_end_date ? String(m.od_end_date).slice(0, 10) : '',
    tp_start_date: m.tp_start_date ? String(m.tp_start_date).slice(0, 10) : '',
    tp_end_date: m.tp_end_date ? String(m.tp_end_date).slice(0, 10) : '',
    idv: str(m.idv),
    electric_accessory_idv: str(m.electric_accessory_idv),
    non_electric_accessory_idv: str(m.non_electric_accessory_idv),
    add_ons: addOns.map((a) => ({
      add_on_coverage_id: str(a.add_on_coverage_id),
      add_on_name: String(a.add_on_name),
      checked: true,
      amount: str(a.amount),
    })),
    pa_owner: !!m.pa_owner,
    pa_passenger_1l: !!m.pa_passenger_1l,
    pa_passenger_2l: !!m.pa_passenger_2l,
    paid_driver: !!m.paid_driver,
    rate_source: (m.rate_source as 'DB' | 'MANUAL') || 'MANUAL',
    basic_premium: str(m.basic_premium),
    discount_percent: str(m.discount_percent),
    basic_after_discount: str(m.basic_after_discount),
    ncb_percent: str(m.ncb_percent),
    od_premium: str(m.od_premium),
    tp_premium: str(m.tp_premium),
    addon_premium: str(m.addon_premium),
    addon_premium_expr: str(m.addon_premium),
    total_od_premium: str(m.total_od_premium),
    net_premium: str(m.net_premium),
    gst_on_od: str(m.gst_on_od),
    gst_on_tp: str(m.gst_on_tp),
    total_gst: str(m.total_gst),
    total_premium: str(m.total_premium),
    payment_mode: str(m.payment_mode),
    payment_reference: str(m.payment_reference),
    is_full_payment: m.is_full_payment !== false,
    amount_received: str(m.amount_received),
    previous_policy_number: str(prev?.previous_policy_number),
    previous_insurance_company_id: str(prev?.previous_insurance_company_id),
    claim_status: str(prev?.claim_status),
    claim_amount: str(prev?.claim_amount),
    claim_description: str(prev?.claim_description),
    claim_documents: docs
      .filter((d) => d.category === 'CLAIM')
      .map((d) => ({
        id: d.id as string,
        file_name: String(d.file_name),
        file_url: String(d.file_url),
        category: 'CLAIM',
      })),
    notes: str(policy.notes),
    ...mapOurCommission(policy.our_commissions as Array<{ items?: CommItem[]; notes?: string | null }>),
    ...mapSubBrokerShare(
      policy.commissions as Array<{ items?: CommItem[]; commission_basis?: string | null }>,
    ),
  };
}
