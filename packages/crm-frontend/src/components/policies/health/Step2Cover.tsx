import { useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Building2, HeartPulse, Users, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { customerService } from '@/services/customerService';
import { Field, Section, SearchableDropdown, inputCls } from '../shared';
import type { HealthMemberRow, StepProps } from './types';

const RELATION_LABELS: Record<string, string> = {
  SELF: 'Self',
  SPOUSE: 'Spouse',
  SON: 'Son',
  DAUGHTER: 'Daughter',
  FATHER: 'Father',
  MOTHER: 'Mother',
  BROTHER: 'Brother',
  SISTER: 'Sister',
  OTHER: 'Other',
};

const customerToMember = (c: Record<string, unknown>): HealthMemberRow => ({
  customer_id: String(c.id),
  relation: c.family_relation ? String(c.family_relation) : 'SELF',
  member_name: String(c.customer_name),
  member_phone: String(c.customer_phone || ''),
  member_email: String(c.customer_email || ''),
  member_age: c.age != null ? String(c.age) : '',
  is_covered: true,
});

const proposerAsMember = (customer: NonNullable<StepProps['data']['customer']>): HealthMemberRow => ({
  customer_id: customer.id,
  relation: 'SELF',
  member_name: customer.customer_name,
  member_phone: customer.customer_phone || '',
  member_email: customer.customer_email || '',
  member_age: '',
  is_covered: true,
});

export default function Step2Cover({ data, update, errors, masters, policyId, isEditMode, onEnsureDraft }: StepProps) {
  const { company_slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const familyCode = data.customer?.family_code;
  const savedMembersRef = useRef<HealthMemberRow[]>([]);

  useEffect(() => {
    savedMembersRef.current = data.family_members;
  }, [data.family_members]);

  useEffect(() => {
    if (!data.customer?.id) {
      update({ family_members: [], members_loaded: false });
      return;
    }

    if (!familyCode) {
      update({
        family_members: [proposerAsMember(data.customer)],
        members_loaded: true,
      });
      return;
    }

    let cancelled = false;
    update({ members_loaded: false });
    customerService.list({ family_code: familyCode, limit: 50 })
      .then((res) => {
        if (cancelled) return;
        const customers = (res.data.data.customers || []) as Record<string, unknown>[];
        let fromApi = customers.map(customerToMember);
        const proposerId = data.customer!.id;
        if (!fromApi.some((m) => m.customer_id === proposerId)) {
          fromApi = [proposerAsMember(data.customer!), ...fromApi];
        }
        const savedByCustomer = Object.fromEntries(
          savedMembersRef.current.filter((m) => m.customer_id).map((m) => [m.customer_id, m]),
        );
        update({
          family_members: fromApi.map((m) => savedByCustomer[m.customer_id] || m),
          members_loaded: true,
        });
      })
      .catch(() => {
        if (!cancelled) {
          update({
            family_members: [proposerAsMember(data.customer!)],
            members_loaded: true,
          });
        }
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.customer?.id, familyCode, location.key]);

  const onInsurerChange = (v: string) => {
    update({ insurance_company_id: v, health_plan_id: '' });
  };

  const toggleMember = (customerId: string) => {
    update({
      family_members: data.family_members.map((m) =>
        m.customer_id === customerId ? { ...m, is_covered: !m.is_covered } : m,
      ),
    });
  };

  const toggleAll = (checked: boolean) => {
    update({ family_members: data.family_members.map((m) => ({ ...m, is_covered: checked })) });
  };

  const allCovered = data.family_members.length > 0 && data.family_members.every((m) => m.is_covered);
  const someCovered = data.family_members.some((m) => m.is_covered);

  const addFamilyMember = async () => {
    if (!familyCode) return;
    let draftId = policyId;
    if (!draftId && onEnsureDraft) {
      draftId = await onEnsureDraft();
      if (!draftId) return;
    }
    const returnPath = isEditMode
      ? `policies/${draftId}/edit?step=2`
      : `policies/create/health?draftId=${draftId || ''}&step=2`;
    const returnTo = encodeURIComponent(returnPath);
    navigate(`/${company_slug}/customers/create?family_code=${familyCode}&returnTo=${returnTo}`);
  };

  return (
    <div className="space-y-5">
      <Section title="Insurer & Plan" description="Select insurance company and health plan" icon={<Building2 className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Insurance Company" required error={errors.insurance_company_id}>
            <SearchableDropdown
              value={data.insurance_company_id}
              onChange={onInsurerChange}
              options={masters.insurers}
              loading={masters.loadingInsurers}
              placeholder="Select insurance company"
              error={errors.insurance_company_id}
            />
          </Field>

          <Field label="Health Plan" required={masters.healthPlans.length > 0} error={errors.health_plan_id}>
            <SearchableDropdown
              value={data.health_plan_id}
              onChange={(v) => update({ health_plan_id: v })}
              options={masters.healthPlans}
              loading={masters.loadingHealthPlans}
              disabled={!data.insurance_company_id}
              placeholder={
                !data.insurance_company_id
                  ? 'Select insurer first'
                  : masters.healthPlans.length
                    ? 'Select health plan'
                    : 'No plans for this insurer (optional — add in Master Data)'
              }
              error={errors.health_plan_id}
            />
            {data.insurance_company_id && !masters.loadingHealthPlans && masters.healthPlans.length === 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                No health plans linked to this insurer. You can continue without a plan or add one under Master Data → Health Plans.
              </p>
            )}
          </Field>

          <Field label="Deductible">
            <input type="number" value={data.deductible} onChange={(e) => update({ deductible: e.target.value })} placeholder="₹" className={inputCls} />
          </Field>

          <Field label="Sum Insured" required error={errors.sum_insured}>
            <input type="number" value={data.sum_insured} onChange={(e) => update({ sum_insured: e.target.value })} placeholder="₹" className={cn(inputCls, errors.sum_insured && 'border-destructive')} />
          </Field>

          <Field label="Cumulative Bonus">
            <input type="number" value={data.cumulative_bonus} onChange={(e) => update({ cumulative_bonus: e.target.value })} placeholder="₹" className={inputCls} />
          </Field>
        </div>
      </Section>

      <Section
        title="Family Members"
        description={familyCode ? `Members under family code ${familyCode}` : 'Select a customer with a family code'}
        icon={<Users className="h-4 w-4" />}
        action={
          familyCode ? (
            <button
              type="button"
              onClick={addFamilyMember}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" /> Add Family Member
            </button>
          ) : null
        }
      >
        {!data.customer ? (
          <p className="text-sm text-muted-foreground">Select a customer in step 1 to load family members.</p>
        ) : !data.members_loaded ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading family members…
          </div>
        ) : data.family_members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No family members found. Use Add Family Member to create one.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 text-left">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={allCovered}
                        ref={(el) => { if (el) el.indeterminate = someCovered && !allCovered; }}
                        onChange={(e) => toggleAll(e.target.checked)}
                        className="h-4 w-4 rounded border-border"
                      />
                      Covered
                    </label>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold">Name</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Relation</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Age</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Phone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {data.family_members.map((m) => (
                  <tr key={m.customer_id}>
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={m.is_covered}
                        onChange={() => toggleMember(m.customer_id)}
                        className="h-4 w-4 rounded border-border"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{m.member_name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{RELATION_LABELS[m.relation] || m.relation || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{m.member_age || '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{m.member_phone || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {errors.family_members && (
              <p className="px-3 py-2 text-[11px] font-medium text-destructive">{errors.family_members}</p>
            )}
          </div>
        )}
      </Section>

      <Section title="Cover Summary" icon={<HeartPulse className="h-4 w-4" />}>
        <p className="text-sm text-muted-foreground">
          {someCovered
            ? `${data.family_members.filter((m) => m.is_covered).length} of ${data.family_members.length} member(s) covered`
            : 'No members selected for cover'}
          {data.sum_insured ? ` • Sum insured ₹${Number(data.sum_insured).toLocaleString('en-IN')}` : ''}
        </p>
      </Section>
    </div>
  );
}
