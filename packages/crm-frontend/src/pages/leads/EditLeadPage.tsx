import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import Header from '@/components/layout/Header';
import LeadForm from '@/components/leads/LeadForm';
import { leadService } from '@/services/leadService';
import type { Lead } from '@/services/leadService';
import { useToast } from '@/components/ui/toaster';

export default function EditLeadPage() {
  const { company_slug, id } = useParams();
  const navigate = useNavigate();
  const toast    = useToast();

  const [lead,    setLead]    = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    leadService.get(id)
      .then(r => setLead(r.data.data.lead))
      .catch(() => toast.error('Failed to load lead'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (data: Record<string, unknown>) => {
    setSaving(true);
    try {
      await leadService.update(id, data);
      toast.success('Lead updated successfully');
      navigate(`/${company_slug}/customers/leads`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Update failed';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex h-full flex-col">
      <Header title="Edit Lead" />
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-[500px] w-full rounded-2xl" />
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <Header title="Edit Lead" subtitle={lead?.lead_code}>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/${company_slug}/customers/leads`)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Leads
        </Button>
      </Header>
      <div className="flex-1 overflow-hidden bg-muted/30 p-4 sm:p-6">
        <LeadForm initialData={lead || {}} onSubmit={handleSubmit} loading={saving} isEditMode />
      </div>
    </div>
  );
}
