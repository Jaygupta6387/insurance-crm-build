import { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import { Percent, Plus, Loader2, Pencil, Trash2, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/layout/Header';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';
import { masterDataService } from '@/services/subBrokerService';
import { motorGstService, type GstRate, type GstRatePayload } from '@/services/motorConfigService';

const LOB_CONFIG: Record<string, { label: string; subtitle: string; match: RegExp; showOdTp: boolean }> = {
  motor: {
    label: 'Motor GST',
    subtitle: 'GST on OD and TP per product',
    match: /motor/i,
    showOdTp: true,
  },
  health: {
    label: 'Health GST',
    subtitle: 'Single GST rate on health premium per product',
    match: /health/i,
    showOdTp: false,
  },
  life: {
    label: 'Life GST',
    subtitle: 'Single GST rate on life premium per product',
    match: /life/i,
    showOdTp: false,
  },
  sme: {
    label: 'SME GST',
    subtitle: 'Single GST rate on SME premium per product',
    match: /sme/i,
    showOdTp: false,
  },
};

const inputCls = 'h-10 w-full rounded-xl border border-border/70 bg-background px-3 text-sm outline-none focus:border-primary/60';
const pct = (v: string | number | null | undefined) => (v == null || v === '' ? '—' : `${Number(v)}%`);

export default function LobGstPage() {
  const { lobKey = 'motor' } = useParams<{ lobKey: string }>();
  const config = LOB_CONFIG[lobKey] || LOB_CONFIG.motor;
  const toast = useToast();

  const [gstRates, setGstRates] = useState<GstRate[]>([]);
  const [lobs, setLobs] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<GstRate | null>(null);

  const lobId = useMemo(() => lobs.find((l) => config.match.test(l.name))?.id, [lobs, config.match]);

  const filteredRates = useMemo(() => {
    if (!lobId) return gstRates.filter((g) => !g.lob_id || config.match.test(g.lob?.name || ''));
    return gstRates.filter((g) => g.lob_id === lobId || (!g.lob_id && !config.showOdTp));
  }, [gstRates, lobId, config]);

  const load = useCallback(() => {
    setLoading(true);
    motorGstService.list()
      .then((r) => setGstRates(r.data.data.gst_rates || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    masterDataService.getLobs({ is_active: true }).then((r) => setLobs(r.data.data.lobs || []));
    masterDataService.getProducts({ is_active: true }).then((r) => setProducts(r.data.data.products || []));
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm('Delete this GST rule?')) return;
    try {
      await motorGstService.delete(id);
      toast.success('GST rule deleted');
      load();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const headers = config.showOdTp
    ? ['Product', 'GST on OD', 'GST on TP', 'GST (single)', '']
    : ['Product', 'GST %', ''];

  return (
    <div className="flex h-full flex-col">
      <Header title={config.label} subtitle={config.subtitle}>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2 rounded-xl">
          <Plus className="h-4 w-4" /> Add GST Rule
        </Button>
      </Header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  {headers.map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={headers.length} className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></td></tr>
                ) : filteredRates.length === 0 ? (
                  <tr><td colSpan={headers.length} className="py-16 text-center text-sm text-muted-foreground">No GST rules configured for {config.label.replace(' GST', '')}.</td></tr>
                ) : (
                  filteredRates.map((g) => (
                    <tr key={g.id} className="border-b border-border/40 hover:bg-muted/30">
                      <td className="px-4 py-3 text-muted-foreground">{g.product?.name || 'Default (all)'}</td>
                      {config.showOdTp ? (
                        <>
                          <td className="px-4 py-3 font-medium text-foreground">{pct(g.gst_on_od_percent)}</td>
                          <td className="px-4 py-3 font-medium text-foreground">{pct(g.gst_on_tp_percent)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{pct(g.gst_percent)}</td>
                        </>
                      ) : (
                        <td className="px-4 py-3 font-medium text-foreground">{pct(g.gst_percent)}</td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => { setEditing(g); setModalOpen(true); }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => remove(g.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
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
        <GstModal
          gst={editing}
          lobId={lobId}
          showOdTp={config.showOdTp}
          products={products}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={() => { setModalOpen(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function GstModal({ gst, lobId, showOdTp, products, onClose, onSaved }: {
  gst: GstRate | null;
  lobId?: string;
  showOdTp: boolean;
  products: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<GstRatePayload>({
    lob_id: gst?.lob_id || lobId || '',
    product_id: gst?.product_id || '',
    gst_on_od_percent: gst?.gst_on_od_percent != null ? Number(gst.gst_on_od_percent) : 18,
    gst_on_tp_percent: gst?.gst_on_tp_percent != null ? Number(gst.gst_on_tp_percent) : 18,
    gst_percent: gst?.gst_percent != null ? Number(gst.gst_percent) : (showOdTp ? null : 18),
    apply_to_all_products: false,
  });
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<GstRatePayload>) => setForm((f) => ({ ...f, ...p }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        lob_id: form.lob_id || lobId || null,
        product_id: form.product_id || null,
      };
      if (gst) await motorGstService.update(gst.id, payload);
      else await motorGstService.create(payload);
      toast.success(gst ? 'GST rule updated' : 'GST rule saved');
      onSaved();
    } catch {
      toast.error('Failed to save GST rule');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary"><Percent className="h-4 w-4" /></div>
            <h3 className="text-base font-bold text-foreground">{gst ? 'Edit' : 'Add'} GST Rule</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-foreground/80">Product (optional)</label>
            <select value={form.product_id || ''} onChange={(e) => set({ product_id: e.target.value })} disabled={form.apply_to_all_products} className={cn(inputCls, 'mt-1.5', form.apply_to_all_products && 'opacity-50')}>
              <option value="">Default (all products)</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {showOdTp ? (
            <>
              <div>
                <label className="text-xs font-semibold text-foreground/80">GST on OD %</label>
                <input type="number" step="0.01" value={form.gst_on_od_percent ?? ''} onChange={(e) => set({ gst_on_od_percent: e.target.value === '' ? null : Number(e.target.value) })} className={cn(inputCls, 'mt-1.5')} />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground/80">GST on TP %</label>
                <input type="number" step="0.01" value={form.gst_on_tp_percent ?? ''} onChange={(e) => set({ gst_on_tp_percent: e.target.value === '' ? null : Number(e.target.value) })} className={cn(inputCls, 'mt-1.5')} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-foreground/80">Single GST % (optional)</label>
                <input type="number" step="0.01" value={form.gst_percent ?? ''} onChange={(e) => set({ gst_percent: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Leave blank for motor split" className={cn(inputCls, 'mt-1.5')} />
              </div>
            </>
          ) : (
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-foreground/80">GST %</label>
              <input type="number" step="0.01" value={form.gst_percent ?? ''} onChange={(e) => set({ gst_percent: e.target.value === '' ? null : Number(e.target.value) })} className={cn(inputCls, 'mt-1.5')} />
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={!!form.apply_to_all_products} onChange={(e) => set({ apply_to_all_products: e.target.checked })} className="h-4 w-4 rounded border-border" />
              Apply to all products of this LOB
            </label>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
