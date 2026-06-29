import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calculator, Plus, Loader2, Pencil, Trash2, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/layout/Header';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';
import { masterDataService } from '@/services/subBrokerService';
import { premiumRateService, type MotorPremiumRate, type PremiumRatePayload } from '@/services/motorConfigService';
import { CC_BRACKET_LABELS, AGE_BRACKET_LABELS, ZONE_LABELS } from '@/constants/motor';

const ZONES = ['A', 'B'] as const;
const CC_BRACKETS = ['lte1000', '1000to1500', 'gt1500'] as const;
const AGE_BRACKETS = ['lte5', '5to10', 'gt10'] as const;

const inputCls = 'h-10 w-full rounded-xl border border-border/70 bg-background px-3 text-sm outline-none focus:border-primary/60';
const inr = (v: string | number) => (Number(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const DUPLICATE_RATE_MSG =
  'A premium rate already exists for this product, sub-product, zone, CC bracket and vehicle age';

function isDuplicatePremiumRate(
  existing: MotorPremiumRate[],
  form: PremiumRatePayload,
  excludeId?: string,
) {
  return existing.some(
    (r) =>
      r.id !== excludeId &&
      r.product_id === form.product_id &&
      r.sub_product_id === form.sub_product_id &&
      r.zone === form.zone &&
      r.cc_bracket === form.cc_bracket &&
      r.age_bracket === form.age_bracket,
  );
}

export default function MotorPremiumRatesPage() {
  const toast = useToast();
  const [rates, setRates] = useState<MotorPremiumRate[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MotorPremiumRate | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    premiumRateService.list()
      .then((r) => setRates(r.data.data.premium_rates || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    masterDataService.getProducts({ is_active: true }).then((r) => setProducts(r.data.data.products || []));
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm('Delete this premium rate?')) return;
    try {
      await premiumRateService.delete(id);
      toast.success('Premium rate deleted');
      load();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="flex h-full flex-col">
      <Header title="Motor Premium Rates" subtitle="Product + sub-product OD rate % and fixed TP premium">
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2 rounded-xl">
          <Plus className="h-4 w-4" /> Add Rate
        </Button>
      </Header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  {['Product', 'Sub-Product', 'Zone', 'CC Bracket', 'Vehicle Age', 'OD Rate %', 'TP Premium', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></td></tr>
                ) : rates.length === 0 ? (
                  <tr><td colSpan={8} className="py-16 text-center text-sm text-muted-foreground">No premium rates configured.</td></tr>
                ) : (
                  rates.map((r) => (
                    <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30">
                      <td className="px-4 py-3 text-foreground">{r.product?.name || '—'}</td>
                      <td className="px-4 py-3 text-foreground">{r.sub_product?.name || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{ZONE_LABELS[r.zone]}</td>
                      <td className="px-4 py-3 text-muted-foreground">{CC_BRACKET_LABELS[r.cc_bracket as keyof typeof CC_BRACKET_LABELS] || r.cc_bracket}</td>
                      <td className="px-4 py-3 text-muted-foreground">{AGE_BRACKET_LABELS[r.age_bracket as keyof typeof AGE_BRACKET_LABELS] || r.age_bracket}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{r.od_rate_percent}%</td>
                      <td className="px-4 py-3 font-medium text-foreground">₹{inr(r.tp_premium)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setEditing(r); setModalOpen(true); }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => remove(r.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modalOpen && (
        <RateModal
          rate={editing}
          products={products}
          existingRates={rates}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={() => { setModalOpen(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function RateModal({ rate, products, existingRates, onClose, onSaved }: {
  rate: MotorPremiumRate | null;
  products: { id: string; name: string }[];
  existingRates: MotorPremiumRate[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<PremiumRatePayload>({
    product_id: rate?.product_id || '',
    sub_product_id: rate?.sub_product_id || '',
    zone: rate?.zone || 'A',
    cc_bracket: rate?.cc_bracket || 'lte1000',
    age_bracket: rate?.age_bracket || 'lte5',
    od_rate_percent: rate ? Number(rate.od_rate_percent) : 0,
    tp_premium: rate ? Number(rate.tp_premium) : 0,
  });
  const [subProducts, setSubProducts] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [productError, setProductError] = useState('');
  const [subProductError, setSubProductError] = useState('');
  const [duplicateError, setDuplicateError] = useState('');
  const set = (p: Partial<PremiumRatePayload>) => setForm((f) => ({ ...f, ...p }));

  useEffect(() => {
    if (!form.product_id) {
      setSubProducts([]);
      return;
    }
    masterDataService.getSubProducts({ product_id: form.product_id, is_active: true })
      .then((r) => setSubProducts(r.data.data.sub_products || []));
  }, [form.product_id]);

  const save = async () => {
    let valid = true;
    if (!form.product_id?.trim()) {
      setProductError('Product is required');
      valid = false;
    } else setProductError('');
    if (!form.sub_product_id?.trim()) {
      setSubProductError('Sub-product is required');
      valid = false;
    } else setSubProductError('');
    if (!valid) return;

    const payload = {
      ...form,
      product_id: form.product_id.trim(),
      sub_product_id: form.sub_product_id.trim(),
    };

    if (isDuplicatePremiumRate(existingRates, payload, rate?.id)) {
      setDuplicateError(DUPLICATE_RATE_MSG);
      return;
    }
    setDuplicateError('');

    setSaving(true);
    try {
      if (rate) await premiumRateService.update(rate.id, payload);
      else await premiumRateService.create(payload);
      toast.success(rate ? 'Rate updated' : 'Rate created');
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string }; status?: number } })?.response?.data?.message;
      if ((err as { response?: { status?: number } })?.response?.status === 409 || msg?.includes('already exists')) {
        setDuplicateError(msg || DUPLICATE_RATE_MSG);
      } else {
        toast.error(msg || 'Failed to save rate');
      }
    } finally { setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary"><Calculator className="h-4 w-4" /></div>
            <h3 className="text-base font-bold text-foreground">{rate ? 'Edit' : 'Add'} Premium Rate</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-foreground/80">Product <span className="text-destructive">*</span></label>
            <select
              value={form.product_id || ''}
              onChange={(e) => {
                set({ product_id: e.target.value, sub_product_id: '' });
                setProductError('');
                setSubProductError('');
                setDuplicateError('');
              }}
              className={cn(inputCls, 'mt-1.5', productError && 'border-destructive')}
            >
              <option value="">Select product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {productError && <p className="mt-1 text-xs text-destructive">{productError}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-foreground/80">Sub-Product <span className="text-destructive">*</span></label>
            <select
              value={form.sub_product_id || ''}
              onChange={(e) => { set({ sub_product_id: e.target.value }); setSubProductError(''); setDuplicateError(''); }}
              disabled={!form.product_id}
              className={cn(inputCls, 'mt-1.5', subProductError && 'border-destructive', !form.product_id && 'opacity-60')}
            >
              <option value="">{form.product_id ? 'Select sub-product…' : 'Select a product first'}</option>
              {subProducts.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
            </select>
            {subProductError && <p className="mt-1 text-xs text-destructive">{subProductError}</p>}
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground/80">Zone</label>
            <select value={form.zone} onChange={(e) => { set({ zone: e.target.value as 'A' | 'B' }); setDuplicateError(''); }} className={cn(inputCls, 'mt-1.5')}>
              {ZONES.map((z) => <option key={z} value={z}>{ZONE_LABELS[z]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground/80">CC Bracket</label>
            <select value={form.cc_bracket} onChange={(e) => { set({ cc_bracket: e.target.value }); setDuplicateError(''); }} className={cn(inputCls, 'mt-1.5')}>
              {CC_BRACKETS.map((c) => <option key={c} value={c}>{CC_BRACKET_LABELS[c]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground/80">Vehicle Age</label>
            <select value={form.age_bracket} onChange={(e) => { set({ age_bracket: e.target.value }); setDuplicateError(''); }} className={cn(inputCls, 'mt-1.5')}>
              {AGE_BRACKETS.map((a) => <option key={a} value={a}>{AGE_BRACKET_LABELS[a]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground/80">OD Rate %</label>
            <input type="number" step="0.001" value={form.od_rate_percent} onChange={(e) => set({ od_rate_percent: Number(e.target.value) })} className={cn(inputCls, 'mt-1.5')} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-foreground/80">TP Premium (₹)</label>
            <input type="number" value={form.tp_premium} onChange={(e) => set({ tp_premium: Number(e.target.value) })} className={cn(inputCls, 'mt-1.5')} />
          </div>
          {duplicateError && (
            <p className="sm:col-span-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {duplicateError}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-4">
          <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
