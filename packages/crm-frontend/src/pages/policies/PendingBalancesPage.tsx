import { useEffect, useState, useCallback } from 'react';
import { Wallet, Search, Loader2, IndianRupee, Phone, ReceiptText, Settings2, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Header from '@/components/layout/Header';
import { cn } from '@/lib/utils';
import { customerWalletService, type PendingBalance } from '@/services/customerWalletService';
import { customerService } from '@/services/customerService';
import CustomerWalletManageModal from '@/components/customers/CustomerWalletManageModal';

const inr = (v: string | number | null | undefined) => (Number(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function PendingBalancesPage() {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<PendingBalance[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PendingBalance | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Add-pending: search any customer
  const [addSearch, setAddSearch] = useState('');
  const [addResults, setAddResults] = useState<PendingBalance[]>([]);
  const [addSearching, setAddSearching] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    customerWalletService
      .getPending({ search: search || undefined, limit: 50 })
      .then((r) => {
        setRows(r.data.data.pending || []);
        setTotalPending(Number(r.data.data.total_pending) || 0);
      })
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!showAddPanel) return;
    const q = addSearch.trim();
    if (q.length < 2) {
      setAddResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setAddSearching(true);
      try {
        const res = await customerService.list({ search: q, limit: 8 });
        const customers = res.data.data.customers || [];
        setAddResults(
          customers.map((c: { id: string; customer_name: string; customer_phone: string; customer_email?: string; wallet_balance?: number }) => ({
            id: c.id,
            customer_name: c.customer_name,
            customer_phone: c.customer_phone,
            customer_email: c.customer_email,
            pending_amount: c.wallet_balance ?? 0,
          })),
        );
      } catch {
        setAddResults([]);
      } finally {
        setAddSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [addSearch, showAddPanel]);

  const openManage = (row: PendingBalance) => {
    setSelected(row);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setSelected(null);
  };

  return (
    <div className="flex h-full flex-col">
      <Header title="Pending Balances" subtitle="Manage customer wallet — add pending or settle with remarks" />

      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        {/* Summary */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5 shadow-sm dark:border-amber-900 dark:from-amber-950/30 dark:to-orange-950/30">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white">
              <IndianRupee className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold text-foreground">₹{inr(totalPending)}</p>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">Total Outstanding</p>
          </div>
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
              <Wallet className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold text-foreground">{rows.length}</p>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">Customers with Dues</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or phone…"
              className="h-10 rounded-xl pl-9"
            />
          </div>
          <Button
            variant={showAddPanel ? 'secondary' : 'outline'}
            className="h-10 gap-2 rounded-xl"
            onClick={() => setShowAddPanel((v) => !v)}
          >
            <Plus className="h-4 w-4" />
            Add / Settle for customer
          </Button>
        </div>

        {/* Quick customer picker */}
        {showAddPanel && (
          <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-foreground">Find any customer to manage wallet</p>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                placeholder="Search customer by name or phone…"
                className="h-10 rounded-xl pl-9"
                autoFocus
              />
            </div>
            {addSearching && (
              <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </div>
            )}
            {!addSearching && addResults.length > 0 && (
              <ul className="mt-3 divide-y divide-border/40 rounded-xl border border-border/60">
                {addResults.map((c) => (
                  <li
                    key={c.id}
                    className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                    onClick={() => openManage(c)}
                  >
                    <div>
                      <p className="font-medium text-foreground">{c.customer_name}</p>
                      <p className="text-xs text-muted-foreground">{c.customer_phone}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Pending</p>
                      <p className={cn('font-semibold', Number(c.pending_amount) > 0 ? 'text-amber-600' : 'text-muted-foreground')}>
                        ₹{inr(c.pending_amount)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  {['Customer', 'Phone', 'Last Policy', 'Last Activity', 'Pending Amount', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="py-20 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></td></tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
                          <ReceiptText className="h-8 w-8 text-emerald-500/60" />
                        </div>
                        <p className="text-base font-semibold text-muted-foreground">No pending balances</p>
                        <p className="max-w-xs text-sm text-muted-foreground/60">All customers are fully settled.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/40 transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">{r.customer_name}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {r.customer_phone}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.last_transaction?.policy_number || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.last_transaction?.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className={cn('font-bold', Number(r.pending_amount) > 0 ? 'text-amber-600' : 'text-foreground')}>₹{inr(r.pending_amount)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 rounded-lg"
                          onClick={() => openManage(r)}
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                          Manage
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <CustomerWalletManageModal
        customer={selected}
        open={modalOpen}
        onClose={handleModalClose}
        onSuccess={load}
      />
    </div>
  );
}
