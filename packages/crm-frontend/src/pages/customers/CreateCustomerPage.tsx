import { useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/layout/Header';
import CustomerForm from '@/components/customers/CustomerForm';
import { customerService } from '@/services/customerService';
import { bankAccountService } from '@/services/bankAccountService';
import { documentService } from '@/services/documentService';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/components/ui/toaster';

export default function CreateCustomerPage() {
  const { company_slug } = useParams();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [searchParams] = useSearchParams();
  const toast     = useToast();
  const { user }  = useAuthStore();
  const [loading, setLoading] = useState(false);

  const fromLead = (location.state as { fromLead?: Record<string, unknown> } | null)?.fromLead ?? {};
  const familyCodeFromUrl = searchParams.get('family_code');
  const returnTo = searchParams.get('returnTo');

  const initialData = useMemo(() => ({
    ...fromLead,
    ...(familyCodeFromUrl ? {
      family_code: familyCodeFromUrl,
      is_family_head: false,
    } : {}),
  }), [fromLead, familyCodeFromUrl]);

  const handleSubmit = async (data: Record<string, unknown>) => {
    setLoading(true);
    try {
      const { pendingBankAccounts = [], pendingDocuments = [], ...customerData } = data as {
        pendingBankAccounts?: Record<string, unknown>[];
        pendingDocuments?: Record<string, unknown>[];
        [k: string]: unknown;
      };

      const res = await customerService.create(customerData);
      const customerId = res.data.data.customer.id;

      if ((pendingBankAccounts as unknown[]).length > 0 || (pendingDocuments as unknown[]).length > 0) {
        await Promise.allSettled([
          ...(pendingBankAccounts as Record<string, unknown>[]).map(acc =>
            bankAccountService.add({ ...acc, customer_id: customerId })
          ),
          ...(pendingDocuments as Record<string, unknown>[]).map(doc =>
            documentService.add({ ...doc, customer_id: customerId, uploaded_by: user?.id })
          ),
        ]);
      }

      toast.success('Customer created successfully!');

      if (returnTo) {
        navigate(`/${company_slug}/${decodeURIComponent(returnTo)}`);
        return;
      }

      navigate(`/${company_slug}/customers/${customerId}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to create customer';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const backHref = returnTo
    ? `/${company_slug}/${decodeURIComponent(returnTo)}`
    : `/${company_slug}/customers`;

  return (
    <div className="flex h-full flex-col">
      <Header
        title={
          familyCodeFromUrl
            ? 'Add Family Member'
            : Object.keys(fromLead).length > 0
              ? 'Convert Lead to Customer'
              : 'New Customer'
        }
        subtitle={
          familyCodeFromUrl
            ? `Adding to family ${familyCodeFromUrl} — you will return to the policy wizard after saving`
            : Object.keys(fromLead).length > 0
              ? 'Lead details pre-filled — complete remaining fields'
              : 'Fill in the details to create a new customer record'
        }
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(backHref)}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> {returnTo ? 'Back to Policy' : 'Back to Customers'}
        </Button>
      </Header>

      <div className="flex-1 overflow-hidden bg-muted/30 p-4 sm:p-6">
        <CustomerForm initialData={initialData} onSubmit={handleSubmit} loading={loading} />
      </div>
    </div>
  );
}
