import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  TrendingUp, Plus, Search, RefreshCw, MoreHorizontal,
  Pencil, Trash2, ArrowRightCircle, Phone, Mail,
  Filter, ChevronLeft, ChevronRight, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import Header from '@/components/layout/Header';
import { leadService } from '@/services/leadService';
import type { Lead } from '@/services/leadService';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';

// ── Status badge styling ───────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  NEW:       'bg-blue-50   text-blue-700   border-blue-200',
  HOT:       'bg-red-50    text-red-700    border-red-200',
  WARM:      'bg-orange-50 text-orange-700 border-orange-200',
  COLD:      'bg-sky-50    text-sky-700    border-sky-200',
  CONVERTED: 'bg-green-50  text-green-700  border-green-200',
  LOST:      'bg-gray-50   text-gray-600   border-gray-200',
};

const STATUS_LABELS: Record<string, string> = {
  NEW: 'New', HOT: 'Hot', WARM: 'Warm', COLD: 'Cold', CONVERTED: 'Converted', LOST: 'Lost',
};

// ── Action dropdown ────────────────────────────────────────────────────────────
function ActionsMenu({
  lead, onEdit, onDelete, onConvert, canEdit, canDelete,
}: {
  lead: Lead;
  onEdit: () => void;
  onDelete: () => void;
  onConvert: () => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setOpen(o => !o)}>
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-44 rounded-xl border bg-popover shadow-xl py-1 overflow-hidden">
            {canEdit && (
              <button className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors"
                onClick={() => { setOpen(false); onEdit(); }}>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" /> Edit Lead
              </button>
            )}
            {canEdit && lead.status !== 'CONVERTED' && (
              <button className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-emerald-600"
                onClick={() => { setOpen(false); onConvert(); }}>
                <ArrowRightCircle className="h-3.5 w-3.5" /> Convert to Customer
              </button>
            )}
            {canDelete && (
              <button className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-destructive"
                onClick={() => { setOpen(false); onDelete(); }}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function LeadListPage() {
  const { company_slug } = useParams();
  const navigate  = useNavigate();
  const toast     = useToast();
  const { user }  = useAuthStore();

  const isAdmin   = user?.role === 'ADMIN';
  const canCreate = isAdmin || !!user?.permissions?.can_create_customer;
  const canEdit   = isAdmin || !!user?.permissions?.can_edit_customer;
  const canDelete = isAdmin || !!user?.permissions?.can_delete_customer;

  const [leads,      setLeads]      = useState<Lead[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, total_pages: 1 });
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [converting, setConverting] = useState<string | null>(null);

  const fetchLeads = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: 20 };
      if (search)       params.search = search;
      if (statusFilter) params.status = statusFilter;
      const r = await leadService.list(params);
      setLeads(r.data.data.leads || []);
      setPagination(r.data.data.pagination);
    } catch {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { fetchLeads(1); }, [fetchLeads]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this lead? This action cannot be undone.')) return;
    try {
      await leadService.delete(id);
      toast.success('Lead deleted');
      fetchLeads(pagination.page);
    } catch {
      toast.error('Failed to delete lead');
    }
  };

  const handleConvert = async (lead: Lead) => {
    if (!confirm(`Convert "${lead.lead_name}" to a customer? The lead will be marked as Converted.`)) return;
    setConverting(lead.id);
    try {
      const r = await leadService.convert(lead.id);
      const prefill = r.data.data.customerPrefill;
      toast.success('Lead converted! Redirecting to create customer…');
      navigate(`/${company_slug}/customers/create`, { state: { fromLead: prefill } });
    } catch {
      toast.error('Failed to convert lead');
    } finally {
      setConverting(null);
    }
  };

  // Stats
  const total     = pagination.total;
  const hot       = leads.filter(l => l.status === 'HOT').length;
  const warm      = leads.filter(l => l.status === 'WARM').length;
  const converted = leads.filter(l => l.status === 'CONVERTED').length;

  return (
    <div className="flex h-full flex-col">
      <Header title="Leads" subtitle={`${total} total leads`}>
        {canCreate && (
          <Button onClick={() => navigate(`/${company_slug}/customers/leads/create`)}
            className="gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-md hover:brightness-110">
            <Plus className="h-4 w-4" /> Add Lead
          </Button>
        )}
      </Header>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Leads',  value: total,     gradient: 'from-blue-500 to-indigo-600'   },
            { label: 'Hot Leads',    value: hot,        gradient: 'from-red-500 to-rose-600'      },
            { label: 'Warm Leads',   value: warm,       gradient: 'from-orange-500 to-amber-600'  },
            { label: 'Converted',    value: converted,  gradient: 'from-green-500 to-emerald-600' },
          ].map(stat => (
            <div key={stat.label} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className={cn('h-8 w-8 rounded-xl flex items-center justify-center text-white mb-3 bg-gradient-to-br', stat.gradient)}>
                <TrendingUp className="h-4 w-4" />
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, phone, email…"
              className="pl-9 h-10 rounded-xl" />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">All Statuses</option>
              <option value="NEW">New</option>
              <option value="HOT">Hot</option>
              <option value="WARM">Warm</option>
              <option value="COLD">Cold</option>
              <option value="CONVERTED">Converted</option>
              <option value="LOST">Lost</option>
            </select>
            {(search || statusFilter) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter(''); }}
                className="rounded-xl text-xs">Clear</Button>
            )}
            <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl" onClick={() => fetchLeads(1)}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-border/60 overflow-hidden shadow-sm bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lead</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">LOB / Product</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Premium</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assigned To</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </td>
                  </tr>
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-muted-foreground">
                      <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="font-medium">No leads found</p>
                      <p className="text-xs mt-1">Try adjusting your filters or add a new lead</p>
                    </td>
                  </tr>
                ) : leads.map(lead => (
                  <tr key={lead.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground">{lead.lead_name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{lead.lead_code}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" /> {lead.phone_number}
                      </div>
                      {lead.email && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <Mail className="h-3 w-3" /> {lead.email}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium">{lead.lob?.name || <span className="text-muted-foreground">—</span>}</p>
                      {lead.product && <p className="text-xs text-muted-foreground">{lead.product.name}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {lead.expected_premium
                        ? <span className="text-sm font-semibold">₹{Number(lead.expected_premium).toLocaleString('en-IN')}</span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {lead.assignee?.full_name || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border', STATUS_STYLES[lead.status] || '')}>
                        {STATUS_LABELS[lead.status] || lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {converting === lead.id
                        ? <Loader2 className="h-4 w-4 animate-spin ml-auto text-muted-foreground" />
                        : (
                          <ActionsMenu
                            lead={lead}
                            canEdit={canEdit} canDelete={canDelete}
                            onEdit={() => navigate(`/${company_slug}/customers/leads/${lead.id}/edit`)}
                            onDelete={() => handleDelete(lead.id)}
                            onConvert={() => handleConvert(lead)}
                          />
                        )
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div className="flex items-center justify-between px-2">
            <p className="text-xs text-muted-foreground">
              Showing {leads.length} of {pagination.total} leads
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg"
                disabled={pagination.page <= 1} onClick={() => fetchLeads(pagination.page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-medium px-2">
                {pagination.page} / {pagination.total_pages}
              </span>
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg"
                disabled={pagination.page >= pagination.total_pages} onClick={() => fetchLeads(pagination.page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
