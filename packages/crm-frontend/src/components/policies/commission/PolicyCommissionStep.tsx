import { BadgeIndianRupee, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Section, SearchableDropdown, inputCls, inr } from '../shared';

export interface CommissionRow {
  percentage: string;
  amount: string;
}

export interface CommissionRowConfig {
  key: string;
  label: string;
  baseAmount: number;
  row: CommissionRow;
  onRowChange: (row: CommissionRow) => void;
}

export interface PolicyCommissionStepProps {
  rows: CommissionRowConfig[];
  totalCommission: number;
  notes: string;
  onNotesChange: (v: string) => void;
  referredByType?: string;
  referredSubBrokerName?: string;
  shareEnabled: boolean;
  onShareToggle: () => void;
  shareBasis: 'COMMISSION_AMOUNT' | 'PREMIUM';
  onShareBasisChange: (v: 'COMMISSION_AMOUNT' | 'PREMIUM') => void;
  shareRows: CommissionRowConfig[];
  shareTotal: number;
  shareError?: string;
  showSubBrokerSection: boolean;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v: string | number | null | undefined) => (v === '' || v == null ? 0 : Number(v) || 0);

function CommissionTable({
  rows,
  total,
  totalLabel,
  baseHeader,
}: {
  rows: CommissionRowConfig[];
  total: number;
  totalLabel: string;
  baseHeader: string;
}) {
  const onPct = (row: CommissionRowConfig, v: string) =>
    row.onRowChange({ percentage: v, amount: String(round2((row.baseAmount * num(v)) / 100)) });
  const onAmt = (row: CommissionRowConfig, v: string) =>
    row.onRowChange({ amount: v, percentage: row.baseAmount ? String(round2((num(v) / row.baseAmount) * 100)) : '' });

  return (
    <div className="overflow-hidden rounded-xl border border-border/60">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 text-left font-semibold">Component</th>
            <th className="px-4 py-2.5 text-right font-semibold">{baseHeader}</th>
            <th className="px-4 py-2.5 text-right font-semibold">Commission %</th>
            <th className="px-4 py-2.5 text-right font-semibold">Commission Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="px-4 py-2.5 font-medium text-foreground">{row.label}</td>
              <td className="px-4 py-2.5 text-right text-muted-foreground">₹{inr(row.baseAmount)}</td>
              <td className="px-4 py-2 text-right">
                <input type="number" value={row.row.percentage} onChange={(e) => onPct(row, e.target.value)} placeholder="0" className="h-8 w-24 rounded-lg border border-border/70 bg-background px-2 text-right text-sm outline-none focus:border-primary/60" />
              </td>
              <td className="px-4 py-2 text-right">
                <input type="number" value={row.row.amount} onChange={(e) => onAmt(row, e.target.value)} placeholder="0" className="h-8 w-28 rounded-lg border border-border/70 bg-background px-2 text-right text-sm outline-none focus:border-primary/60" />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-primary/5">
          <tr>
            <td colSpan={3} className="px-4 py-2.5 text-right text-sm font-semibold text-foreground">{totalLabel}</td>
            <td className="px-4 py-2.5 text-right text-base font-bold text-primary">₹{inr(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function PolicyCommissionStep({
  rows,
  totalCommission,
  notes,
  onNotesChange,
  referredSubBrokerName,
  shareEnabled,
  onShareToggle,
  shareBasis,
  onShareBasisChange,
  shareRows,
  shareTotal,
  shareError,
  showSubBrokerSection,
}: PolicyCommissionStepProps) {
  return (
    <div className="space-y-5">
      <Section title="Our Commission" description="Agency commission" icon={<BadgeIndianRupee className="h-4 w-4" />}>
        <CommissionTable rows={rows} total={totalCommission} totalLabel="Total Commission" baseHeader="Premium" />
        <div className="mt-4">
          <label className="text-xs font-semibold text-foreground/80">Notes</label>
          <textarea value={notes} onChange={(e) => onNotesChange(e.target.value)} rows={2} placeholder="Optional notes" className={cn(inputCls, 'mt-1.5 h-auto py-2')} />
        </div>
      </Section>

      {showSubBrokerSection && (
        <Section title="Sub-broker Commission" description={`Share commission with ${referredSubBrokerName || 'the referring sub-broker'}`} icon={<Users className="h-4 w-4" />}>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={shareEnabled} onChange={onShareToggle} className="h-4 w-4 rounded border-border" />
            Enable sub-broker commission share
          </label>
          {shareError && <p className="mt-1 text-[11px] font-medium text-destructive">{shareError}</p>}

          {shareEnabled && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground/80">Commission Based On</label>
                <SearchableDropdown
                  value={shareBasis}
                  onChange={(v) => onShareBasisChange(v as 'COMMISSION_AMOUNT' | 'PREMIUM')}
                  options={[
                    { value: 'COMMISSION_AMOUNT', label: 'Our Commission Amount' },
                    { value: 'PREMIUM', label: 'Premium' },
                  ]}
                  searchable={false}
                />
              </div>
              <CommissionTable
                rows={shareRows}
                total={shareTotal}
                totalLabel="Total Sub-broker Share"
                baseHeader={shareBasis === 'PREMIUM' ? 'Premium' : 'Our Commission'}
              />
              <p className="text-[11px] text-muted-foreground">
                Our total commission: ₹{inr(totalCommission)}. Wallet is adjusted automatically when you save changes on an active policy.
              </p>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
