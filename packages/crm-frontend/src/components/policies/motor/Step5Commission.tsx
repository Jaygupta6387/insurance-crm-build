import { BadgeIndianRupee, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Section, SearchableDropdown, inputCls, inr } from './shared';
import type { MotorWizardData, StepProps, CommissionRow } from './types';

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v: string | number | null | undefined) => (v === '' || v == null ? 0 : Number(v) || 0);

type Component = 'od' | 'tp' | 'addon';

export default function Step5Commission({ data, update, errors, masters }: StepProps) {
  const isSubBrokerReferral = data.referred_by_type === 'SUB_BROKER';
  const subBrokerName = data.referred_sub_broker_name || masters.subBrokers.find((b) => b.value === data.referred_by_sub_broker_id)?.label;

  const bases: Record<Component, number> = {
    od: num(data.total_od_premium),
    tp: num(data.tp_premium),
    addon: num(data.addon_premium),
  };
  const rowKey: Record<Component, keyof MotorWizardData> = {
    od: 'commission_od', tp: 'commission_tp', addon: 'commission_addon',
  };

  const setRow = (c: Component, row: CommissionRow) => update({ [rowKey[c]]: row } as Partial<MotorWizardData>);
  const onPct = (c: Component, v: string) => setRow(c, { percentage: v, amount: String(round2((bases[c] * num(v)) / 100)) });
  const onAmt = (c: Component, v: string) => setRow(c, { amount: v, percentage: bases[c] ? String(round2((num(v) / bases[c]) * 100)) : '' });

  const rows: { key: Component; label: string; row: CommissionRow }[] = [
    { key: 'od', label: 'OD', row: data.commission_od },
    { key: 'tp', label: 'TP', row: data.commission_tp },
    { key: 'addon', label: 'Add-on', row: data.commission_addon },
  ];

  const total = round2(num(data.commission_od.amount) + num(data.commission_tp.amount) + num(data.commission_addon.amount));

  const ourAmounts: Record<Component, number> = {
    od: num(data.commission_od.amount),
    tp: num(data.commission_tp.amount),
    addon: num(data.commission_addon.amount),
  };

  const shareKey: Record<Component, keyof MotorWizardData> = { od: 'share_od', tp: 'share_tp', addon: 'share_addon' };
  const baseForShare = (c: Component) => (data.share_basis === 'PREMIUM' ? bases[c] : ourAmounts[c]);
  const setShare = (c: Component, row: CommissionRow) => update({ [shareKey[c]]: row } as Partial<MotorWizardData>);
  const onSharePct = (c: Component, v: string) => setShare(c, { percentage: v, amount: String(round2((baseForShare(c) * num(v)) / 100)) });
  const onShareAmt = (c: Component, v: string) => setShare(c, { amount: v, percentage: baseForShare(c) ? String(round2((num(v) / baseForShare(c)) * 100)) : '' });

  const shareRows: { key: Component; label: string; row: CommissionRow }[] = [
    { key: 'od', label: 'OD', row: data.share_od },
    { key: 'tp', label: 'TP', row: data.share_tp },
    { key: 'addon', label: 'Add-on', row: data.share_addon },
  ];
  const shareTotal = round2(num(data.share_od.amount) + num(data.share_tp.amount) + num(data.share_addon.amount));

  const toggleShare = () => {
    if (!data.share_with_sub_broker) {
      update({ share_with_sub_broker: true });
    } else {
      update({
        share_with_sub_broker: false,
        share_od: { percentage: '', amount: '' },
        share_tp: { percentage: '', amount: '' },
        share_addon: { percentage: '', amount: '' },
      });
    }
  };

  const showSubBrokerSection = isSubBrokerReferral || data.share_with_sub_broker;

  return (
    <div className="space-y-5">
      <Section title="Our Commission" description="Agency commission by component" icon={<BadgeIndianRupee className="h-4 w-4" />}>
        <div className="overflow-hidden rounded-xl border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold">Component</th>
                <th className="px-4 py-2.5 text-right font-semibold">Premium</th>
                <th className="px-4 py-2.5 text-right font-semibold">Commission %</th>
                <th className="px-4 py-2.5 text-right font-semibold">Commission Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map(({ key, label, row }) => (
                <tr key={key}>
                  <td className="px-4 py-2.5 font-medium text-foreground">{label}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">₹{inr(bases[key])}</td>
                  <td className="px-4 py-2 text-right">
                    <input type="number" value={row.percentage} onChange={(e) => onPct(key, e.target.value)} placeholder="0" className="h-8 w-24 rounded-lg border border-border/70 bg-background px-2 text-right text-sm outline-none focus:border-primary/60" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input type="number" value={row.amount} onChange={(e) => onAmt(key, e.target.value)} placeholder="0" className="h-8 w-28 rounded-lg border border-border/70 bg-background px-2 text-right text-sm outline-none focus:border-primary/60" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-primary/5">
              <tr>
                <td colSpan={3} className="px-4 py-2.5 text-right text-sm font-semibold text-foreground">Total Commission</td>
                <td className="px-4 py-2.5 text-right text-base font-bold text-primary">₹{inr(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold text-foreground/80">Notes</label>
          <textarea value={data.commission_notes} onChange={(e) => update({ commission_notes: e.target.value })} rows={2} placeholder="Optional notes" className={cn(inputCls, 'mt-1.5 h-auto py-2')} />
        </div>
      </Section>

      {showSubBrokerSection && (
        <Section title="Sub-broker Commission" description={`Share commission with ${subBrokerName || 'the referring sub-broker'}`} icon={<Users className="h-4 w-4" />}>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={data.share_with_sub_broker} onChange={toggleShare} className="h-4 w-4 rounded border-border" />
            Enable sub-broker commission share
          </label>
          {errors.share && <p className="mt-1 text-[11px] font-medium text-destructive">{errors.share}</p>}

          {data.share_with_sub_broker && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground/80">Commission Based On</label>
                <SearchableDropdown
                  value={data.share_basis}
                  onChange={(v) => update({
                    share_basis: v as MotorWizardData['share_basis'],
                    share_od: { percentage: '', amount: '' },
                    share_tp: { percentage: '', amount: '' },
                    share_addon: { percentage: '', amount: '' },
                  })}
                  options={[{ value: 'COMMISSION_AMOUNT', label: 'Our Commission Amount' }, { value: 'PREMIUM', label: 'Premium' }]}
                  searchable={false}
                />
              </div>

              <div className="overflow-hidden rounded-xl border border-border/60">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold">Component</th>
                      <th className="px-4 py-2.5 text-right font-semibold">{data.share_basis === 'PREMIUM' ? 'Premium' : 'Our Commission'}</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Share %</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Share Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {shareRows.map(({ key, label, row }) => (
                      <tr key={key}>
                        <td className="px-4 py-2.5 font-medium text-foreground">{label}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">₹{inr(baseForShare(key))}</td>
                        <td className="px-4 py-2 text-right">
                          <input type="number" value={row.percentage} onChange={(e) => onSharePct(key, e.target.value)} placeholder="0" className="h-8 w-24 rounded-lg border border-border/70 bg-background px-2 text-right text-sm outline-none focus:border-primary/60" />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <input type="number" value={row.amount} onChange={(e) => onShareAmt(key, e.target.value)} placeholder="0" className="h-8 w-28 rounded-lg border border-border/70 bg-background px-2 text-right text-sm outline-none focus:border-primary/60" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-primary/5">
                    <tr>
                      <td colSpan={3} className="px-4 py-2.5 text-right text-sm font-semibold text-foreground">Total Sub-broker Share</td>
                      <td className="px-4 py-2.5 text-right text-base font-bold text-primary">₹{inr(shareTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Our total commission: ₹{inr(total)}. Wallet is adjusted automatically when you save changes on an active policy.
              </p>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
