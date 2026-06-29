import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/layout/Header';
import CustomerForm from '@/components/customers/CustomerForm';
import { customerService } from '@/services/customerService';
import { useToast } from '@/components/ui/toaster';
import { Skeleton } from '@/components/ui/skeleton';

// Normalize raw API customer data into form-compatible shape.
// The API returns `null` for optional fields but Zod schemas use z.string().optional()
// which only accepts string|undefined — null causes safeParse/trigger to fail silently.
function normalizeCustomer(customer: Record<string, unknown>): Record<string, unknown> {
  const c = { ...customer };

  // DOB: ISO datetime → YYYY-MM-DD for <input type="date">
  if (c.customer_dob && typeof c.customer_dob === 'string') {
    c.customer_dob = c.customer_dob.split('T')[0];
  } else if (c.customer_dob == null) {
    c.customer_dob = '';
  }

  // Numeric fields → string (form inputs / Zod schemas expect strings); null → ''
  c.customer_since = c.customer_since != null ? String(c.customer_since) : '';
  c.age    = c.age    != null ? String(c.age)    : '';
  c.height = c.height != null ? String(c.height) : '';
  c.weight = c.weight != null ? String(c.weight) : '';

  // All optional string fields: null → '' so Zod's z.string().optional() accepts them
  const strOrEmpty = [
    'customer_email',
    'family_code', 'family_relation',
    'referred_by_sub_broker_id', 'referred_by_customer_id',
    'blood_group',
    'ped_details',
    'house_no', 'area', 'city', 'state', 'pincode',
    'pan_card', 'aadhar_card',
  ];
  for (const f of strOrEmpty) {
    if (c[f] == null) c[f] = '';
  }

  // Enum / boolean defaults when null (shouldn't happen from API but guard anyway)
  if (!c.customer_priority) c.customer_priority = 'MEDIUM';
  if (!c.referred_by_type)  c.referred_by_type  = 'SELF';
  if (!c.country)           c.country           = 'India';
  if (c.has_ped      == null) c.has_ped      = false;
  if (c.is_family_head == null) c.is_family_head = false;

  // Remove relational/computed fields that are not form inputs
  delete c.creator;
  delete c.updater;
  delete c.referred_broker;

  return c;
}

export default function EditCustomerPage() {
  const { company_slug, id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [customer, setCustomer] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    customerService.get(id)
      .then(({ data }) => setCustomer(normalizeCustomer(data.data.customer)))
      .catch(() => toast.error('Failed to load customer'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (data: Record<string, unknown>) => {
    setSaving(true);
    try {
      // Strip fields that belong to related tables or are not updatable via this API
      const {
        pendingBankAccounts: _pba,
        pendingDocuments: _pd,
        bank_accounts: _ba,
        documents: _docs,
        customer_code: _code,
        id: _id,
        created_at: _ca,
        updated_at: _ua,
        deleted_at: _da,
        is_active: _ia,
        ...customerData
      } = data as Record<string, unknown>;

      await customerService.update(id, customerData);
      toast.success('Customer updated successfully');
      navigate(`/${company_slug}/customers/${id}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Update failed';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex h-full flex-col">
      <Header title="Edit Customer" />
      <div className="flex-1 p-6 space-y-4">
        <div className="flex gap-3 mx-auto max-w-3xl">
          {[1,2,3,4,5].map(i => (
            <Skeleton key={i} className="h-10 flex-1 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-[480px] w-full max-w-3xl mx-auto rounded-2xl" />
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <Header title="Edit Customer" subtitle={customer?.customer_code as string | undefined}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/${company_slug}/customers/${id}`)}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </Header>
      <div className="flex-1 overflow-hidden bg-muted/30 p-4 sm:p-6">
        <CustomerForm
          initialData={customer || {}}
          onSubmit={handleSubmit}
          loading={saving}
          isEditMode
        />
      </div>
    </div>
  );
}
