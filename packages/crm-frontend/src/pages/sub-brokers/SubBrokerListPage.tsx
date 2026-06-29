import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Trash2,
  Edit,
  Briefcase,
  MoreHorizontal,
  Wallet,
  Users,
  TrendingUp,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toaster';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { subBrokerService, type SubBroker } from '@/services/subBrokerService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Analytics {
  total_brokers: number;
  active_brokers: number;
  inactive_brokers: number;
  total_wallet_balance: number | string;
  total_commission_paid: number | string;
}

interface BrokerForm {
  full_name: string;
  phone: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE';
}

const EMPTY_FORM: BrokerForm = {
  full_name: '',
  phone: '',
  email: '',
  status: 'ACTIVE',
};

const fmt = (n: number | string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(
    Number(n)
  );

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 flex items-start gap-4">
      <div className={`rounded-lg p-2.5 ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-0.5">{value}</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SubBrokerListPage() {
  const { company_slug } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  // List state
  const [brokers, setBrokers] = useState<SubBroker[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<SubBroker | null>(null);
  const [form, setForm] = useState<BrokerForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<BrokerForm>>({});
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<SubBroker | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ─── Load Data ─────────────────────────────────────────────────────────────

  const loadBrokers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit };
      if (search) params.search = search;
      if (statusFilter !== 'ALL') params.status = statusFilter;

      const { data } = await subBrokerService.list(params as any);
      const payload = data.data;
      setBrokers(payload.brokers ?? []);
      setTotal(payload.total ?? 0);
      setPages(payload.pages ?? 1);
    } catch {
      toast.error('Failed to load sub-brokers');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  const loadAnalytics = useCallback(async () => {
    try {
      const { data } = await subBrokerService.getAnalytics();
      setAnalytics(data.data.analytics);
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    loadBrokers();
  }, [loadBrokers]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // reset page when search/filter changes
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  // ─── Form Handling ─────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setShowForm(true);
  };

  const openEdit = (b: SubBroker) => {
    setEditTarget(b);
    setForm({
      full_name: b.full_name,
      phone: b.phone,
      email: b.email ?? '',
      status: b.status,
    });
    setFormErrors({});
    setShowForm(true);
  };

  const validateForm = (): boolean => {
    const errors: Partial<BrokerForm> = {};
    if (!form.full_name.trim()) errors.full_name = 'Full name is required';
    if (!form.phone.trim()) errors.phone = 'Phone is required';
    else if (!/^[6-9]\d{9}$/.test(form.phone)) errors.phone = 'Enter a valid 10-digit mobile number';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errors.email = 'Enter a valid email';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        status: form.status,
      };
      if (editTarget) {
        await subBrokerService.update(editTarget.id, payload);
        toast.success('Sub-broker updated successfully');
      } else {
        await subBrokerService.create(payload);
        toast.success('Sub-broker created successfully');
      }
      setShowForm(false);
      loadBrokers();
      loadAnalytics();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await subBrokerService.delete(deleteTarget.id);
      toast.success('Sub-broker deleted');
      setDeleteTarget(null);
      loadBrokers();
      loadAnalytics();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      <Header title="Sub-Brokers" subtitle="Manage referral sub-brokers and commissions">
        <Button onClick={openCreate} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Add Sub-Broker
        </Button>
      </Header>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Brokers"
          value={analytics ? analytics.total_brokers : <Skeleton className="h-7 w-16" />}
          icon={Briefcase}
          color="bg-blue-500"
        />
        <StatCard
          label="Active"
          value={analytics ? analytics.active_brokers : <Skeleton className="h-7 w-10" />}
          icon={Users}
          color="bg-green-500"
        />
        <StatCard
          label="Total Wallet Balance"
          value={
            analytics ? (
              fmt(analytics.total_wallet_balance)
            ) : (
              <Skeleton className="h-7 w-24" />
            )
          }
          icon={Wallet}
          color="bg-violet-500"
        />
        <StatCard
          label="Total Commission Paid"
          value={
            analytics ? (
              fmt(analytics.total_commission_paid)
            ) : (
              <Skeleton className="h-7 w-24" />
            )
          }
          icon={TrendingUp}
          color="bg-amber-500"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, phone, code, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sub-Broker</TableHead>
              <TableHead>Code</TableHead>
              <TableHead className="hidden md:table-cell">Phone</TableHead>
              <TableHead className="hidden lg:table-cell">Customers</TableHead>
              <TableHead className="hidden lg:table-cell">Wallet Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : brokers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Briefcase className="h-10 w-10 opacity-20" />
                    <p className="font-medium">No sub-brokers found</p>
                    <p className="text-sm">
                      {search || statusFilter !== 'ALL'
                        ? 'Try adjusting your search or filters'
                        : 'Get started by adding the first sub-broker'}
                    </p>
                    {!search && statusFilter === 'ALL' && (
                      <Button variant="outline" size="sm" onClick={openCreate}>
                        Add Sub-Broker
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              brokers.map((b) => (
                <motion.tr
                  key={b.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => navigate(`/${company_slug}/sub-brokers/${b.id}`)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div
                      className="font-medium hover:underline cursor-pointer"
                      onClick={() => navigate(`/${company_slug}/sub-brokers/${b.id}`)}
                    >
                      {b.full_name}
                    </div>
                    {b.email && (
                      <div className="text-xs text-muted-foreground">{b.email}</div>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                      {b.broker_code}
                    </code>
                  </TableCell>
                  <TableCell className="hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
                    {b.phone}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
                    <span className="text-sm">{b._count?.customers ?? 0}</span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
                    <span className="font-medium tabular-nums">{fmt(b.wallet_balance)}</span>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Badge variant={b.status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {b.status}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => navigate(`/${company_slug}/sub-brokers/${b.id}`)}
                        >
                          <Eye className="mr-2 h-4 w-4" /> View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(b)}>
                          <Edit className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(b)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </motion.tr>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {!loading && total > limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                {page} / {pages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Sub-Broker' : 'Add Sub-Broker'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
            {/* Name */}
            <div className="grid gap-1.5">
              <Label htmlFor="full_name">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="e.g. Rajan Mehta"
              />
              {formErrors.full_name && (
                <p className="text-xs text-destructive">{formErrors.full_name}</p>
              )}
            </div>
            {/* Phone */}
            <div className="grid gap-1.5">
              <Label htmlFor="phone">
                Phone <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value.replace(/\D/g, '') }))}
                placeholder="10-digit mobile number"
                maxLength={10}
              />
              {formErrors.phone && (
                <p className="text-xs text-destructive">{formErrors.phone}</p>
              )}
            </div>
            {/* Email */}
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="broker@example.com"
              />
              {formErrors.email && (
                <p className="text-xs text-destructive">{formErrors.email}</p>
              )}
            </div>
            {/* Status */}
            {editTarget && (
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v as 'ACTIVE' | 'INACTIVE' }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editTarget ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Sub-Broker?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove <strong>{deleteTarget?.full_name}</strong> (
            {deleteTarget?.broker_code}). This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

