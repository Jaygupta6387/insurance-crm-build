import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Wallet,
  TrendingUp,
  Users,
  Phone,
  Mail,
  FileText,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowUpCircle,
  ArrowDownCircle,
  Edit,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  subBrokerService,
  masterDataService,
  type SubBroker,
  type WalletTransaction,
  type Commission,
  type CommissionBasis,
  type CommissionComponentType,
  type Lob,
  type Product,
  type SubProductType,
  type InsuranceCompany,
} from '@/services/subBrokerService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | string | null | undefined) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(n ?? 0));

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const REASON_LABELS: Record<string, string> = {
  COMMISSION_EARNED: 'Commission Earned',
  MANUAL_CREDIT: 'Manual Credit',
  MANUAL_DEBIT: 'Manual Debit',
  PAYOUT: 'Payout',
  ADJUSTMENT: 'Adjustment',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

// ─── Wallet Adjust Modal ──────────────────────────────────────────────────────

interface WalletAdjustForm {
  type: 'CREDIT' | 'DEBIT';
  amount: string;
  reason: 'MANUAL_CREDIT' | 'MANUAL_DEBIT' | 'PAYOUT' | 'ADJUSTMENT';
  note: string;
}

function WalletAdjustModal({
  brokerId,
  open,
  onClose,
  onSuccess,
}: {
  brokerId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<WalletAdjustForm>({
    type: 'CREDIT',
    amount: '',
    reason: 'MANUAL_CREDIT',
    note: '',
  });
  const [saving, setSaving] = useState(false);

  const handleTypeChange = (t: 'CREDIT' | 'DEBIT') => {
    setForm((f) => ({
      ...f,
      type: t,
      reason: t === 'CREDIT' ? 'MANUAL_CREDIT' : 'MANUAL_DEBIT',
    }));
  };

  const handleSubmit = async () => {
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) {
      toast.error('Enter a valid positive amount');
      return;
    }
    setSaving(true);
    try {
      await subBrokerService.adjustWallet(brokerId, {
        type: form.type,
        amount: amt,
        reason: form.reason,
        note: form.note || undefined,
      });
      toast.success('Wallet adjusted successfully');
      onSuccess();
      onClose();
      setForm({ type: 'CREDIT', amount: '', reason: 'MANUAL_CREDIT', note: '' });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to adjust wallet');
    } finally {
      setSaving(false);
    }
  };

  const creditReasons = ['MANUAL_CREDIT', 'ADJUSTMENT'] as const;
  const debitReasons = ['MANUAL_DEBIT', 'PAYOUT', 'ADJUSTMENT'] as const;
  const reasons = form.type === 'CREDIT' ? creditReasons : debitReasons;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Wallet Balance</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          {/* Credit / Debit Toggle */}
          <div className="grid gap-1.5">
            <Label>Transaction Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={form.type === 'CREDIT' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 gap-2"
                onClick={() => handleTypeChange('CREDIT')}
              >
                <ArrowUpCircle className="h-4 w-4" /> Credit
              </Button>
              <Button
                type="button"
                variant={form.type === 'DEBIT' ? 'destructive' : 'outline'}
                size="sm"
                className="flex-1 gap-2"
                onClick={() => handleTypeChange('DEBIT')}
              >
                <ArrowDownCircle className="h-4 w-4" /> Debit
              </Button>
            </div>
          </div>
          {/* Amount */}
          <div className="grid gap-1.5">
            <Label htmlFor="wallet_amount">
              Amount <span className="text-destructive">*</span>
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
          </div>
          {/* Reason */}
          <div className="grid gap-1.5">
            <Label>Reason</Label>
            <Select
              value={form.reason}
              onValueChange={(v) => setForm((f) => ({ ...f, reason: v as any }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((r) => (
                  <SelectItem key={r} value={r}>
                    {REASON_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Note */}
          <div className="grid gap-1.5">
            <Label htmlFor="wallet_note">Note</Label>
            <Input
              id="wallet_note"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Optional note for this transaction"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            variant={form.type === 'DEBIT' ? 'destructive' : 'default'}
          >
            {saving ? 'Processing...' : `${form.type === 'CREDIT' ? 'Credit' : 'Debit'} Wallet`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Commission Modal ─────────────────────────────────────────────────────

interface CommissionItemForm {
  component_type: CommissionComponentType;
  base_amount: string;
  percentage: string;
  commission_amount: string;
}

interface CommissionForm {
  policy_number: string;
  lob_id: string;
  product_id: string;
  sub_product_id: string;
  insurance_company_id: string;
  commission_basis: CommissionBasis | '';
  total_commission_amount: string;
  notes: string;
  items: CommissionItemForm[];
}

const COMMISSION_BASIS_LABELS: Record<CommissionBasis, string> = {
  PREMIUM_PERCENTAGE:    'Premium %',
  COMMISSION_PERCENTAGE: 'Commission %',
  FIXED_AMOUNT:          'Fixed Amount',
};

const COMPONENT_TYPE_LABELS: Record<CommissionComponentType, string> = {
  OD: 'OD (Own Damage)', TP: 'TP (Third Party)', ADDON: 'Add-on',
  RSA: 'RSA', ZERO_DEP: 'Zero Dep',
  PREMIUM: 'Premium', TOPUP: 'Top-up',
  YEAR_1: 'Year 1', RENEWAL: 'Renewal', OTHER: 'Other',
};

function AddCommissionModal({
  brokerId,
  open,
  onClose,
  onSuccess,
}: {
  brokerId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();

  // Master data for dropdowns
  const [lobs, setLobs]                       = useState<Lob[]>([]);
  const [products, setProducts]               = useState<Product[]>([]);
  const [subProducts, setSubProducts]         = useState<SubProductType[]>([]);
  const [insuranceCompanies, setInsuranceCompanies] = useState<InsuranceCompany[]>([]);
  const [loadingMaster, setLoadingMaster]     = useState(false);

  const emptyForm: CommissionForm = {
    policy_number: '', lob_id: '', product_id: '', sub_product_id: '',
    insurance_company_id: '', commission_basis: '', total_commission_amount: '',
    notes: '', items: [],
  };
  const [form, setForm]   = useState<CommissionForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Load LOBs + insurers once when modal opens
  useEffect(() => {
    if (!open) return;
    setLoadingMaster(true);
    Promise.all([
      masterDataService.getLobs({ is_active: true }),
      masterDataService.getInsuranceCompanies({ is_active: true }),
    ])
      .then(([lobRes, compRes]) => {
        setLobs(lobRes.data?.data?.lobs ?? []);
        setInsuranceCompanies(compRes.data?.data?.insurance_companies ?? []);
      })
      .catch(() => toast.error('Failed to load dropdown data'))
      .finally(() => setLoadingMaster(false));
  }, [open]);

  // Load products when LOB changes
  useEffect(() => {
    setForm((f) => ({ ...f, product_id: '', sub_product_id: '' }));
    setSubProducts([]);
    if (!form.lob_id) { setProducts([]); return; }
    masterDataService.getProducts({ lob_id: form.lob_id, is_active: true })
      .then((r) => setProducts(r.data?.data?.products ?? []))
      .catch(() => {});
  }, [form.lob_id]);

  // Load sub-products when product changes
  useEffect(() => {
    setForm((f) => ({ ...f, sub_product_id: '' }));
    if (!form.product_id) { setSubProducts([]); return; }
    masterDataService.getSubProducts({ product_id: form.product_id, is_active: true })
      .then((r) => setSubProducts(r.data?.data?.sub_products ?? []))
      .catch(() => {});
  }, [form.product_id]);

  // Auto-sum items into total_commission_amount
  useEffect(() => {
    if (form.items.length === 0) return;
    const sum = form.items.reduce((acc, item) => acc + (parseFloat(item.commission_amount) || 0), 0);
    if (sum > 0) setForm((f) => ({ ...f, total_commission_amount: sum.toFixed(2) }));
  }, [form.items]);

  const addItem = () =>
    setForm((f) => ({
      ...f,
      items: [...f.items, { component_type: 'OD', base_amount: '', percentage: '', commission_amount: '' }],
    }));

  const updateItem = (idx: number, key: keyof CommissionItemForm, value: string) =>
    setForm((f) => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [key]: value };
      // Auto-calculate commission_amount from base_amount × percentage if both set
      if (key === 'base_amount' || key === 'percentage') {
        const base = parseFloat(key === 'base_amount' ? value : items[idx].base_amount);
        const pct  = parseFloat(key === 'percentage'  ? value : items[idx].percentage);
        if (!isNaN(base) && !isNaN(pct) && pct > 0) {
          items[idx].commission_amount = ((base * pct) / 100).toFixed(2);
        }
      }
      return { ...f, items };
    });

  const removeItem = (idx: number) =>
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  const handleSubmit = async () => {
    const total = parseFloat(form.total_commission_amount);
    if (!form.total_commission_amount || isNaN(total) || total <= 0) {
      toast.error('Total commission amount is required and must be positive');
      return;
    }
    setSaving(true);
    try {
      await subBrokerService.createCommission(brokerId, {
        policy_number:          form.policy_number          || undefined,
        lob_id:                 form.lob_id                 || undefined,
        product_id:             form.product_id             || undefined,
        sub_product_id:         form.sub_product_id         || undefined,
        insurance_company_id:   form.insurance_company_id   || undefined,
        commission_basis:       (form.commission_basis       || undefined) as CommissionBasis | undefined,
        total_commission_amount: total,
        notes:                  form.notes                  || undefined,
        items: form.items.length
          ? form.items.map((item) => ({
              component_type:    item.component_type,
              base_amount:       item.base_amount    ? parseFloat(item.base_amount)    : undefined,
              percentage:        item.percentage     ? parseFloat(item.percentage)     : undefined,
              commission_amount: parseFloat(item.commission_amount),
            }))
          : undefined,
      });
      toast.success('Commission record created');
      onSuccess();
      onClose();
      setForm(emptyForm);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create commission');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Commission Record</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2 max-h-[75vh] overflow-y-auto pr-1">
          {loadingMaster && (
            <p className="text-xs text-muted-foreground">Loading master data…</p>
          )}

          {/* Policy Number */}
          <div className="grid gap-1.5">
            <Label htmlFor="comm_policy_number">Policy Number</Label>
            <Input
              id="comm_policy_number"
              value={form.policy_number}
              onChange={(e) => setForm((f) => ({ ...f, policy_number: e.target.value }))}
              placeholder="e.g. POL-2024-001"
            />
          </div>

          {/* LOB → Product → Sub-Product */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>Line of Business</Label>
              <Select value={form.lob_id} onValueChange={(v) => setForm((f) => ({ ...f, lob_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select LOB" /></SelectTrigger>
                <SelectContent>
                  {lobs.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Product</Label>
              <Select
                value={form.product_id}
                onValueChange={(v) => setForm((f) => ({ ...f, product_id: v }))}
                disabled={!form.lob_id || products.length === 0}
              >
                <SelectTrigger><SelectValue placeholder={form.lob_id ? 'Select product' : 'Pick LOB first'} /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Sub-Product</Label>
              <Select
                value={form.sub_product_id}
                onValueChange={(v) => setForm((f) => ({ ...f, sub_product_id: v }))}
                disabled={!form.product_id || subProducts.length === 0}
              >
                <SelectTrigger><SelectValue placeholder={form.product_id ? 'Select sub-product' : 'Pick product first'} /></SelectTrigger>
                <SelectContent>
                  {subProducts.map((sp) => <SelectItem key={sp.id} value={sp.id}>{sp.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Insurance Company + Commission Basis */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Insurance Company</Label>
              <Select
                value={form.insurance_company_id}
                onValueChange={(v) => setForm((f) => ({ ...f, insurance_company_id: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select insurer" /></SelectTrigger>
                <SelectContent>
                  {insuranceCompanies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Commission Basis</Label>
              <Select
                value={form.commission_basis}
                onValueChange={(v) => setForm((f) => ({ ...f, commission_basis: v as CommissionBasis }))}
              >
                <SelectTrigger><SelectValue placeholder="Select basis" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(COMMISSION_BASIS_LABELS) as CommissionBasis[]).map((b) => (
                    <SelectItem key={b} value={b}>{COMMISSION_BASIS_LABELS[b]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Total Commission Amount */}
          <div className="grid gap-1.5">
            <Label htmlFor="total_comm">
              Total Commission Amount (₹) <span className="text-destructive">*</span>
              {form.items.length > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">(auto-summed from items)</span>
              )}
            </Label>
            <Input
              id="total_comm"
              type="number"
              min="0.01"
              step="0.01"
              value={form.total_commission_amount}
              onChange={(e) => setForm((f) => ({ ...f, total_commission_amount: e.target.value }))}
              placeholder="0.00"
            />
          </div>

          {/* Breakdown Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm">Breakdown Items (optional)</Label>
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={addItem}>
                <Plus className="h-3 w-3" /> Add Item
              </Button>
            </div>
            {form.items.length > 0 && (
              <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
                {form.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_80px_70px_80px_28px] gap-2 items-end">
                    <div className="grid gap-1">
                      {idx === 0 && <span className="text-[10px] text-muted-foreground">Component</span>}
                      <Select
                        value={item.component_type}
                        onValueChange={(v) => updateItem(idx, 'component_type', v as CommissionComponentType)}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(COMPONENT_TYPE_LABELS) as CommissionComponentType[]).map((t) => (
                            <SelectItem key={t} value={t} className="text-xs">{COMPONENT_TYPE_LABELS[t]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1">
                      {idx === 0 && <span className="text-[10px] text-muted-foreground">Base (₹)</span>}
                      <Input className="h-8 text-xs" type="number" placeholder="0"
                        value={item.base_amount}
                        onChange={(e) => updateItem(idx, 'base_amount', e.target.value)} />
                    </div>
                    <div className="grid gap-1">
                      {idx === 0 && <span className="text-[10px] text-muted-foreground">Rate %</span>}
                      <Input className="h-8 text-xs" type="number" placeholder="0"
                        value={item.percentage}
                        onChange={(e) => updateItem(idx, 'percentage', e.target.value)} />
                    </div>
                    <div className="grid gap-1">
                      {idx === 0 && <span className="text-[10px] text-muted-foreground">Comm. (₹)</span>}
                      <Input className="h-8 text-xs" type="number" placeholder="0"
                        value={item.commission_amount}
                        onChange={(e) => updateItem(idx, 'commission_amount', e.target.value)} />
                    </div>
                    <button
                      type="button"
                      className={cn('text-muted-foreground hover:text-destructive transition-colors', idx === 0 ? 'mt-4' : '')}
                      onClick={() => removeItem(idx)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="grid gap-1.5">
            <Label htmlFor="comm_notes">Notes</Label>
            <textarea
              id="comm_notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes…"
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creating…' : 'Create Commission'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Detail Page ─────────────────────────────────────────────────────────

export default function SubBrokerDetailPage() {
  const { id, company_slug } = useParams<{ id: string; company_slug: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [broker, setBroker] = useState<SubBroker | null>(null);
  const [activeTab, setActiveTab] = useState<'wallet' | 'commissions'>('wallet');
  const [loadingBroker, setLoadingBroker] = useState(true);

  // Wallet history
  const [walletHistory, setWalletHistory] = useState<WalletTransaction[]>([]);
  const [walletTotal, setWalletTotal] = useState(0);
  const [walletPage, setWalletPage] = useState(1);
  const [walletPages, setWalletPages] = useState(1);
  const [loadingWallet, setLoadingWallet] = useState(false);

  // Commissions
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [commTotal, setCommTotal] = useState(0);
  const [commPage, setCommPage] = useState(1);
  const [commPages, setCommPages] = useState(1);
  const [commStatusFilter, setCommStatusFilter] = useState<string>('ALL');
  const [loadingComm, setLoadingComm] = useState(false);

  // Modals
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showCommModal, setShowCommModal] = useState(false);
  const [updatingCommId, setUpdatingCommId] = useState<string | null>(null);

  // ─── Loaders ───────────────────────────────────────────────────────────────

  const loadBroker = useCallback(async () => {
    if (!id) return;
    setLoadingBroker(true);
    try {
      const { data } = await subBrokerService.get(id);
      setBroker(data.data.broker);
    } catch {
      toast.error('Failed to load sub-broker');
      navigate(`/${company_slug}/sub-brokers`);
    } finally {
      setLoadingBroker(false);
    }
  }, [id]);

  const loadWalletHistory = useCallback(async () => {
    if (!id) return;
    setLoadingWallet(true);
    try {
      const { data } = await subBrokerService.getWalletHistory(id, { page: walletPage, limit: 15 });
      const payload = data.data;
      setWalletHistory(payload.transactions ?? []);
      setWalletTotal(payload.total ?? 0);
      setWalletPages(payload.pages ?? 1);
    } catch {
      toast.error('Failed to load wallet history');
    } finally {
      setLoadingWallet(false);
    }
  }, [id, walletPage]);

  const loadCommissions = useCallback(async () => {
    if (!id) return;
    setLoadingComm(true);
    try {
      const params: Record<string, string | number> = { page: commPage, limit: 15 };
      if (commStatusFilter !== 'ALL') params.status = commStatusFilter;
      const { data } = await subBrokerService.getCommissions(id, params as any);
      const payload = data.data;
      setCommissions(payload.commissions ?? []);
      setCommTotal(payload.total ?? 0);
      setCommPages(payload.pages ?? 1);
    } catch {
      toast.error('Failed to load commissions');
    } finally {
      setLoadingComm(false);
    }
  }, [id, commPage, commStatusFilter]);

  useEffect(() => { loadBroker(); }, [loadBroker]);
  useEffect(() => { loadWalletHistory(); }, [loadWalletHistory]);
  useEffect(() => { loadCommissions(); }, [loadCommissions]);

  const handleUpdateCommissionStatus = async (commissionId: string, status: 'PAID' | 'CANCELLED') => {
    if (!id) return;
    setUpdatingCommId(commissionId);
    try {
      await subBrokerService.updateCommissionStatus(id, commissionId, { status });
      toast.success(`Commission marked as ${status}`);
      loadCommissions();
      loadBroker(); // refresh wallet balance if PAID
      loadWalletHistory();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdatingCommId(null);
    }
  };

  // ─── Loading State ─────────────────────────────────────────────────────────

  if (loadingBroker) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-24 mt-1" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-5">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-7 w-28" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!broker) return null;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* Back + Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 mb-4 -ml-1 text-muted-foreground"
          onClick={() => navigate(`/${company_slug}/sub-brokers`)}
        >
          <ArrowLeft className="h-4 w-4" /> Back to Sub-Brokers
        </Button>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-xl shrink-0">
              {broker.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{broker.full_name}</h1>
                <Badge variant={broker.status === 'ACTIVE' ? 'default' : 'secondary'}>
                  {broker.status}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-0.5">
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{broker.broker_code}</code>
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() =>
                navigate(`/${company_slug}/sub-brokers`, { state: { editId: broker.id } })
              }
            >
              <Edit className="h-4 w-4" /> Edit Profile
            </Button>
            <Button size="sm" className="gap-2" onClick={() => setShowWalletModal(true)}>
              <Wallet className="h-4 w-4" /> Adjust Wallet
            </Button>
          </div>
        </div>
      </div>

      {/* Info Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="rounded-lg p-2 bg-violet-100 dark:bg-violet-900/20">
            <Wallet className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Wallet Balance</p>
            <p className="text-lg font-bold tabular-nums">{fmt(broker.wallet_balance)}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="rounded-lg p-2 bg-blue-100 dark:bg-blue-900/20">
            <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Customers Referred</p>
            <p className="text-lg font-bold">{broker._count?.customers ?? 0}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="rounded-lg p-2 bg-amber-100 dark:bg-amber-900/20">
            <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Commissions</p>
            <p className="text-lg font-bold">{broker._count?.commissions ?? 0}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <div className="rounded-lg p-2 bg-green-100 dark:bg-green-900/20">
            <FileText className="h-4 w-4 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Transactions</p>
            <p className="text-lg font-bold">{broker._count?.wallet_transactions ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Profile Details */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">
          Contact & Profile
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="text-sm font-medium">{broker.phone}</p>
            </div>
          </div>
          {broker.email && (
            <div className="flex items-start gap-3">
              <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium">{broker.email}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs: Wallet History + Commissions */}
      <div>
        <div className="flex gap-0 border-b">
          <button
            onClick={() => setActiveTab('wallet')}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === 'wallet'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Wallet History
            {walletTotal > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs px-1.5 py-0">
                {walletTotal}
              </Badge>
            )}
          </button>
          <button
            onClick={() => setActiveTab('commissions')}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === 'commissions'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            Commissions
            {commTotal > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs px-1.5 py-0">
                {commTotal}
              </Badge>
            )}
          </button>
        </div>

        {/* ─── Wallet History Tab ──────────────────────────────────────────── */}
        {activeTab === 'wallet' && <div className="mt-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              All wallet transactions — oldest first, newest last
            </h3>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setShowWalletModal(true)}>
              <Plus className="h-4 w-4" /> Adjust Wallet
            </Button>
          </div>
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Balance After</TableHead>
                  <TableHead className="hidden lg:table-cell">Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingWallet ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {[1, 2, 3, 4, 5, 6].map((j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : walletHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No wallet transactions yet
                    </TableCell>
                  </TableRow>
                ) : (
                  walletHistory.map((tx) => (
                    <motion.tr
                      key={tx.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b last:border-0"
                    >
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(tx.created_at)}
                      </TableCell>
                      <TableCell>
                        <div
                          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                            tx.type === 'CREDIT'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}
                        >
                          {tx.type === 'CREDIT' ? (
                            <ArrowUpCircle className="h-3 w-3" />
                          ) : (
                            <ArrowDownCircle className="h-3 w-3" />
                          )}
                          {tx.type}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{REASON_LABELS[tx.reason] ?? tx.reason}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        <span
                          className={
                            tx.type === 'CREDIT' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          }
                        >
                          {tx.type === 'CREDIT' ? '+' : '−'}
                          {fmt(tx.amount)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums hidden md:table-cell text-muted-foreground text-sm">
                        {fmt(tx.balance_after)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden lg:table-cell max-w-[200px] truncate">
                        {tx.note ?? '—'}
                      </TableCell>
                    </motion.tr>
                  ))
                )}
              </TableBody>
            </Table>
            {/* Wallet Pagination */}
            {!loadingWallet && walletTotal > 15 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-sm text-muted-foreground">
                  {(walletPage - 1) * 15 + 1}–{Math.min(walletPage * 15, walletTotal)} of {walletTotal}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={walletPage <= 1}
                    onClick={() => setWalletPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={walletPage >= walletPages}
                    onClick={() => setWalletPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>}

        {/* ─── Commissions Tab ─────────────────────────────────────────────── */}
        {activeTab === 'commissions' && <div className="mt-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
            <Select
              value={commStatusFilter}
              onValueChange={(v) => { setCommStatusFilter(v); setCommPage(1); }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="gap-2" onClick={() => setShowCommModal(true)}>
              <Plus className="h-4 w-4" /> Add Commission
            </Button>
          </div>
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>LOB / Policy</TableHead>
                  <TableHead className="hidden md:table-cell">Product</TableHead>
                  <TableHead className="hidden md:table-cell">Insurer</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Date</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingComm ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : commissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      No commission records yet
                    </TableCell>
                  </TableRow>
                ) : (
                  commissions.map((c) => (
                    <motion.tr
                      key={c.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-b last:border-0"
                    >
                      {/* LOB + policy number */}
                      <TableCell>
                        <div className="font-medium text-sm">
                          {c.lob?.name ?? <span className="text-muted-foreground">—</span>}
                        </div>
                        {c.policy_number && (
                          <div className="text-xs text-muted-foreground">{c.policy_number}</div>
                        )}
                      </TableCell>
                      {/* Product */}
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {c.product?.name ?? '—'}
                        {c.sub_product?.name && (
                          <div className="text-xs">{c.sub_product.name}</div>
                        )}
                      </TableCell>
                      {/* Insurer */}
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {c.insurance_company?.name ?? '—'}
                      </TableCell>
                      {/* Commission amount */}
                      <TableCell className="text-right font-medium tabular-nums">
                        {fmt(c.total_commission_amount)}
                      </TableCell>
                      {/* Wallet credited */}
                      <TableCell>
                        {c.is_wallet_credited ? (
                          <Badge variant="secondary" className="text-xs">Credited</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                            STATUS_COLORS[c.status] ?? ''
                          }`}
                        >
                          {c.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap">
                        {fmtDate(c.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.status === 'PENDING' && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-100"
                              title="Mark as Paid"
                              disabled={updatingCommId === c.id}
                              onClick={() => handleUpdateCommissionStatus(c.id, 'PAID')}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-100"
                              title="Cancel"
                              disabled={updatingCommId === c.id}
                              onClick={() => handleUpdateCommissionStatus(c.id, 'CANCELLED')}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        {c.status !== 'PENDING' && (
                          <Clock className="h-4 w-4 text-muted-foreground ml-auto" />
                        )}
                      </TableCell>
                    </motion.tr>
                  ))
                )}
              </TableBody>
            </Table>
            {/* Commission Pagination */}
            {!loadingComm && commTotal > 15 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-sm text-muted-foreground">
                  {(commPage - 1) * 15 + 1}–{Math.min(commPage * 15, commTotal)} of {commTotal}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={commPage <= 1}
                    onClick={() => setCommPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={commPage >= commPages}
                    onClick={() => setCommPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>}
      </div>

      {/* Wallet Adjust Modal */}
      <WalletAdjustModal
        brokerId={id!}
        open={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onSuccess={() => {
          loadBroker();
          loadWalletHistory();
        }}
      />

      {/* Add Commission Modal */}
      <AddCommissionModal
        brokerId={id!}
        open={showCommModal}
        onClose={() => setShowCommModal(false)}
        onSuccess={() => {
          loadBroker();
          loadCommissions();
        }}
      />
    </div>
  );
}
