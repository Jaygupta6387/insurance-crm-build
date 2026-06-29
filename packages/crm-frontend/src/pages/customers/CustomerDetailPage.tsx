import * as React from 'react';
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Edit, Trash2, Phone, Mail, MapPin, Heart,
  CreditCard, FileText, User, Calendar, Star, Shield,
  Plus, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import Header from '@/components/layout/Header';
import BankAccountModal from '@/components/customers/BankAccountModal';
import DocumentSection from '@/components/customers/DocumentSection';
import { customerService } from '@/services/customerService';
import { bankAccountService } from '@/services/bankAccountService';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/components/ui/toaster';
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

function InfoRow({ label, value, icon: Icon }: { label: string; value: string | null | undefined; icon?: React.ElementType }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function BankAccountCard({ account, onEdit, onDelete, canEdit }) {
  return (
    <div className={cn(
      'rounded-xl border p-4 transition-colors',
      account.is_primary ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-sm font-medium text-foreground">{account.account_number}</span>
          {account.is_primary && (
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30 gap-1">
              <Check className="h-3 w-3" /> Primary
            </Badge>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(account)}>
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400" onClick={() => onDelete(account.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        {account.account_holder_name && (
          <div><dt className="text-xs text-muted-foreground">Holder</dt><dd className="text-sm">{account.account_holder_name}</dd></div>
        )}
        {account.bank_name && (
          <div><dt className="text-xs text-muted-foreground">Bank</dt><dd className="text-sm">{account.bank_name}</dd></div>
        )}
        {account.ifsc_code && (
          <div><dt className="text-xs text-muted-foreground">IFSC</dt><dd className="text-sm font-mono">{account.ifsc_code}</dd></div>
        )}
        {account.branch_name && (
          <div><dt className="text-xs text-muted-foreground">Branch</dt><dd className="text-sm">{account.branch_name}</dd></div>
        )}
        <div>
          <dt className="text-xs text-muted-foreground">Type</dt>
          <dd className="text-sm">{account.account_type?.replace('_',' ')}</dd>
        </div>
        {account.is_verified && (
          <div><dt className="text-xs text-muted-foreground">Verified</dt>
          <dd className="text-sm text-emerald-500 flex items-center gap-1"><Check className="h-3 w-3" /> Yes</dd></div>
        )}
      </dl>
    </div>
  );
}

export default function CustomerDetailPage() {
  const { company_slug, id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  const canEdit   = isAdmin || user?.permissions?.can_edit_customer;
  const canDelete = isAdmin || user?.permissions?.can_delete_customer;

  const [customer, setCustomer] = useState(null);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bankModal, setBankModal] = useState(null); // null | 'create' | account object

  const loadCustomer = async () => {
    try {
      const { data } = await customerService.get(id);
      setCustomer(data.data.customer);
      setBankAccounts(data.data.customer.bank_accounts || []);
    } catch {
      toast.error('Failed to load customer');
    } finally {
      setLoading(false);
    }
  };

  const refreshBankAccounts = async () => {
    try {
      const { data } = await bankAccountService.list(id);
      setBankAccounts(data.data.accounts);
    } catch {}
  };

  useEffect(() => { loadCustomer(); }, [id]);

  const handleDelete = async () => {
    if (!window.confirm(`Soft-delete ${customer?.customer_name}?`)) return;
    try {
      await customerService.delete(id);
      toast.success('Customer deleted');
      navigate(`/${company_slug}/customers`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  const handleDeleteBank = async (bankId) => {
    if (!window.confirm('Remove this bank account?')) return;
    try {
      await bankAccountService.delete(bankId);
      toast.success('Bank account removed');
      refreshBankAccounts();
    } catch {
      toast.error('Failed to remove');
    }
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <Header title="Customer Detail" />
        <div className="flex-1 p-6 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!customer) return null;

  return (
    <div className="flex h-full flex-col">
      <Header
        title={customer.customer_name}
        subtitle={customer.customer_code}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/${company_slug}/customers`)}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/${company_slug}/customers/${id}/edit`)}
            className="gap-2"
          >
            <Edit className="h-4 w-4" /> Edit
          </Button>
        )}
        {canDelete && (
          <Button variant="outline" size="sm" onClick={handleDelete} className="gap-2 text-red-400 border-red-400/30 hover:bg-red-400/10">
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        )}
      </Header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Hero Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border bg-gradient-to-br from-card to-muted/30 p-6"
          >
            <div className="flex items-start gap-5">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shrink-0">
                {customer.customer_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-foreground">{customer.customer_name}</h1>
                  <Badge variant="outline" className={cn('text-xs', STATUS_COLORS[customer.status])}>
                    {customer.status}
                  </Badge>
                  <Badge variant="outline" className={cn('text-xs', PRIORITY_COLORS[customer.customer_priority])}>
                    <Star className="h-3 w-3 mr-1" />{customer.customer_priority}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground font-mono mt-1">{customer.customer_code}</p>
                <div className="flex flex-wrap gap-4 mt-3">
                  {customer.customer_phone && (
                    <a href={`tel:${customer.customer_phone}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <Phone className="h-4 w-4" />{customer.customer_phone}
                    </a>
                  )}
                  {customer.customer_email && (
                    <a href={`mailto:${customer.customer_email}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <Mail className="h-4 w-4" />{customer.customer_email}
                    </a>
                  )}
                  {customer.family_code && (
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground font-mono">
                      <User className="h-4 w-4" />Family: {customer.family_code}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Basic Info */}
            <Section title="Basic Information" icon={User}>
              <InfoRow label="Date of Birth" value={customer.customer_dob ? new Date(customer.customer_dob).toLocaleDateString('en-IN') : null} icon={Calendar} />
              <InfoRow label="Age" value={customer.age} />
              <InfoRow label="Family Relation" value={customer.family_relation} />
              <InfoRow label="Family Head" value={customer.is_family_head ? 'Yes' : 'No'} />
              <InfoRow label="Customer Since" value={customer.customer_since ? new Date(customer.customer_since).toLocaleDateString('en-IN') : null} icon={Calendar} />
              <InfoRow label="Created By" value={customer.creator?.full_name} icon={User} />
            </Section>

            {/* Health */}
            <Section title="Health Information" icon={Heart}>
              <InfoRow label="Blood Group" value={customer.blood_group?.replace('_', ' ')} />
              <InfoRow label="Height" value={customer.height ? `${customer.height} cm` : null} />
              <InfoRow label="Weight" value={customer.weight ? `${customer.weight} kg` : null} />
              <InfoRow label="Pre-Existing Disease" value={customer.has_ped ? 'Yes' : 'No'} />
              {customer.ped_details && (
                <div>
                  <p className="text-xs text-muted-foreground">PED Details</p>
                  <p className="text-sm text-foreground mt-1 rounded-lg bg-muted/50 p-2">{customer.ped_details}</p>
                </div>
              )}
            </Section>

            {/* Address */}
            <Section title="Address" icon={MapPin}>
              {[customer.house_no, customer.area].filter(Boolean).join(', ') && (
                <InfoRow label="Street" value={[customer.house_no, customer.area].filter(Boolean).join(', ')} />
              )}
              <InfoRow label="City" value={customer.city} />
              <InfoRow label="State" value={customer.state} />
              <InfoRow label="Country" value={customer.country} />
              <InfoRow label="Pincode" value={customer.pincode} />
            </Section>

            {/* KYC */}
            <Section title="KYC Details" icon={Shield}>
              <InfoRow label="PAN Card" value={customer.pan_card} />
              <InfoRow label="Aadhar Card"
                value={customer.aadhar_card ? `XXXX-XXXX-${customer.aadhar_card.slice(-4)}` : null}
              />
              {customer.referred_by_type && (
                <InfoRow label="Referred By" value={
                  customer.referred_by_type === 'SUB_BROKER' && customer.referred_broker
                    ? `Broker: ${customer.referred_broker.full_name}`
                    : customer.referred_by_type
                } />
              )}
            </Section>
          </div>

          {/* Bank Accounts */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <CreditCard className="h-4 w-4 text-primary" />
                </div>
                <h3 className="font-semibold text-sm text-foreground">Bank Accounts</h3>
                <Badge variant="outline" className="text-xs">{bankAccounts.length}</Badge>
              </div>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => setBankModal('create')} className="gap-2">
                  <Plus className="h-3.5 w-3.5" /> Add Account
                </Button>
              )}
            </div>

            {bankAccounts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground py-8 rounded-xl border border-dashed border-border">
                <CreditCard className="h-8 w-8 opacity-30" />
                <p className="text-sm">No bank accounts added yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {bankAccounts.map(acc => (
                  <BankAccountCard
                    key={acc.id}
                    account={acc}
                    canEdit={canEdit}
                    onEdit={(a) => setBankModal(a)}
                    onDelete={handleDeleteBank}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Documents */}
          <div className="rounded-xl border border-border bg-card p-5">
            <DocumentSection
              customerId={id}
              documents={customer.documents || []}
              onRefresh={loadCustomer}
              canEdit={canEdit}
            />
          </div>
        </div>
      </div>

      {/* Bank Account Modal */}
      {bankModal && (
        <BankAccountModal
          customerId={id}
          account={bankModal !== 'create' ? bankModal : null}
          onClose={() => setBankModal(null)}
          onSaved={refreshBankAccounts}
        />
      )}
    </div>
  );
}
