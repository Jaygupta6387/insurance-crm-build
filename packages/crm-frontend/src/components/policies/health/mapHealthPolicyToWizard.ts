import type { HealthWizardData, CommissionRow, HealthMemberRow } from './types';

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
  const premium = items.find((i) => i.component_type === 'PREMIUM');
  return {
    commission_premium: rowFromItem(premium),
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
    items.some((i) => Number(i.commission_amount) > 0)
    || Number(share.total_commission_amount) > 0;
  if (!hasShare) return { share_with_sub_broker: false as const };
  const premium = items.find((i) => i.component_type === 'PREMIUM');
  const brokerId = share.sub_broker_id || share.sub_broker?.id;
  return {
    share_with_sub_broker: true,
    share_basis: (share.commission_basis === 'PREMIUM_PERCENTAGE'
      ? 'PREMIUM'
      : 'COMMISSION_AMOUNT') as HealthWizardData['share_basis'],
    share_premium: rowFromItem(premium),
    ...(brokerId
      ? {
          referred_by_sub_broker_id: str(brokerId),
          referred_sub_broker_name: str(share.sub_broker?.full_name),
          referred_by_type: 'SUB_BROKER' as const,
        }
      : {}),
  };
};

const mapMember = (m: Record<string, unknown>): HealthMemberRow => ({
  customer_id: str(m.customer_id),
  relation: str(m.relation),
  member_name: str(m.member_name),
  member_phone: str(m.member_phone),
  member_email: str(m.member_email),
  member_age: m.member_age != null ? String(m.member_age) : '',
  is_covered: m.is_covered !== false,
});

/** Maps GET /policies/:id response into wizard state for edit mode. */
export function mapHealthPolicyToWizard(policy: Record<string, unknown>): Partial<HealthWizardData> {
  const h = (policy.health_detail || {}) as Record<string, unknown>;
  const customer = policy.customer as Record<string, unknown> | undefined;
  const prev = policy.previous_policy as Record<string, unknown> | undefined;
  const docs = (policy.documents as Array<Record<string, unknown>>) || [];
  const members = (policy.health_members as Array<Record<string, unknown>>) || [];
  const referredBroker = policy.referred_broker as { full_name?: string } | undefined;
  const referredCustomer = policy.referred_customer as { customer_name?: string } | undefined;
  const healthPlan = h.health_plan as { id?: string } | undefined;

  return {
    customer: customer
      ? {
          id: String(customer.id),
          customer_name: String(customer.customer_name),
          customer_phone: String(customer.customer_phone || ''),
          customer_email: (customer.customer_email as string) || null,
          family_code: (customer.family_code as string) || null,
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
    referred_by_type: (policy.referred_by_type as HealthWizardData['referred_by_type'])
      || ((policy.commissions as unknown[])?.length ? 'SUB_BROKER' : 'SELF'),
    referred_by_sub_broker_id: str(policy.referred_by_sub_broker_id),
    referred_sub_broker_name: str(referredBroker?.full_name),
    referred_by_customer_id: str(policy.referred_by_customer_id),
    referred_customer_name: str(referredCustomer?.customer_name),
    insurance_company_id: str(policy.insurance_company_id),
    health_plan_id: str(h.health_plan_id || healthPlan?.id),
    deductible: str(h.deductible),
    sum_insured: str(h.sum_insured),
    cumulative_bonus: str(h.cumulative_bonus),
    family_members: members.map(mapMember),
    members_loaded: members.length > 0,
    base_premium: str(h.base_premium),
    gst_percent: h.gst_percent != null ? Number(h.gst_percent) : 0,
    gst_amount: str(h.gst_amount),
    net_premium: str(h.net_premium),
    total_premium: str(h.total_premium),
    payment_mode: str(h.payment_mode),
    payment_reference: str(h.payment_reference),
    is_full_payment: h.is_full_payment !== false,
    amount_received: str(h.amount_received),
    previous_policy_number: str(prev?.previous_policy_number),
    previous_insurance_company_id: str(prev?.previous_insurance_company_id),
    prev_policy_documents: docs
      .filter((d) => d.category === 'OTHER')
      .map((d) => ({
        id: d.id as string,
        file_name: String(d.file_name),
        file_url: String(d.file_url),
        category: 'OTHER',
      })),
    notes: str(policy.notes),
    ...mapOurCommission(policy.our_commissions as Array<{ items?: CommItem[]; notes?: string | null }>),
    ...mapSubBrokerShare(
      policy.commissions as Array<{ items?: CommItem[]; commission_basis?: string | null }>,
    ),
  };
}
