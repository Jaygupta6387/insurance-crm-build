import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Header from '@/components/layout/Header';
import LeadForm from '@/components/leads/LeadForm';
import { leadService } from '@/services/leadService';
import { useToast } from '@/components/ui/toaster';

export default function CreateLeadPage() {
  const { company_slug } = useParams();
  const navigate = useNavigate();
  const toast    = useToast();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: Record<string, unknown>) => {
    setLoading(true);
    try {
      await leadService.create(data);
      toast.success('Lead created successfully!');
      navigate(`/${company_slug}/customers/leads`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to create lead';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Header title="New Lead" subtitle="Create a new lead record">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/${company_slug}/customers/leads`)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Leads
        </Button>
      </Header>
      <div className="flex-1 overflow-hidden bg-muted/30 p-4 sm:p-6">
        <LeadForm onSubmit={handleSubmit} loading={loading} />
      </div>
    </div>
  );
}
