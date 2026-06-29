import { useEffect, useRef } from 'react';
import { FileText, Layers, Hash, CalendarDays, UserCheck, ShieldCheck, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { policyService } from '@/services/policyService';
import { customerService } from '@/services/customerService';
import {
  Field, Section, SearchableDropdown, CustomerSearch, SubBrokerSearch, DocumentList, inputCls,
} from '../shared';
import { addYearsMinusOneDay } from '@/constants/health';
import type { StepProps } from './types';

const REFERRAL_TYPES = [
  { value: 'SELF', label: 'Self' },
  { value: 'SUB_BROKER', label: 'Sub Broker' },
  { value: 'CUSTOMER', label: 'Customer' },
] as const;

const str = (v: unknown) => (v == null ? '' : String(v));

export default function Step1Basics({ data, update, errors, masters, excludePolicyId }: StepProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounced unique policy-number check
  useEffect(() => {
    const value = data.policy_number.trim();
    if (!value) {
      update({ policy_number_status: 'idle' });
      return;
    }
    update({ policy_number_status: 'checking' });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await policyService.checkNumber(value, excludePolicyId);
        update({ policy_number_status: res.data.data.available ? 'available' : 'taken' });
      } catch {
        update({ policy_number_status: 'idle' });
      }
    }, 450);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.policy_number, excludePolicyId]);

  const onStartDate = (value: string) => {
    update({ start_date: value, end_date: addYearsMinusOneDay(value, 1) });
  };

  const onSelectCustomer = async (c: { id: string; customer_name: string; customer_phone: string; customer_email?: string | null }) => {
    update({
      customer: { ...c },
      family_members: [],
      members_loaded: false,
    });
    try {
      const res = await customerService.get(c.id);
      const full = res.data.data.customer as Record<string, unknown>;
      const referredBroker = full.referred_broker as { id?: string; full_name?: string } | undefined;
      const referredCustomer = full.referred_customer as { id?: string; customer_name?: string } | undefined;
      update({
        customer: {
          id: c.id,
          customer_name: c.customer_name,
          customer_phone: c.customer_phone,
          customer_email: c.customer_email,
          family_code: (full.family_code as string) || null,
        },
        referred_by_type: (full.referred_by_type as StepProps['data']['referred_by_type']) || 'SELF',
        referred_by_sub_broker_id: full.referred_by_type === 'SUB_BROKER' ? str(full.referred_by_sub_broker_id) : '',
        referred_sub_broker_name: referredBroker?.full_name || '',
        referred_by_customer_id: full.referred_by_type === 'CUSTOMER' ? str(full.referred_by_customer_id) : '',
        referred_customer_name: referredCustomer?.customer_name || '',
      });
    } catch { /* keep basic customer selection */ }
  };

  return (
    <div className="space-y-5">
      <Section title="Customer" description="Search and select the policyholder" icon={<UserCheck className="h-4 w-4" />}>
        <Field label="Customer" required error={errors.customer}>
          <CustomerSearch
            selectedName={data.customer?.customer_name}
            onSelect={onSelectCustomer}
            onClear={() => update({ customer: null, family_members: [], members_loaded: false })}
            error={errors.customer}
          />
        </Field>
        {data.customer && (
          <p className="mt-2 text-xs text-muted-foreground">
            {data.customer.customer_phone}
            {data.customer.customer_email ? ` • ${data.customer.customer_email}` : ''}
            {data.customer.family_code ? ` • Family: ${data.customer.family_code}` : ''}
          </p>
        )}
      </Section>

      <Section title="Policy Classification" description="Line of business, product and policy number" icon={<Layers className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Line of Business" required>
            <div className={cn(inputCls, 'flex items-center gap-2 bg-muted/40')}>
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span className="font-medium text-foreground">Health Insurance</span>
            </div>
          </Field>

          <Field label="Product" required error={errors.product_id}>
            <SearchableDropdown
              value={data.product_id}
              onChange={(v) => update({ product_id: v, sub_product_id: '' })}
              options={masters.products}
              loading={masters.loadingProducts}
              placeholder="Select product"
              error={errors.product_id}
            />
          </Field>

          <Field label="Sub-Product">
            <SearchableDropdown
              value={data.sub_product_id}
              onChange={(v) => update({ sub_product_id: v })}
              options={masters.subProducts}
              loading={masters.loadingSubProducts}
              disabled={!data.product_id}
              placeholder={data.product_id ? 'Select sub-product' : 'Select a product first'}
            />
          </Field>

          <Field label="Policy Number" required error={errors.policy_number}>
            <div className="relative">
              <Hash className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={data.policy_number}
                onChange={(e) => update({ policy_number: e.target.value })}
                placeholder="Enter unique policy number"
                className={cn(inputCls, 'pl-9 pr-9', errors.policy_number && 'border-destructive')}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {data.policy_number_status === 'checking' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {data.policy_number_status === 'available' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                {data.policy_number_status === 'taken' && <XCircle className="h-3.5 w-3.5 text-destructive" />}
              </span>
            </div>
            {data.policy_number_status === 'taken' && (
              <p className="text-[11px] font-medium text-destructive">This policy number already exists</p>
            )}
          </Field>

          <Field label="Policy Type" required error={errors.policy_type_id}>
            <SearchableDropdown
              value={data.policy_type_id}
              onChange={(v, opt) => update({ policy_type_id: v, policy_type_name: opt?.label || '' })}
              options={masters.policyTypes.map((t) => ({ value: t.id, label: t.name }))}
              loading={masters.loadingPolicyTypes}
              placeholder="Select policy type"
              error={errors.policy_type_id}
            />
          </Field>
        </div>
      </Section>

      <Section title="Policy Period" description="Issue, start and end dates" icon={<CalendarDays className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Issue Date">
            <input type="date" value={data.issue_date} onChange={(e) => update({ issue_date: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Start Date" required error={errors.start_date}>
            <input type="date" value={data.start_date} onChange={(e) => onStartDate(e.target.value)} className={cn(inputCls, errors.start_date && 'border-destructive')} />
          </Field>
          <Field label="End Date" required error={errors.end_date} hint="Auto-set to 1 year − 1 day">
            <input type="date" value={data.end_date} onChange={(e) => update({ end_date: e.target.value })} className={cn(inputCls, errors.end_date && 'border-destructive')} />
          </Field>
        </div>
      </Section>

      <Section title="Referred By" description="Prefilled from customer when available" icon={<UserCheck className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Referral Type">
            <div className="flex gap-2">
              {REFERRAL_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => update({
                    referred_by_type: t.value,
                    referred_by_sub_broker_id: '',
                    referred_sub_broker_name: '',
                    referred_by_customer_id: '',
                    referred_customer_name: '',
                  })}
                  className={cn(
                    'flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition',
                    data.referred_by_type === t.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/40',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Field>

          {data.referred_by_type === 'SUB_BROKER' && (
            <Field label="Sub Broker" required error={errors.referred_by_sub_broker_id}>
              <SubBrokerSearch
                selectedName={data.referred_sub_broker_name}
                onSelect={(b) => update({ referred_by_sub_broker_id: b.id, referred_sub_broker_name: b.full_name })}
                onClear={() => update({ referred_by_sub_broker_id: '', referred_sub_broker_name: '' })}
                error={errors.referred_by_sub_broker_id}
              />
            </Field>
          )}

          {data.referred_by_type === 'CUSTOMER' && (
            <Field label="Referring Customer" required error={errors.referred_by_customer_id}>
              <CustomerSearch
                selectedName={data.referred_customer_name}
                onSelect={(c) => update({ referred_by_customer_id: c.id, referred_customer_name: c.customer_name })}
                onClear={() => update({ referred_by_customer_id: '', referred_customer_name: '' })}
                error={errors.referred_by_customer_id}
              />
            </Field>
          )}
        </div>
      </Section>

      <Section title="Policy Document" description="Attach the policy PDF (optional)" icon={<FileText className="h-4 w-4" />}>
        <DocumentList documents={data.policy_documents} onChange={(docs) => update({ policy_documents: docs })} label="Attach policy PDF" />
      </Section>
    </div>
  );
}
