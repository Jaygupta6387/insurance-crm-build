import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FileText, Plus, Search, Filter, RefreshCw, Car,
  ChevronLeft, ChevronRight, Loader2, Eye, Edit, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Header from '@/components/layout/Header';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { policyService } from '@/services/policyService';
import { usePolicyPermissions } from '@/hooks/usePolicyPermissions';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toaster';

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300',
  DRAFT: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300',
  EXPIRED: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300',
  CANCELLED: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400',
};

interface PolicyRow {
  id: string;
  policy_number: string | null;
  status: string;
  premium_amount: string | number | null;
  start_date: string | null;
  end_date: string | null;
  customer?: { customer_name: string; customer_phone: string } | null;
  lob?: { name: string } | null;
  product?: { name: string } | null;
  insurance_company?: { name: string } | null;
}

const inr = (v: string | number | null | undefined) => (Number(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function PolicyListPage() {
  const { company_slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const toast = useToast();
  const { canEditDirect, canDeleteDirect } = usePolicyPermissions();

  const isAdmin = user?.role === 'ADMIN';
  const canCreate = isAdmin || !!user?.permissions?.can_create_policy;

  const [deleteTarget, setDeleteTarget] = useState<PolicyRow | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatus] = useState('');
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    policyService
      .list({ search: search || undefined, status: statusFilter || undefined, page, limit: 20 })
      .then((r) => {
        setPolicies(r.data.data.policies || []);
        setTotal(r.data.data.pagination?.total || 0);
        setTotalPages(r.data.data.pagination?.total_pages || 1);
      })
      .finally(() => setLoading(false));
  }, [search, statusFilter, page]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const handleEdit = (p: PolicyRow) => {
    if (canEditDirect) {
      navigate(`/${company_slug}/policies/${p.id}/edit`);
    } else {
      navigate(`/${company_slug}/policies/${p.id}/edit?request=1`);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (canDeleteDirect) {
        await policyService.delete(deleteTarget.id);
        toast.success('Policy deleted successfully');
        setDeleteTarget(null);
        load();
      } else {
        await policyService.createChangeRequest(deleteTarget.id, {
          request_type: 'DELETE',
          reason: deleteReason.trim() || undefined,
        });
        toast.success('Delete request submitted for admin approval');
        setDeleteTarget(null);
      }
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Operation failed';
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Header title="Policies" subtitle="Manage all insurance policies">
        {canCreate && (
          <Button
            onClick={() => navigate(`/${company_slug}/policies/create`)}
            className="gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md transition-all hover:brightness-110"
          >
            <Plus className="h-4 w-4" /> New Policy
          </Button>
        )}
      </Header>

      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Search by policy no, customer…" className="h-10 rounded-xl pl-9" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select value={statusFilter} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className="h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Draft</option>
              <option value="EXPIRED">Expired</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            {(search || statusFilter) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatus(''); setPage(1); }} className="rounded-xl text-xs">Clear</Button>
            )}
            <Button variant="outline" size="icon" onClick={load} className="h-10 w-10 rounded-xl">
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  {['Policy No', 'Customer', 'LOB / Product', 'Insurer', 'Premium', 'Start', 'Expiry', 'Status', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="py-20 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></td></tr>
                ) : policies.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-600/10">
                          <FileText className="h-8 w-8 text-blue-500/50" />
                        </div>
                        <p className="text-base font-semibold text-muted-foreground">No policies found</p>
                        {canCreate && (
                          <Button onClick={() => navigate(`/${company_slug}/policies/create`)} className="mt-2 gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow hover:brightness-110">
                            <Plus className="h-4 w-4" /> Create First Policy
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  policies.map((p) => (
                    <tr key={p.id} className="border-b border-border/40 transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-foreground">{p.policy_number || '—'}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{p.customer?.customer_name || '—'}</p>
                        <p className="text-xs text-muted-foreground">{p.customer?.customer_phone}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-foreground"><Car className="h-3.5 w-3.5 text-blue-500" /> {p.product?.name || p.lob?.name || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.insurance_company?.name || '—'}</td>
                      <td className="px-4 py-3 font-medium text-foreground">₹{inr(p.premium_amount)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(p.start_date)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(p.end_date)}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', STATUS_STYLES[p.status] || STATUS_STYLES.CANCELLED)}>{p.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => navigate(`/${company_slug}/policies/${p.id}`)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="View">
                            <Eye className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleEdit(p)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-blue-600" title={canEditDirect ? 'Edit' : 'Request Edit'}>
                            <Edit className="h-4 w-4" />
                          </button>
                          <button onClick={() => { setDeleteTarget(p); setDeleteReason(''); }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600" title={canDeleteDirect ? 'Delete' : 'Request Delete'}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border/60 px-4 py-3">
              <p className="text-xs text-muted-foreground">{total} policies</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-8 w-8 rounded-lg"><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
                <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-8 w-8 rounded-lg"><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{canDeleteDirect ? 'Delete Policy' : 'Request Policy Deletion'}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Policy <strong>{deleteTarget?.policy_number}</strong>
            {canDeleteDirect
              ? ' will be permanently deleted along with all related data.'
              : ' — your request will be sent to an admin for approval.'}
          </p>
          {!canDeleteDirect && (
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Reason for deletion (optional)"
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : canDeleteDirect ? 'Delete' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
