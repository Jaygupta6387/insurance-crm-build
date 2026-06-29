import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import MotorPolicyWizard from '@/components/policies/motor/MotorPolicyWizard';
import HealthPolicyWizard from '@/components/policies/health/HealthPolicyWizard';
import { usePolicyPermissions } from '@/hooks/usePolicyPermissions';
import { policyService } from '@/services/policyService';

export default function EditPolicyPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { canEditDirect } = usePolicyPermissions();
  const [lobKey, setLobKey] = useState<'motor' | 'health' | null>(null);

  const requestMode = searchParams.get('request') === '1' || !canEditDirect;

  useEffect(() => {
    if (!id) return;
    policyService.get(id).then((r) => {
      const lobName = String((r.data.data.policy.lob as { name?: string })?.name || '').toLowerCase();
      if (/health/.test(lobName)) setLobKey('health');
      else setLobKey('motor');
    }).catch(() => setLobKey('motor'));
  }, [id]);

  if (!id) return null;

  if (!lobKey) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (lobKey === 'health') {
    return <HealthPolicyWizard editPolicyId={id} requestMode={requestMode} />;
  }

  return <MotorPolicyWizard editPolicyId={id} requestMode={requestMode} />;
}
