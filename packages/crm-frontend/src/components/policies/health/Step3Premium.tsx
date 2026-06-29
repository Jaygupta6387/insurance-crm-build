import { useState } from 'react';
import { Calculator, CreditCard, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { healthPlanService } from '@/services/healthPlanService';
import { Field, Section, SearchableDropdown, DocumentList, inputCls, inr } from '../shared';
import { PAYMENT_MODES } from '@/constants/health';
import type { StepProps } from './types';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v: string | number | null | undefined) => (v === '' || v == null ? 0 : Number(v) || 0);

export default function Step3Premium({ data, update, errors, masters }: StepProps) {
  const [gstLoading, setGstLoading] = useState(false);

  const recalc = (patch: Partial<typeof data>) => {
    const merged = { ...data, ...patch };
    const base = num(merged.base_premium);
    const gstAmt = round2((base * merged.gst_percent) / 100);
    const net = base;
    const total = round2(net + gstAmt);
    update({
      ...patch,
      gst_amount: String(gstAmt),
      net_premium: String(net),
      total_premium: String(total),
    });
  };

  const onBasePremium = (v: string) => recalc({ base_premium: v });

  const fetchGst = async () => {
    setGstLoading(true);
    try {
      const res = await healthPlanService.getGst({
        lob_id: data.lob_id || undefined,
        product_id: data.product_id || undefined,
      });
      const gstPercent = res.data.data.gst_percent ?? 0;
      const base = num(data.base_premium);
      const gstAmt = round2((base * gstPercent) / 100);
      update({
        gst_percent: gstPercent,
        gst_amount: String(gstAmt),
        net_premium: String(base),
        total_premium: String(round2(base + gstAmt)),
      });
    } catch { /* user can enter GST manually */ }
    finally {
      setGstLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <Section title="Premium" description="Enter base premium and apply GST" icon={<Calculator className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Base Premium" required error={errors.base_premium}>
            <input
              type="number"
              value={data.base_premium}
              onChange={(e) => onBasePremium(e.target.value)}
              placeholder="₹"
              className={cn(inputCls, errors.base_premium && 'border-destructive')}
            />
          </Field>

          <Field label="GST %" hint="Click Get GST to resolve from master">
            <div className="flex gap-2">
              <input
                type="number"
                value={data.gst_percent || ''}
                onChange={(e) => recalc({ gst_percent: num(e.target.value) })}
                placeholder="0"
                className={cn(inputCls, 'flex-1')}
              />
              <button
                type="button"
                onClick={fetchGst}
                disabled={gstLoading}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {gstLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Get GST'}
              </button>
            </div>
          </Field>

          <Readout label="GST Amount" value={data.gst_amount} />
          <Readout label="Net Premium" value={data.net_premium} />
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-primary/10 px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Total Premium</span>
          <span className="text-lg font-bold text-primary">₹{inr(data.total_premium)}</span>
        </div>
      </Section>

      <Section title="Payment" description="Mode and collection details" icon={<CreditCard className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Payment Mode" required error={errors.payment_mode}>
            <SearchableDropdown
              value={data.payment_mode}
              onChange={(v) => update({ payment_mode: v })}
              options={PAYMENT_MODES}
              searchable={false}
              placeholder="Select payment mode"
              error={errors.payment_mode}
            />
          </Field>
          <Field label="Payment Reference">
            <input value={data.payment_reference} onChange={(e) => update({ payment_reference: e.target.value })} placeholder="Txn / cheque no." className={inputCls} />
          </Field>

          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={data.is_full_payment}
                onChange={(e) => update({ is_full_payment: e.target.checked, amount_received: e.target.checked ? '' : data.amount_received })}
                className="h-4 w-4 rounded border-border"
              />
              Full payment received
            </label>
          </div>

          {!data.is_full_payment && (
            <>
              <Field label="Amount Received" required error={errors.amount_received}>
                <input type="number" value={data.amount_received} onChange={(e) => update({ amount_received: e.target.value })} placeholder="₹" className={cn(inputCls, errors.amount_received && 'border-destructive')} />
              </Field>
              <Field label="Pending (to customer wallet)">
                <input
                  value={`₹${inr(round2(num(data.total_premium) - num(data.amount_received)))}`}
                  disabled
                  className={cn(inputCls, 'bg-amber-50 font-semibold text-amber-700 dark:bg-amber-950/30')}
                />
              </Field>
            </>
          )}
        </div>
      </Section>

      <Section title="Previous Policy" description="Optional — renewal or portability reference" icon={<FileText className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Previous Policy Number">
            <input value={data.previous_policy_number} onChange={(e) => update({ previous_policy_number: e.target.value })} placeholder="Prior policy number" className={inputCls} />
          </Field>
          <Field label="Previous Insurer">
            <SearchableDropdown
              value={data.previous_insurance_company_id}
              onChange={(v) => update({ previous_insurance_company_id: v })}
              options={masters.insurers}
              loading={masters.loadingInsurers}
              placeholder="Select previous insurer"
            />
          </Field>
        </div>
        <div className="mt-4">
          <DocumentList
            documents={data.prev_policy_documents}
            onChange={(docs) => update({ prev_policy_documents: docs })}
            label="Attach previous policy document"
          />
        </div>
      </Section>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground">₹{inr(value)}</span>
    </div>
  );
}
