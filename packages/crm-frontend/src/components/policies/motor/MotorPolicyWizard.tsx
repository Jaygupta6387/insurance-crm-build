import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, Check, Loader2, Save,
  FileText, Car, Calculator, FileCheck2, BadgeIndianRupee,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toaster';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { masterDataService, subBrokerService } from '@/services/subBrokerService';
import { motorMastersService } from '@/services/motorMastersService';
import { policyService, type PolicyPayload } from '@/services/policyService';
import { createInitialWizardData, type MotorWizardData } from './types';
import { mapPolicyToWizardData } from './mapPolicyToWizard';
import type { DropdownOption } from './shared';
import {
  Step1Basics, Step2Vehicle, Step3Premium, Step4Claims, Step5Commission,
} from './steps';

const num = (v: string | number | null | undefined): number | undefined => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};

export default function MotorPolicyWizard({
  editPolicyId,
  requestMode = false,
}: {
  editPolicyId?: string;
  requestMode?: boolean;
}) {
  const { company_slug } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuthStore();

  const canCommission = user?.role === 'ADMIN' || !!user?.permissions?.can_manage_policy_commission;
  const isEditMode = !!editPolicyId;

  const [data, setData] = useState<MotorWizardData>(() => createInitialWizardData());
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [policyId, setPolicyId] = useState<string | null>(editPolicyId || null);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [loadingPolicy, setLoadingPolicy] = useState(!!editPolicyId);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestReason, setRequestReason] = useState('');
  const [pendingAction, setPendingAction] = useState<'save' | 'finalize' | null>(null);

  // ── Master data ──────────────────────────────────────────────────────────
  const [products, setProducts] = useState<DropdownOption[]>([]);
  const [subProducts, setSubProducts] = useState<DropdownOption[]>([]);
  const [insurers, setInsurers] = useState<DropdownOption[]>([]);
  const [policyTypes, setPolicyTypes] = useState<{ id: string; name: string }[]>([]);
  const [subBrokers, setSubBrokers] = useState<DropdownOption[]>([]);
  const [addOnCoverages, setAddOnCoverages] = useState<{ id: string; add_on_name: string }[]>([]);
  const [loading, setLoading] = useState({
    products: false, subProducts: false, insurers: false, policyTypes: false, subBrokers: false, addOns: false,
  });

  const update = useCallback((patch: Partial<MotorWizardData>) => {
    setData((prev) => ({ ...prev, ...patch }));
  }, []);

  // Load existing policy for edit mode
  useEffect(() => {
    if (!editPolicyId) return;
    setLoadingPolicy(true);
    policyService
      .get(editPolicyId)
      .then((r) => {
        const policy = r.data.data.policy;
        setPolicyId(editPolicyId);
        setData((prev) => ({ ...prev, ...mapPolicyToWizardData(policy) }));
      })
      .catch(() => toast.error('Failed to load policy'))
      .finally(() => setLoadingPolicy(false));
  }, [editPolicyId, toast]);

  // Resolve fixed Motor LOB + default dates on mount (create only)
  useEffect(() => {
    if (editPolicyId) return;
    (async () => {
      try {
        const res = await masterDataService.getLobs({ is_active: true });
        const lobs = res.data.data.lobs || [];
        const motor = lobs.find((l: { id: string; name: string }) => /motor/i.test(l.name));
        if (motor) update({ lob_id: motor.id });
      } catch { /* handled by empty state */ }
    })();
    // default dates
    const today = new Date();
    const toInput = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const end = new Date(today);
    end.setFullYear(end.getFullYear() + 1);
    end.setDate(end.getDate() - 1);
    update({ start_date: toInput(today), issue_date: toInput(today), end_date: toInput(end) });
  }, [update, editPolicyId]);

  // Load product-independent masters
  useEffect(() => {
    setLoading((l) => ({ ...l, insurers: true, policyTypes: true, subBrokers: true, addOns: true }));
    masterDataService.getInsuranceCompanies({ is_active: true })
      .then((r) => setInsurers((r.data.data.insurance_companies || []).map((c: { id: string; name: string }) => ({ value: c.id, label: c.name }))))
      .finally(() => setLoading((l) => ({ ...l, insurers: false })));
    policyService.getPolicyTypes()
      .then((r) => setPolicyTypes(r.data.data.policy_types || []))
      .finally(() => setLoading((l) => ({ ...l, policyTypes: false })));
    subBrokerService.list({ status: 'ACTIVE', limit: 100 })
      .then((r) => {
        const list = r.data.data.brokers || [];
        setSubBrokers(list.map((b: { id: string; full_name: string; phone: string }) => ({ value: b.id, label: b.full_name, sublabel: b.phone })));
      })
      .finally(() => setLoading((l) => ({ ...l, subBrokers: false })));
    motorMastersService.getAddOnCoverages({ is_active: true, limit: 100 })
      .then((r) => {
        const payload = r.data.data;
        const list = Array.isArray(payload) ? payload : payload?.data || payload?.add_on_coverages || [];
        setAddOnCoverages(list);
      })
      .finally(() => setLoading((l) => ({ ...l, addOns: false })));
  }, []);

  // Load products when LOB resolved
  useEffect(() => {
    if (!data.lob_id) return;
    setLoading((l) => ({ ...l, products: true }));
    masterDataService.getProducts({ lob_id: data.lob_id, is_active: true })
      .then((r) => setProducts((r.data.data.products || []).map((p: { id: string; name: string }) => ({ value: p.id, label: p.name }))))
      .finally(() => setLoading((l) => ({ ...l, products: false })));
  }, [data.lob_id]);

  // Load sub-products when product changes
  useEffect(() => {
    if (!data.product_id) { setSubProducts([]); return; }
    setLoading((l) => ({ ...l, subProducts: true }));
    masterDataService.getSubProducts({ product_id: data.product_id, is_active: true })
      .then((r) => setSubProducts((r.data.data.sub_products || []).map((s: { id: string; name: string }) => ({ value: s.id, label: s.name }))))
      .finally(() => setLoading((l) => ({ ...l, subProducts: false })));
  }, [data.product_id]);

  const masters = useMemo(() => ({
    products, subProducts, insurers, policyTypes, subBrokers, addOnCoverages,
    loadingProducts: loading.products,
    loadingSubProducts: loading.subProducts,
    loadingInsurers: loading.insurers,
    loadingPolicyTypes: loading.policyTypes,
    loadingSubBrokers: loading.subBrokers,
    loadingAddOns: loading.addOns,
  }), [products, subProducts, insurers, policyTypes, subBrokers, addOnCoverages, loading]);

  // ── Step config ────────────────────────────────────────────────────────────
  const STEPS = useMemo(() => {
    const base = [
      { id: 1, label: 'Policy Details', icon: FileText },
      { id: 2, label: 'Vehicle & Cover', icon: Car },
      { id: 3, label: 'Premium', icon: Calculator },
      { id: 4, label: 'Claims History', icon: FileCheck2 },
    ];
    if (canCommission) base.push({ id: 5, label: 'Commission', icon: BadgeIndianRupee });
    return base;
  }, [canCommission]);

  const lastStep = STEPS[STEPS.length - 1].id;

  // ── Validation ──────────────────────────────────────────────────────────────
  const validateStep = (s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!data.customer) e.customer = 'Select a customer';
      if (!data.policy_number.trim()) e.policy_number = 'Policy number is required';
      else if (data.policy_number_status === 'taken') e.policy_number = 'This policy number already exists';
      if (!data.product_id) e.product_id = 'Select a product';
      if (!data.policy_type_id) e.policy_type_id = 'Select a policy type';
      if (!data.start_date) e.start_date = 'Start date is required';
      if (!data.end_date) e.end_date = 'End date is required';
      if (data.referred_by_type === 'SUB_BROKER' && !data.referred_by_sub_broker_id) e.referred_by_sub_broker_id = 'Select a sub-broker';
      if (data.referred_by_type === 'CUSTOMER' && !data.referred_by_customer_id) e.referred_by_customer_id = 'Select a customer';
    }
    if (s === 2) {
      if (!data.vehicle_id) e.vehicle_id = 'Select or add a vehicle';
      if (!data.insurance_company_id) e.insurance_company_id = 'Select an insurance company';
      if (!data.package_type) e.package_type = 'Select a package type';
      if (!data.idv) e.idv = 'IDV is required';
    }
    if (s === 3) {
      if (!data.payment_mode) e.payment_mode = 'Select a payment mode';
      if (!data.is_full_payment && !data.amount_received) e.amount_received = 'Enter amount received';
    }
    if (s === 5 && data.share_with_sub_broker && !data.referred_by_sub_broker_id) {
      e.share = 'A sub-broker referral is required to share commission';
    }
    return e;
  };

  // ── Payload builder ──────────────────────────────────────────────────────────
  const buildPayload = (): PolicyPayload => ({
    customer_id: data.customer?.id || '',
    policy_number: data.policy_number.trim(),
    lob_id: data.lob_id || undefined,
    product_id: data.product_id || undefined,
    sub_product_id: data.sub_product_id || undefined,
    insurance_company_id: data.insurance_company_id || undefined,
    policy_type_id: data.policy_type_id || undefined,
    vehicle_id: data.vehicle_id || undefined,
    referred_by_type: data.referred_by_type,
    referred_by_sub_broker_id: data.referred_by_type === 'SUB_BROKER' ? data.referred_by_sub_broker_id || undefined : undefined,
    referred_by_customer_id: data.referred_by_type === 'CUSTOMER' ? data.referred_by_customer_id || undefined : undefined,
    start_date: data.start_date || undefined,
    end_date: data.end_date || undefined,
    issue_date: data.issue_date || undefined,
    notes: data.notes || undefined,
    motor_detail: {
      package_type: data.package_type || undefined,
      idv: num(data.idv),
      electric_accessory_idv: num(data.electric_accessory_idv),
      non_electric_accessory_idv: num(data.non_electric_accessory_idv),
      od_start_date: data.start_date || undefined,
      od_end_date: data.end_date || undefined,
      tp_start_date: data.start_date || undefined,
      tp_end_date: data.tp_end_date || data.end_date || undefined,
      rate_source: data.rate_source,
      basic_premium: num(data.basic_premium),
      discount_percent: num(data.discount_percent),
      basic_after_discount: num(data.basic_after_discount),
      ncb_percent: num(data.ncb_percent),
      od_premium: num(data.od_premium),
      tp_premium: num(data.tp_premium),
      addon_premium: num(data.addon_premium),
      total_od_premium: num(data.total_od_premium),
      net_premium: num(data.net_premium),
      gst_on_od: num(data.gst_on_od),
      gst_on_tp: num(data.gst_on_tp),
      total_gst: num(data.total_gst),
      total_premium: num(data.total_premium),
      pa_owner: data.pa_owner,
      pa_passenger_1l: data.pa_passenger_1l,
      pa_passenger_2l: data.pa_passenger_2l,
      paid_driver: data.paid_driver,
      payment_mode: data.payment_mode || undefined,
      payment_reference: data.payment_reference || undefined,
      is_full_payment: data.is_full_payment,
      amount_received: data.is_full_payment ? undefined : num(data.amount_received),
    },
    add_ons: data.add_ons.filter((a) => a.checked).map((a) => ({
      add_on_coverage_id: a.add_on_coverage_id,
      add_on_name: a.add_on_name,
      amount: num(a.amount),
    })),
    documents: [
      ...data.policy_documents.filter((d) => d.file_url).map((d) => ({ ...d, category: 'POLICY_PDF' })),
      ...data.claim_documents.filter((d) => d.file_url).map((d) => ({ ...d, category: 'CLAIM' })),
    ],
    previous_policy: (data.previous_policy_number || data.claim_status)
      ? {
          previous_policy_number: data.previous_policy_number || undefined,
          previous_insurance_company_id: data.previous_insurance_company_id || undefined,
          claim_status: data.claim_status || undefined,
          claim_amount: num(data.claim_amount),
          claim_description: data.claim_description || undefined,
        }
      : undefined,
  });

  // ── Persistence ──────────────────────────────────────────────────────────────
  const persist = async (reason?: string): Promise<string | null> => {
    const payload = buildPayload();
    setSaving(true);
    try {
      if (requestMode && policyId) {
        await policyService.createChangeRequest(policyId, {
          request_type: 'EDIT',
          payload,
          reason: reason || undefined,
        });
        toast.success('Edit request submitted for admin approval');
        navigate(`/${company_slug}/policies/${policyId}`);
        return policyId;
      }
      if (policyId) {
        await policyService.update(policyId, payload);
        return policyId;
      }
      const res = await policyService.create(payload);
      const id = res.data.data.policy.id as string;
      setPolicyId(id);
      return id;
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save policy';
      toast.error(msg);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const runSave = async (action: 'save' | 'finalize', reason?: string) => {
    if (action === 'save') {
      const e = validateStep(1);
      setErrors(e);
      if (Object.keys(e).length) { setStep(1); return; }
      const id = await persist(reason);
      if (id && !requestMode) toast.success(isEditMode ? 'Policy updated' : 'Draft saved successfully');
      if (id && isEditMode && !requestMode) navigate(`/${company_slug}/policies/${id}`);
    } else if (isEditMode) {
      const e = validateStep(lastStep);
      setErrors(e);
      if (Object.keys(e).length) return;
      const id = await persist(reason);
      if (id && !requestMode) {
        toast.success('Policy updated successfully');
        navigate(`/${company_slug}/policies/${id}`);
      }
    }
  };

  const promptRequestReason = (action: 'save' | 'finalize') => {
    setPendingAction(action);
    setRequestReason('');
    setRequestDialogOpen(true);
  };

  const confirmRequest = async () => {
    setRequestDialogOpen(false);
    if (pendingAction) await runSave(pendingAction, requestReason.trim() || undefined);
    setPendingAction(null);
  };

  const buildCommissionPayload = () => {
    const odAmt = num(data.commission_od.amount) || 0;
    const tpAmt = num(data.commission_tp.amount) || 0;
    const addonAmt = num(data.commission_addon.amount) || 0;
    const items = [
      { component_type: 'OD' as const, base_amount: num(data.total_od_premium), percentage: num(data.commission_od.percentage), commission_amount: odAmt },
      { component_type: 'TP' as const, base_amount: num(data.tp_premium), percentage: num(data.commission_tp.percentage), commission_amount: tpAmt },
      { component_type: 'ADDON' as const, base_amount: num(data.addon_premium), percentage: num(data.commission_addon.percentage), commission_amount: addonAmt },
    ];
    const shareItems = [
      { component_type: 'OD' as const, percentage: num(data.share_od.percentage), commission_amount: num(data.share_od.amount) || 0 },
      { component_type: 'TP' as const, percentage: num(data.share_tp.percentage), commission_amount: num(data.share_tp.amount) || 0 },
      { component_type: 'ADDON' as const, percentage: num(data.share_addon.percentage), commission_amount: num(data.share_addon.amount) || 0 },
    ];
    const shareTotal = shareItems.reduce((s, it) => s + (it.commission_amount || 0), 0);
    return {
      our_commission: { items, total_commission_amount: odAmt + tpAmt + addonAmt, notes: data.commission_notes || undefined },
      sub_broker_share: data.share_with_sub_broker
        ? {
            enabled: true,
            sub_broker_id: data.referred_by_sub_broker_id || undefined,
            commission_basis: data.share_basis === 'PREMIUM' ? 'PREMIUM_PERCENTAGE' as const : 'COMMISSION_PERCENTAGE' as const,
            items: shareItems,
            total_commission_amount: shareTotal,
          }
        : undefined,
    };
  };

  const goNext = async () => {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length) return;
    setStep((s) => Math.min(s + 1, lastStep));
  };

  const goBack = () => {
    setErrors({});
    setStep((s) => Math.max(s - 1, 1));
  };

  const handleSaveDraft = async () => {
    if (requestMode) { promptRequestReason('save'); return; }
    await runSave('save');
  };

  const handleFinalize = async () => {
    if (isEditMode) {
      if (requestMode) { promptRequestReason('finalize'); return; }
      const e = validateStep(lastStep);
      setErrors(e);
      if (Object.keys(e).length) return;

      const id = await persist();
      if (!id) return;

      if (canCommission && lastStep === 5) {
        setFinalizing(true);
        try {
          await policyService.finalizeCommission(id, buildCommissionPayload());
          toast.success('Policy updated successfully');
          navigate(`/${company_slug}/policies/${id}`);
        } catch (err) {
          const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to update commission';
          toast.error(msg);
        } finally {
          setFinalizing(false);
        }
      } else {
        toast.success('Policy updated successfully');
        navigate(`/${company_slug}/policies/${id}`);
      }
      return;
    }

    const e = validateStep(5);
    setErrors(e);
    if (Object.keys(e).length) return;

    const id = await persist();
    if (!id) return;

    setFinalizing(true);
    try {
      await policyService.finalizeCommission(id, buildCommissionPayload());
      toast.success('Policy created successfully');
      navigate(`/${company_slug}/policies`);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to finalize policy';
      toast.error(msg);
    } finally {
      setFinalizing(false);
    }
  };

  if (loadingPolicy) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stepProps = { data, update, errors, masters, excludePolicyId: editPolicyId };

  return (
    <div className="flex h-full flex-col">
      <Header
        title={isEditMode ? (requestMode ? 'Request Policy Edit' : 'Edit Motor Policy') : 'New Motor Policy'}
        subtitle={isEditMode ? 'Update policy details' : 'Create a comprehensive motor insurance policy'}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(isEditMode ? `/${company_slug}/policies/${editPolicyId}` : `/${company_slug}/policies/create`)}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> {isEditMode ? 'Back to Policy' : 'Change LOB'}
        </Button>
      </Header>

      {/* Stepper */}
      <div className="border-b border-border/60 bg-card/40 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const done = step > s.id;
            const active = step === s.id;
            return (
              <div key={s.id} className="flex flex-1 items-center last:flex-none">
                <button
                  type="button"
                  onClick={() => s.id < step && setStep(s.id)}
                  className="flex items-center gap-2.5"
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-xl border-2 transition-all',
                      active && 'border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25',
                      done && 'border-primary bg-primary/10 text-primary',
                      !active && !done && 'border-border bg-background text-muted-foreground',
                    )}
                  >
                    {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className={cn('hidden text-sm font-semibold sm:block', active ? 'text-foreground' : 'text-muted-foreground')}>
                    {s.label}
                  </span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={cn('mx-3 h-0.5 flex-1 rounded-full transition-colors', step > s.id ? 'bg-primary' : 'bg-border')} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
            >
              {step === 1 && <Step1Basics {...stepProps} />}
              {step === 2 && <Step2Vehicle {...stepProps} />}
              {step === 3 && <Step3Premium {...stepProps} />}
              {step === 4 && <Step4Claims {...stepProps} />}
              {step === 5 && <Step5Commission {...stepProps} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border/60 bg-card/40 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Button variant="outline" onClick={goBack} disabled={step === 1 || saving || finalizing} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>

          <div className="flex items-center gap-2">
            {!canCommission && step === lastStep ? (
              <Button onClick={handleSaveDraft} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isEditMode ? (requestMode ? 'Submit Edit Request' : 'Save Changes') : 'Save Draft'}
              </Button>
            ) : step === lastStep ? (
              <Button onClick={handleFinalize} disabled={finalizing || saving} className="gap-2">
                {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {isEditMode ? (requestMode ? 'Submit Edit Request' : 'Save Changes') : 'Create Policy'}
              </Button>
            ) : (
              <>
                {step >= 1 && (
                  <Button variant="outline" onClick={handleSaveDraft} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isEditMode ? 'Save Changes' : 'Save Draft'}
                  </Button>
                )}
                <Button onClick={goNext} disabled={saving} className="gap-2">
                  Next <ArrowRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Edit Request</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Your changes will be sent to an admin for approval before they are applied.
          </p>
          <textarea
            value={requestReason}
            onChange={(e) => setRequestReason(e.target.value)}
            placeholder="Reason for this change (optional)"
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestDialogOpen(false)}>Cancel</Button>
            <Button onClick={confirmRequest} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
