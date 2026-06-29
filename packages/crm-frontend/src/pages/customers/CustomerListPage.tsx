import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Filter, Download, Users, TrendingUp,
  MoreHorizontal, Eye, Edit, Trash2, Phone, Mail,
  ChevronLeft, ChevronRight, X, RefreshCw,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { customerService } from '@/services/customerService';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';

const STATUS_COLORS = {
  ACTIVE:   'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  INACTIVE: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  PROSPECT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  BLOCKED:  'bg-red-500/10 text-red-400 border-red-500/20',
};

const PRIORITY_COLORS = {
  LOW:    'bg-zinc-500/10 text-zinc-400',
  MEDIUM: 'bg-amber-500/10 text-amber-400',
  HIGH:   'bg-orange-500/10 text-orange-400',
  VIP:    'bg-purple-500/10 text-purple-400',
};

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-card p-5"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className={cn('rounded-lg p-2', color)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value ?? '—'}</p>
    </motion.div>
  );
}

export default function CustomerListPage() {
  const { company_slug } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  const canCreate = isAdmin || user?.permissions?.can_create_customer;
  const canEdit   = isAdmin || user?.permissions?.can_edit_customer;
  const canDelete = isAdmin || user?.permissions?.can_delete_customer;

  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: 20 };
      if (debouncedSearch) params.search = debouncedSearch;
      if (statusFilter)    params.status = statusFilter;
      const { data } = await customerService.list(params);
      setCustomers(data.data.customers);
      setPagination(data.data.pagination);
    } catch {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Soft-delete ${name}? The customer will be hidden but data preserved.`)) return;
    setActing(id);
    try {
      await customerService.delete(id);
      toast.success('Customer deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setActing(null);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setPage(1);
  };

  const hasFilters = search || statusFilter;

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Customers"
        subtitle={`${pagination.total} total customers`}
      >
        {canCreate && (
          <Button
            onClick={() => navigate(`/${company_slug}/customers/create`)}
            className="gap-2"
            size="sm"
          >
            <Plus className="h-4 w-4" />
            Add Customer
          </Button>
        )}
      </Header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total" value={pagination.total} icon={Users} color="bg-blue-500/10 text-blue-400" />
          <StatCard label="Active" value={customers.filter(c => c.status === 'ACTIVE').length} icon={TrendingUp} color="bg-emerald-500/10 text-emerald-400" />
          <StatCard label="Prospects" value={customers.filter(c => c.status === 'PROSPECT').length} icon={Users} color="bg-amber-500/10 text-amber-400" />
          <StatCard label="VIP" value={customers.filter(c => c.customer_priority === 'VIP').length} icon={Users} color="bg-purple-500/10 text-purple-400" />
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, PAN, code…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>

          <Select
            value={statusFilter || 'all'}
            onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}
          >
            <SelectTrigger className="w-36">
              <Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
              <SelectItem value="PROSPECT">Prospect</SelectItem>
              <SelectItem value="BLOCKED">Blocked</SelectItem>
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-muted-foreground">
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}

          <Button variant="ghost" size="icon" onClick={load} className="ml-auto" title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/30">
                  <TableHead className="font-semibold text-foreground">Customer</TableHead>
                  <TableHead className="font-semibold text-foreground">Code</TableHead>
                  <TableHead className="font-semibold text-foreground hidden md:table-cell">Phone</TableHead>
                  <TableHead className="font-semibold text-foreground hidden lg:table-cell">Family Code</TableHead>
                  <TableHead className="font-semibold text-foreground">Priority</TableHead>
                  <TableHead className="font-semibold text-foreground">Status</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : customers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-muted-foreground">
                          <Users className="h-10 w-10 opacity-30" />
                          <p className="text-sm">No customers found</p>
                          {hasFilters && (
                            <Button variant="ghost" size="sm" onClick={clearFilters}>
                              Clear filters
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    customers.map((c) => (
                      <motion.tr
                        key={c.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="border-border hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => navigate(`/${company_slug}/customers/${c.id}`)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">
                              {c.customer_name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate">{c.customer_name}</p>
                              {c.customer_email && (
                                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                  <Mail className="h-3 w-3" />{c.customer_email}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-muted-foreground">{c.customer_code}</span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="flex items-center gap-1 text-sm">
                            <Phone className="h-3 w-3 text-muted-foreground" />{c.customer_phone}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="font-mono text-xs text-muted-foreground">{c.family_code || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-xs', PRIORITY_COLORS[c.customer_priority])}>
                            {c.customer_priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-xs', STATUS_COLORS[c.status])}>
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:opacity-100">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`/${company_slug}/customers/${c.id}`)}>
                                <Eye className="h-4 w-4 mr-2" /> View
                              </DropdownMenuItem>
                              {canEdit && (
                                <DropdownMenuItem onClick={() => navigate(`/${company_slug}/customers/${c.id}/edit`)}>
                                  <Edit className="h-4 w-4 mr-2" /> Edit
                                </DropdownMenuItem>
                              )}
                              {canDelete && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-red-500 focus:text-red-500"
                                    disabled={acting === c.id}
                                    onClick={() => handleDelete(c.id, c.customer_name)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {pagination.page} of {pagination.total_pages} · {pagination.total} records
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page === pagination.total_pages}
                onClick={() => setPage((p) => p + 1)}
                className="gap-1"
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
