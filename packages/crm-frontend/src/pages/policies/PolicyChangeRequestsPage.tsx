import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { Check, Eye, Loader2, RefreshCw, X } from 'lucide-react';
import Header from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toaster';
import { policyService } from '@/services/policyService';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';

interface ChangeRequest {
  id: string;
  policy_id: string;
  policy_number: string | null;
  customer_name: string | null;
  request_type: 'EDIT' | 'DELETE';
  status: string;
  reason: string | null;
  requester_name: string | null;
  created_at: string;
  payload?: unknown;
}

export default function PolicyChangeRequestsPage() {
  const { company_slug } = useParams();
  const { user } = useAuthStore();

  if (user?.role !== 'ADMIN') {
    return <Navigate to={`/${company_slug}/dashboard`} replace />;
  }
  const navigate = useNavigate();
  const toast = useToast();

  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selected, setSelected] = useState<ChangeRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [reviewNote, setReviewNote] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    policyService
      .listChangeRequests('PENDING')
      .then((r) => setRequests(r.data.data.requests || []))
      .catch(() => toast.error('Failed to load change requests'))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const openReview = (req: ChangeRequest, action: 'APPROVE' | 'REJECT') => {
    setSelected(req);
    setReviewAction(action);
    setReviewNote('');
    setReviewOpen(true);
  };

  const submitReview = async () => {
    if (!selected) return;
    setReviewing(selected.id);
    try {
      await policyService.reviewChangeRequest(selected.id, {
        action: reviewAction,
        review_note: reviewNote.trim() || undefined,
      });
      toast.success(reviewAction === 'APPROVE' ? 'Request approved' : 'Request rejected');
      setReviewOpen(false);
      load();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Review failed';
      toast.error(msg);
    } finally {
      setReviewing(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Header title="Policy Change Requests" subtitle="Review employee edit and delete requests">
        <Button variant="outline" size="icon" onClick={load} className="h-10 w-10 rounded-xl">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
      </Header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {['Policy', 'Customer', 'Type', 'Requested By', 'Reason', 'Date', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={7} className="py-16 text-center text-muted-foreground">No pending requests</td></tr>
              ) : (
                requests.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="px-4 py-3 font-semibold">{r.policy_number || '—'}</td>
                    <td className="px-4 py-3">{r.customer_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                        r.request_type === 'DELETE'
                          ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
                          : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300',
                      )}>
                        {r.request_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.requester_name || '—'}</td>
                    <td className="px-4 py-3 max-w-xs truncate text-muted-foreground" title={r.reason || ''}>{r.reason || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => navigate(`/${company_slug}/policies/${r.policy_id}`)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="View policy"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <Button size="sm" variant="outline" className="h-8 gap-1 rounded-lg text-green-700" onClick={() => openReview(r, 'APPROVE')}>
                          <Check className="h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 gap-1 rounded-lg text-red-600" onClick={() => openReview(r, 'REJECT')}>
                          <X className="h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewAction === 'APPROVE' ? 'Approve' : 'Reject'} {selected?.request_type} request</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Policy <strong>{selected?.policy_number}</strong> — {selected?.customer_name}
          </p>
          {selected?.request_type === 'EDIT' && reviewAction === 'APPROVE' && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Approving will apply the submitted changes to this policy.
            </p>
          )}
          {selected?.request_type === 'DELETE' && reviewAction === 'APPROVE' && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Approving will permanently delete this policy and all related records.
            </p>
          )}
          <textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder="Review note (optional)"
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button
              onClick={submitReview}
              disabled={!!reviewing}
              className={reviewAction === 'APPROVE' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : reviewAction === 'APPROVE' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
