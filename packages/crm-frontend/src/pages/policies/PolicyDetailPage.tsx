import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Car, Edit, Trash2, Loader2, FileText, Calendar, User, Building2,
  BadgeIndianRupee, Users, HeartPulse,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toaster';
import { policyService } from '@/services/policyService';
import { usePolicyPermissions } from '@/hooks/usePolicyPermissions';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300',
  DRAFT: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300',
  EXPIRED: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300',
  CANCELLED: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400',
};

const inr = (v: string | number | null | undefined) =>
  (Number(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

type CommRow = {
  component_type: string;
  percentage?: string | number;
  commission_amount?: string | number;
};

type CommSummary = {
  total_commission_amount?: string | number;
  notes?: string | null;
  commission_basis?: string | null;
  sub_broker?: { full_name?: string; phone?: string };
  items?: CommRow[];
};

const componentLabel = (type: string) => {
  if (type === 'ADDON') return 'Add-on';
  if (type === 'PREMIUM') return 'Premium';
  return type;
};

function CommissionTable({ items, total, notes }: { items?: CommRow[]; total?: string | number; notes?: string | null }) {
  const rows = items?.length
    ? items
    : (['OD', 'TP', 'ADDON'] as const).map((type) => ({ component_type: type, percentage: undefined, commission_amount: undefined }));

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border/60">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Component</th>
              <th className="px-3 py-2 text-right font-semibold">%</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.map((item) => {
              const hasAmount = item.commission_amount != null && Number(item.commission_amount) !== 0;
              if (!items?.length && !hasAmount) return null;
              return (
                <tr key={item.component_type}>
                  <td className="px-3 py-2 font-medium">{componentLabel(item.component_type)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {item.percentage != null && item.percentage !== '' ? `${item.percentage}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">₹{inr(item.commission_amount)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-primary/5">
            <tr>
              <td colSpan={2} className="px-3 py-2 text-right text-sm font-semibold">Total</td>
              <td className="px-3 py-2 text-right font-bold text-primary">₹{inr(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {notes && <p className="mt-3 text-sm text-muted-foreground">{notes}</p>}
    </>
  );
}

function InfoBlock({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

export default function PolicyDetailPage() {
  const { id, company_slug } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { canEditDirect, canDeleteDirect, isAdmin } = usePolicyPermissions();

  const [policy, setPolicy] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    policyService
      .get(id)
      .then((r) => setPolicy(r.data.data.policy))
      .catch(() => toast.error('Failed to load policy'))
      .finally(() => setLoading(false));
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);

  const handleEdit = () => {
    if (canEditDirect) {
      navigate(`/${company_slug}/policies/${id}/edit`);
    } else {
      navigate(`/${company_slug}/policies/${id}/edit?request=1`);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      if (canDeleteDirect) {
        await policyService.delete(id);
        toast.success('Policy deleted successfully');
        navigate(`/${company_slug}/policies`);
      } else {
        await policyService.createChangeRequest(id, {
          request_type: 'DELETE',
          reason: deleteReason.trim() || undefined,
        });
        toast.success('Delete request submitted for admin approval');
        setDeleteOpen(false);
      }
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Operation failed';
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Policy not found</p>
        <Button variant="outline" onClick={() => navigate(`/${company_slug}/policies`)}>Back to Policies</Button>
      </div>
    );
  }

  const motor = (policy.motor_detail || {}) as Record<string, unknown>;
  const health = (policy.health_detail || {}) as Record<string, unknown>;
  const isHealth = !!policy.health_detail;
  const healthMembers = (policy.health_members as Array<{
    member_name?: string;
    relation?: string;
    member_phone?: string;
    member_age?: number | string;
    member_email?: string;
    is_covered?: boolean;
  }>) || [];
  const healthPlan = health.health_plan as { name?: string } | undefined;
  const customer = policy.customer as { customer_name?: string; customer_phone?: string; customer_email?: string } | undefined;
  const vehicle = policy.vehicle as {
    registration_number?: string;
    make?: { make_name?: string };
    model?: { model_name?: string };
    variant?: { variant_name?: string };
  } | undefined;
  const addOns = (policy.add_ons as Array<{ add_on_name: string; amount: string | number }>) || [];
  const referredBroker = policy.referred_broker as { full_name?: string; phone?: string } | undefined;
  const referredCustomer = policy.referred_customer as { customer_name?: string; customer_phone?: string } | undefined;
  const referredType = String(policy.referred_by_type || 'SELF');

  const referralLabel = (() => {
    if (referredType === 'SUB_BROKER') {
      return referredBroker?.full_name
        ? `${referredBroker.full_name}${referredBroker.phone ? ` · ${referredBroker.phone}` : ''}`
        : 'Sub-broker';
    }
    if (referredType === 'CUSTOMER') {
      return referredCustomer?.customer_name
        ? `${referredCustomer.customer_name}${referredCustomer.customer_phone ? ` · ${referredCustomer.customer_phone}` : ''}`
        : 'Customer';
    }
    return 'Self';
  })();

  const ourComm = (policy.our_commissions as CommSummary[] | undefined)?.[0];

  const subComm = (
    (policy.sub_broker_commission as CommSummary | null | undefined)
    || (policy.commissions as CommSummary[] | undefined)?.[0]
  );

  const shareBasisLabel = (basis?: string | null) =>
    basis === 'PREMIUM_PERCENTAGE' ? 'Premium' : basis === 'COMMISSION_PERCENTAGE' ? 'Our Commission' : '—';

  const subBrokerDisplayName = subComm?.sub_broker?.full_name || referredBroker?.full_name;
  const showCommissionSection = isAdmin && (ourComm || subComm || referredType === 'SUB_BROKER');

  return (
    <div className="flex h-full flex-col">
      <Header
        title={String(policy.policy_number || 'Policy Details')}
        subtitle={`${customer?.customer_name || 'Customer'} · ${fmtDate(policy.start_date as string)} – ${fmtDate(policy.end_date as string)}`}
      >
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/${company_slug}/policies`)} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <Button variant="outline" size="sm" onClick={handleEdit} className="gap-2">
            <Edit className="h-4 w-4" />
            {canEditDirect ? 'Edit' : 'Request Edit'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)} className="gap-2 text-red-600 hover:text-red-700">
            <Trash2 className="h-4 w-4" />
            {canDeleteDirect ? 'Delete' : 'Request Delete'}
          </Button>
        </div>
      </Header>

      <div className="flex-1 space-y-5 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn(
            'inline-flex rounded-full border px-3 py-1 text-xs font-semibold',
            STATUS_STYLES[String(policy.status)] || STATUS_STYLES.CANCELLED,
          )}>
            {String(policy.status)}
          </span>
          <span className="text-sm text-muted-foreground">
            {(policy.lob as { name?: string })?.name ? (
              <span className="mr-2 inline-flex rounded-full border border-border/60 px-2 py-0.5 text-xs font-semibold capitalize">
                {(policy.lob as { name?: string }).name}
              </span>
            ) : null}
            Premium: <strong className="text-foreground">₹{inr(policy.premium_amount as string)}</strong>
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {/* Customer & Policy */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Customer & Policy</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoBlock label="Customer" value={customer?.customer_name} />
              <InfoBlock label="Phone" value={customer?.customer_phone} />
              <InfoBlock label="Email" value={customer?.customer_email} />
              <InfoBlock label="Policy Type" value={(policy.policy_type as { name?: string })?.name} />
              <InfoBlock label="Product" value={(policy.product as { name?: string })?.name} />
              <InfoBlock label="Sub-Product" value={(policy.sub_product as { name?: string })?.name} />
              <InfoBlock label="Insurer" value={(policy.insurance_company as { name?: string })?.name} />
              <InfoBlock label="Issue Date" value={fmtDate(policy.issue_date as string)} />
              <InfoBlock label="Referred By" value={referralLabel} />
            </div>
          </div>

          {/* Vehicle / Cover */}
          {isHealth ? (
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Health Cover</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoBlock label="Health Plan" value={healthPlan?.name} />
                <InfoBlock label="Deductible" value={health.deductible ? `₹${inr(health.deductible as string)}` : undefined} />
                <InfoBlock label="Sum Insured" value={health.sum_insured ? `₹${inr(health.sum_insured as string)}` : undefined} />
                <InfoBlock label="Cumulative Bonus" value={health.cumulative_bonus ? `₹${inr(health.cumulative_bonus as string)}` : undefined} />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Car className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Vehicle</h3>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoBlock label="Registration" value={vehicle?.registration_number} />
                <InfoBlock label="Make / Model" value={[vehicle?.make?.make_name, vehicle?.model?.model_name, vehicle?.variant?.variant_name].filter(Boolean).join(' ')} />
                <InfoBlock label="Package" value={String(motor.package_type || '')} />
                <InfoBlock label="IDV" value={motor.idv ? `₹${inr(motor.idv as string)}` : undefined} />
              </div>
            </div>
          )}

          {/* Premium breakdown */}
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Premium Breakdown</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {isHealth ? (
                <>
                  <InfoBlock label="Base Premium" value={health.premium ? `₹${inr(health.premium as string)}` : undefined} />
                  <InfoBlock label="GST" value={health.gst_amount ? `₹${inr(health.gst_amount as string)} (${health.gst_percent || 0}%)` : undefined} />
                  <InfoBlock label="Net Premium" value={health.net_premium ? `₹${inr(health.net_premium as string)}` : undefined} />
                  <InfoBlock label="Total Premium" value={health.total_premium ? `₹${inr(health.total_premium as string)}` : undefined} />
                  <InfoBlock label="Payment Mode" value={String(health.payment_mode || '')} />
                  <InfoBlock label="Payment Reference" value={String(health.payment_reference || '')} />
                  <InfoBlock label="Full Payment" value={health.is_full_payment === false ? 'No — partial' : 'Yes'} />
                  {health.is_full_payment === false && (
                    <InfoBlock label="Amount Received" value={health.amount_received ? `₹${inr(health.amount_received as string)}` : undefined} />
                  )}
                </>
              ) : (
                <>
                  <InfoBlock label="OD Premium" value={motor.od_premium ? `₹${inr(motor.od_premium as string)}` : undefined} />
                  <InfoBlock label="TP Premium" value={motor.tp_premium ? `₹${inr(motor.tp_premium as string)}` : undefined} />
                  <InfoBlock label="Add-on Premium" value={motor.addon_premium ? `₹${inr(motor.addon_premium as string)}` : undefined} />
                  <InfoBlock label="Net Premium" value={motor.net_premium ? `₹${inr(motor.net_premium as string)}` : undefined} />
                  <InfoBlock label="Total GST" value={motor.total_gst ? `₹${inr(motor.total_gst as string)}` : undefined} />
                  <InfoBlock label="Total Premium" value={motor.total_premium ? `₹${inr(motor.total_premium as string)}` : undefined} />
                  <InfoBlock label="Payment Mode" value={String(motor.payment_mode || '')} />
                  <InfoBlock label="Rate Source" value={String(motor.rate_source || '')} />
                </>
              )}
            </div>
          </div>

          {/* Coverage / members or add-ons */}
          {isHealth ? (
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Covered Members</h3>
              </div>
              {healthMembers.filter((m) => m.is_covered !== false).length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-border/60">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Name</th>
                        <th className="px-3 py-2 text-left font-semibold">Relation</th>
                        <th className="px-3 py-2 text-left font-semibold">Phone</th>
                        <th className="px-3 py-2 text-left font-semibold">Age</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {healthMembers.filter((m) => m.is_covered !== false).map((m, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-medium">{m.member_name || '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground">{m.relation || '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground">{m.member_phone || '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground">{m.member_age ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No covered members</p>
              )}
              {(health.previous_policy_number || health.previous_insurance_company_id) && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 border-t border-border/50 pt-4">
                  <InfoBlock label="Previous Policy No." value={String(health.previous_policy_number || '')} />
                  <InfoBlock label="Previous Insurer" value={(health.previous_insurance_company as { name?: string })?.name} />
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Coverage & Add-ons</h3>
              </div>
              <div className="mb-4 grid gap-4 sm:grid-cols-2">
                <InfoBlock label="OD Period" value={`${fmtDate(motor.od_start_date as string)} – ${fmtDate(motor.od_end_date as string)}`} />
                <InfoBlock label="TP Period" value={`${fmtDate(motor.tp_start_date as string)} – ${fmtDate(motor.tp_end_date as string)}`} />
              </div>
              {addOns.length > 0 ? (
                <ul className="space-y-2">
                  {addOns.map((a, i) => (
                    <li key={i} className="flex justify-between text-sm">
                      <span>{a.add_on_name}</span>
                      <span className="font-medium">₹{inr(a.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No add-ons</p>
              )}
            </div>
          )}
        </div>

        {showCommissionSection && (
          <div className="grid gap-5 md:grid-cols-2">
            {ourComm && (
              <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <BadgeIndianRupee className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">Our Commission</h3>
                </div>
                <CommissionTable
                  items={ourComm.items}
                  total={ourComm.total_commission_amount}
                  notes={ourComm.notes}
                />
              </div>
            )}

            {(subComm || referredType === 'SUB_BROKER') && (
              <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">Sub-broker Commission</h3>
                </div>
                <div className="mb-3 grid gap-3 sm:grid-cols-2">
                  <InfoBlock
                    label="Sub-broker"
                    value={subBrokerDisplayName
                      ? `${subBrokerDisplayName}${(subComm?.sub_broker?.phone || referredBroker?.phone) ? ` · ${subComm?.sub_broker?.phone || referredBroker?.phone}` : ''}`
                      : undefined}
                  />
                  {subComm && (
                    <InfoBlock label="Based On" value={shareBasisLabel(subComm.commission_basis)} />
                  )}
                </div>
                {subComm ? (
                  <CommissionTable items={subComm.items} total={subComm.total_commission_amount} />
                ) : (
                  <p className="text-sm text-muted-foreground">No sub-broker commission recorded for this policy.</p>
                )}
              </div>
            )}
          </div>
        )}

        {policy.notes && (
          <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Notes</h3>
            </div>
            <p className="text-sm text-muted-foreground">{String(policy.notes)}</p>
          </div>
        )}
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{canDeleteDirect ? 'Delete Policy' : 'Request Policy Deletion'}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {canDeleteDirect
              ? 'This will permanently delete the policy and all related data including motor details, documents, and commissions. Wallet transactions will be reversed.'
              : 'Your delete request will be sent to an admin for approval.'}
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
          {canDeleteDirect && (
            <p className="text-xs font-semibold text-red-600">This action cannot be undone.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : canDeleteDirect ? 'Delete Permanently' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
