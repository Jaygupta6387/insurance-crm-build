import { useEffect, useState } from 'react';
import {
  ArrowDownCircle, ArrowUpCircle, Loader2, Phone, ReceiptText, User, Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';
import {
  customerWalletService,
  type CustomerWalletTransaction,
  type PendingBalance,
} from '@/services/customerWalletService';

const inr = (v: string | number | null | undefined) =>
  (Number(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const REASON_LABELS: Record<string, string> = {
  POLICY_PENDING: 'Policy partial payment',
  PAYMENT_RECEIVED: 'Payment received',
  MANUAL_ADD: 'Manual pending added',
  MANUAL_SETTLE: 'Manual settlement',
  ADJUSTMENT: 'Adjustment',
};

type ActionType = 'SETTLE' | 'ADD';

interface WalletForm {
  action: ActionType;
  amount: string;
  policy_number: string;
  note: string;
}

interface CustomerWalletManageModalProps {
  customer: PendingBalance | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CustomerWalletManageModal({
  customer,
  open,
  onClose,
  onSuccess,
}: CustomerWalletManageModalProps) {
  const toast = useToast();
  const [ledger, setLedger] = useState<CustomerWalletTransaction[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<WalletForm>({
    action: 'SETTLE',
    amount: '',
    policy_number: '',
    note: '',
  });

  useEffect(() => {
    if (!open || !customer) return;
    setForm({ action: 'SETTLE', amount: '', policy_number: '', note: '' });
    setLoadingLedger(true);
    customerWalletService
      .getLedger(customer.id)
      .then((r) => {
        const data = r.data.data;
        setLedger(data.transactions || []);
        setBalance(Number(data.customer?.wallet_balance) || 0);
      })
      .catch(() => {
        setLedger([]);
        setBalance(Number(customer.pending_amount) || 0);
        toast.error('Failed to load wallet history');
      })
      .finally(() => setLoadingLedger(false));
  }, [open, customer]);

  const handleActionChange = (action: ActionType) => {
    setForm((f) => ({ ...f, action }));
  };

  const handleSubmit = async () => {
    if (!customer) return;
    const amt = parseFloat(form.amount);
    if (!form.amount || Number.isNaN(amt) || amt <= 0) {
      toast.error('Enter a valid positive amount');
      return;
    }
    if (form.action === 'SETTLE' && amt > balance) {
      toast.error('Settlement amount exceeds pending balance');
      return;
    }

    setSaving(true);
    try {
      const isSettle = form.action === 'SETTLE';
      await customerWalletService.adjustWallet(customer.id, {
        type: isSettle ? 'CREDIT' : 'DEBIT',
        amount: amt,
        reason: isSettle ? 'MANUAL_SETTLE' : 'MANUAL_ADD',
        note: form.note.trim() || undefined,
        policy_number: form.policy_number.trim() || undefined,
      });
      toast.success(isSettle ? 'Pending balance settled' : 'Pending balance added');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Failed to update wallet');
    } finally {
      setSaving(false);
    }
  };

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Manage Customer Wallet
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          {/* Customer summary */}
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 font-semibold text-foreground">
                  <User className="h-4 w-4 text-muted-foreground" />
                  {customer.customer_name}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" /> {customer.customer_phone}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pending</p>
                <p className="text-xl font-bold text-amber-600">₹{inr(balance)}</p>
              </div>
            </div>
          </div>

          {/* Add / Settle form */}
          <div className="space-y-4 rounded-xl border border-border/60 p-4">
            <p className="text-sm font-semibold text-foreground">Record transaction</p>

            <div className="grid gap-1.5">
              <Label>Action</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={form.action === 'SETTLE' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => handleActionChange('SETTLE')}
                >
                  <ArrowDownCircle className="h-4 w-4" /> Settle
                </Button>
                <Button
                  type="button"
                  variant={form.action === 'ADD' ? 'secondary' : 'outline'}
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => handleActionChange('ADD')}
                >
                  <ArrowUpCircle className="h-4 w-4" /> Add pending
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {form.action === 'SETTLE'
                  ? 'Record payment received — reduces outstanding balance.'
                  : 'Add amount owed by customer — increases pending balance.'}
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="wallet_amount">
                Amount (₹) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="wallet_amount"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
              />
              {form.action === 'SETTLE' && balance > 0 && (
                <button
                  type="button"
                  className="text-left text-xs font-medium text-primary hover:underline"
                  onClick={() => setForm((f) => ({ ...f, amount: String(balance) }))}
                >
                  Settle full pending (₹{inr(balance)})
                </button>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="wallet_policy">Policy number (optional)</Label>
              <Input
                id="wallet_policy"
                value={form.policy_number}
                onChange={(e) => setForm((f) => ({ ...f, policy_number: e.target.value }))}
                placeholder="POL-2026-001234"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="wallet_remarks">
                Remarks <span className="text-destructive">*</span>
              </Label>
              <textarea
                id="wallet_remarks"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="e.g. Cash received at office, UPI ref 123456…"
                rows={3}
                className="w-full resize-none rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-sm outline-none transition-all focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </div>

          {/* Ledger */}
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ReceiptText className="h-4 w-4 text-muted-foreground" />
              Transaction history
            </p>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-border/60">
              {loadingLedger ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : ledger.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No transactions yet</p>
              ) : (
                <ul className="divide-y divide-border/40">
                  {ledger.map((tx) => (
                    <li key={tx.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {REASON_LABELS[tx.reason || ''] || tx.reason || 'Transaction'}
                          </p>
                          {tx.note && (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">{tx.note}</p>
                          )}
                          {tx.policy_number && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">Policy: {tx.policy_number}</p>
                          )}
                          <p className="mt-1 text-[11px] text-muted-foreground">{fmtDate(tx.created_at)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={cn(
                            'text-sm font-bold',
                            tx.type === 'CREDIT' ? 'text-emerald-600' : 'text-amber-600',
                          )}>
                            {tx.type === 'CREDIT' ? '−' : '+'}₹{inr(tx.amount)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Bal ₹{inr(tx.balance_after)}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !form.amount || !form.note.trim()}
            variant={form.action === 'SETTLE' ? 'default' : 'secondary'}
          >
            {saving ? 'Saving…' : form.action === 'SETTLE' ? 'Settle amount' : 'Add pending'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
