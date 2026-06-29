import { useEffect, useRef, useState } from 'react';
import { Calculator, Loader2, Equal, Wallet, CreditCard, Database, PencilLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { policyService } from '@/services/policyService';
import { Field, Section, SearchableDropdown, inputCls, inr } from './shared';
import { PAYMENT_MODES, evaluateAdditiveExpression, PA_RATES } from '@/constants/motor';
import type { MotorWizardData, StepProps } from './types';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v: string | number | null | undefined) => (v === '' || v == null ? 0 : Number(v) || 0);

export default function Step3Premium({ data, update, errors }: StepProps) {
  const [calcLoading, setCalcLoading] = useState(false);
  const initRef = useRef(false);

  const basic = data.rate_source === 'DB' ? data.fixed_basic_premium || 0 : num(data.basic_premium);

  // Recompute all derived figures from the merged inputs
  const finalize = (merged: MotorWizardData) => {
    const b = merged.rate_source === 'DB' ? merged.fixed_basic_premium || 0 : num(merged.basic_premium);
    const bad = num(merged.basic_after_discount);
    const ncb = num(merged.ncb_percent);
    const od = round2(bad * (1 - ncb / 100));
    const tp = merged.rate_source === 'DB' ? merged.fixed_tp_premium || 0 : num(merged.tp_premium);
    const addon = num(merged.addon_premium);
    const totalOd = round2(od + addon);
    const net = round2(totalOd + tp);
    const gstOd = round2((totalOd * merged.gst_on_od_percent) / 100);
    const gstTp = round2((tp * merged.gst_on_tp_percent) / 100);
    const totalGst = round2(gstOd + gstTp);
    const total = round2(net + totalGst);
    update({
      ...merged,
      basic_premium: merged.rate_source === 'DB' ? String(b) : merged.basic_premium,
      tp_premium: merged.rate_source === 'DB' ? String(tp) : merged.tp_premium,
      od_premium: String(od),
      total_od_premium: String(totalOd),
      net_premium: String(net),
      gst_on_od: String(gstOd),
      gst_on_tp: String(gstTp),
      total_gst: String(totalGst),
      total_premium: String(total),
    });
  };

  // Initial calculation: resolve scenario (DB/MANUAL), fixed values & GST rates
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    (async () => {
      setCalcLoading(true);
      // Suggested add-on premium from step 2 selections + PA amounts
      const seating = data.vehicle?.seating_capacity || 0;
      const addonFromCoverages = data.add_ons.filter((a) => a.checked).reduce((s, a) => s + num(a.amount), 0);
      const pa =
        (data.pa_passenger_1l ? seating * PA_RATES.passenger1Lakh : 0) +
        (data.pa_passenger_2l ? seating * PA_RATES.passenger2Lakh : 0) +
        (data.paid_driver ? PA_RATES.paidDriver : 0);
      const suggestedAddon = addonFromCoverages + pa;

      try {
        const res = await policyService.calculatePremium({
          product_id: data.product_id || undefined,
          sub_product_id: data.sub_product_id || undefined,
          rto_city: data.vehicle?.rto_code?.city || undefined,
          cubic_capacity: data.vehicle?.cubic_capacity || undefined,
          manufacture_year: data.vehicle?.manufacture_year || undefined,
          idv: num(data.idv),
          discount_percent: num(data.discount_percent),
          ncb_percent: num(data.ncb_percent),
          addon_premium: data.addon_premium ? num(data.addon_premium) : suggestedAddon,
          basic_premium: num(data.basic_premium),
          tp_premium: num(data.tp_premium),
        });
        const p = res.data.data.premium;
        const merged: MotorWizardData = {
          ...data,
          rate_source: p.rate_source,
          fixed_basic_premium: p.fixed_basic_premium,
          fixed_tp_premium: p.fixed_tp_premium,
          gst_on_od_percent: p.gst_on_od_percent,
          gst_on_tp_percent: p.gst_on_tp_percent,
          basic_premium: p.rate_source === 'DB' ? String(p.fixed_basic_premium ?? '') : data.basic_premium,
          tp_premium: p.rate_source === 'DB' ? String(p.fixed_tp_premium ?? '') : data.tp_premium,
          addon_premium: data.addon_premium || (suggestedAddon ? String(suggestedAddon) : ''),
          addon_premium_expr: data.addon_premium_expr || (suggestedAddon ? String(suggestedAddon) : ''),
          basic_after_discount:
            data.basic_after_discount ||
            String(round2((p.rate_source === 'DB' ? p.fixed_basic_premium || 0 : num(data.basic_premium)) * (1 - num(data.discount_percent) / 100))),
        };
        finalize(merged);
      } catch {
        finalize(data);
      } finally {
        setCalcLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const onDiscount = (v: string) => {
    const bad = round2(basic * (1 - num(v) / 100));
    finalize({ ...data, discount_percent: v, basic_after_discount: String(bad) });
  };
  const onBasicAfterDiscount = (v: string) => {
    const disc = basic ? round2((1 - num(v) / basic) * 100) : 0;
    finalize({ ...data, basic_after_discount: v, discount_percent: String(disc) });
  };
  const onManualBasic = (v: string) => {
    const bad = round2(num(v) * (1 - num(data.discount_percent) / 100));
    finalize({ ...data, basic_premium: v, basic_after_discount: String(bad) });
  };
  const onNcb = (v: string) => finalize({ ...data, ncb_percent: v });
  const onManualTp = (v: string) => finalize({ ...data, tp_premium: v });
  const evalAddon = () => {
    const amt = evaluateAdditiveExpression(data.addon_premium_expr);
    finalize({ ...data, addon_premium: String(amt), addon_premium_expr: String(amt) });
  };

  const isDb = data.rate_source === 'DB';

  return (
    <div className="space-y-5">
      <Section
        title="Premium Calculation"
        description={isDb ? 'Rates resolved from product + sub-product premium master' : 'Manual premium entry — select product & sub-product with a matching rate, or enter manually'}
        icon={<Calculator className="h-4 w-4" />}
        action={
          <span className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold', isDb ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300')}>
            {isDb ? <Database className="h-3 w-3" /> : <PencilLine className="h-3 w-3" />}
            {isDb ? 'Tariff (DB)' : 'Manual'}
          </span>
        }
      >
        {calcLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Calculating premium…</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Basic Premium" hint={isDb ? 'Fixed (IDV × OD rate)' : 'Enter manually'}>
              <input
                type="number"
                value={data.basic_premium}
                onChange={(e) => onManualBasic(e.target.value)}
                disabled={isDb}
                className={cn(inputCls, isDb && 'bg-muted/40')}
              />
            </Field>

            <Field label="Discount %">
              <input type="number" value={data.discount_percent} onChange={(e) => onDiscount(e.target.value)} placeholder="0" className={inputCls} />
            </Field>

            <Field label="Basic Premium (after discount)">
              <input type="number" value={data.basic_after_discount} onChange={(e) => onBasicAfterDiscount(e.target.value)} className={inputCls} />
            </Field>

            <Field label="NCB Discount %">
              <input type="number" value={data.ncb_percent} onChange={(e) => onNcb(e.target.value)} placeholder="0" className={inputCls} />
            </Field>

            <Field label="OD Premium" hint="Basic (after discount − NCB%)">
              <input value={inr(data.od_premium)} disabled className={cn(inputCls, 'bg-muted/40')} />
            </Field>

            <Field label="TP Premium" hint={isDb ? 'Fixed tariff' : 'Enter manually'}>
              <input
                type="number"
                value={data.tp_premium}
                onChange={(e) => onManualTp(e.target.value)}
                disabled={isDb}
                className={cn(inputCls, isDb && 'bg-muted/40')}
              />
            </Field>

            <Field label="Add-on Premium" hint="Enter a value or an expression like 100+200+400" className="sm:col-span-2">
              <div className="flex gap-2">
                <input
                  value={data.addon_premium_expr}
                  onChange={(e) => update({ addon_premium_expr: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); evalAddon(); } }}
                  placeholder="e.g. 100+200+400"
                  className={cn(inputCls, 'flex-1')}
                />
                <button type="button" onClick={evalAddon} className="flex items-center gap-1 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                  <Equal className="h-4 w-4" /> {data.addon_premium ? `₹${inr(data.addon_premium)}` : 'Calc'}
                </button>
              </div>
            </Field>
          </div>
        )}
      </Section>

      {/* Totals */}
      <Section title="Premium Summary" description="GST and totals" icon={<Wallet className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Readout label="Total OD Premium" value={data.total_od_premium} hint="OD + Add-on" />
          <Readout label="TP Premium" value={data.tp_premium} />
          <Readout label={`GST on OD (${data.gst_on_od_percent}%)`} value={data.gst_on_od} />
          <Readout label={`GST on TP (${data.gst_on_tp_percent}%)`} value={data.gst_on_tp} />
          <Readout label="Net Premium" value={data.net_premium} hint="Total OD + TP" />
          <Readout label="Total GST" value={data.total_gst} />
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-primary/10 px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Total Premium</span>
          <span className="text-lg font-bold text-primary">₹{inr(data.total_premium)}</span>
        </div>
      </Section>

      {/* Payment */}
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
    </div>
  );
}

function Readout({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2.5">
      <span className="text-xs text-muted-foreground">
        {label}
        {hint && <span className="ml-1 text-[10px] opacity-70">({hint})</span>}
      </span>
      <span className="text-sm font-semibold text-foreground">₹{inr(value)}</span>
    </div>
  );
}
