import { FileCheck2, History, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Field, Section, SearchableDropdown, DocumentList, inputCls } from './shared';
import { CLAIM_STATUSES } from '@/constants/motor';
import type { StepProps } from './types';

export default function Step4Claims({ data, update, masters }: StepProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        This step is optional. Capture the previous policy and any claim history.
      </div>

      <Section title="Previous Policy" description="Prior insurance details" icon={<History className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Previous Policy Number" hint="Auto-filled for Renew / Port">
            <input
              value={data.previous_policy_number}
              onChange={(e) => update({ previous_policy_number: e.target.value })}
              placeholder="Previous policy number"
              className={inputCls}
            />
          </Field>
          <Field label="Previous Insurance Company">
            <SearchableDropdown
              value={data.previous_insurance_company_id}
              onChange={(v) => update({ previous_insurance_company_id: v })}
              options={masters.insurers}
              loading={masters.loadingInsurers}
              placeholder="Select insurer"
            />
          </Field>
        </div>
      </Section>

      <Section title="Claim History" description="Record any prior claims" icon={<FileCheck2 className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Claim Status">
            <SearchableDropdown
              value={data.claim_status}
              onChange={(v) => update({ claim_status: v })}
              options={CLAIM_STATUSES}
              searchable={false}
              placeholder="Select status"
            />
          </Field>
          <Field label="Claim Amount">
            <input type="number" value={data.claim_amount} onChange={(e) => update({ claim_amount: e.target.value })} placeholder="₹" className={inputCls} />
          </Field>
          <Field label="Claim Description" className="sm:col-span-2">
            <textarea
              value={data.claim_description}
              onChange={(e) => update({ claim_description: e.target.value })}
              rows={3}
              placeholder="Describe the claim (optional)"
              className={cn(inputCls, 'h-auto py-2')}
            />
          </Field>
        </div>
      </Section>

      <Section title="Documents" description="Attach claim-related documents" icon={<Paperclip className="h-4 w-4" />}>
        <DocumentList documents={data.claim_documents} onChange={(docs) => update({ claim_documents: docs })} label="Attach document" />
      </Section>
    </div>
  );
}
