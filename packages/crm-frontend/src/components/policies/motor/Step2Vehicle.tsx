import { useEffect, useState, useCallback, useRef } from 'react';
import { Car, Plus, Pencil, Building2, Package, ShieldPlus, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { vehicleService, type Vehicle } from '@/services/vehicleService';
import { Field, Section, SearchableDropdown, inputCls, inr } from './shared';
import { PACKAGE_TYPES, getPackageTpYears, addYearsMinusOneDay, PA_RATES } from '@/constants/motor';
import type { StepProps, AddOnSelection } from './types';
import VehicleFormModal from './VehicleFormModal';

export default function Step2Vehicle({ data, update, errors, masters }: StepProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);

  const customerId = data.customer?.id;

  const loadVehicles = useCallback(() => {
    if (!customerId) return;
    setLoadingVehicles(true);
    vehicleService.listByCustomer(customerId)
      .then((r) => setVehicles(r.data.data.vehicles || []))
      .finally(() => setLoadingVehicles(false));
  }, [customerId]);

  useEffect(() => { loadVehicles(); }, [loadVehicles]);

  const addOnsMergedRef = useRef(false);

  // Merge saved add-ons (edit mode) with the full master list
  useEffect(() => {
    if (!masters.addOnCoverages.length) return;

    const needsFullList = data.add_ons.length !== masters.addOnCoverages.length
      || data.add_ons.some((a) => !masters.addOnCoverages.some((c) => c.id === a.add_on_coverage_id));

    if (!needsFullList && addOnsMergedRef.current) return;

    const selections: AddOnSelection[] = masters.addOnCoverages.map((c) => {
      const saved = data.add_ons.find((a) => a.add_on_coverage_id === c.id);
      return saved
        ? { ...saved, add_on_name: c.add_on_name }
        : { add_on_coverage_id: c.id, add_on_name: c.add_on_name, checked: false, amount: '' };
    });

    addOnsMergedRef.current = true;
    update({ add_ons: selections });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masters.addOnCoverages]);

  const seating = data.vehicle?.seating_capacity || 0;

  const onSelectPackage = (value: string) => {
    const years = getPackageTpYears(value);
    update({ package_type: value, tp_end_date: years > 1 ? addYearsMinusOneDay(data.start_date, years) : data.end_date });
  };

  const toggleAddOn = (id: string) => {
    update({ add_ons: data.add_ons.map((a) => (a.add_on_coverage_id === id ? { ...a, checked: !a.checked } : a)) });
  };
  const setAddOnAmount = (id: string, amount: string) => {
    update({ add_ons: data.add_ons.map((a) => (a.add_on_coverage_id === id ? { ...a, amount } : a)) });
  };

  const onSaved = (v: Vehicle) => {
    setModalOpen(false);
    setEditing(null);
    loadVehicles();
    update({ vehicle_id: v.id, vehicle: v });
  };

  return (
    <div className="space-y-5">
      {/* Vehicle selection */}
      <Section
        title="Select Vehicle"
        description="Choose an existing vehicle or add a new one"
        icon={<Car className="h-4 w-4" />}
        action={
          <button
            type="button"
            onClick={() => { setEditing(null); setModalOpen(true); }}
            disabled={!customerId}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add Vehicle
          </button>
        }
      >
        {errors.vehicle_id && <p className="mb-2 text-[11px] font-medium text-destructive">{errors.vehicle_id}</p>}
        {loadingVehicles ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading vehicles…
          </div>
        ) : vehicles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 py-8 text-center">
            <Car className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No vehicles for this customer yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {vehicles.map((v) => {
              const blocked = v.has_active_policy && v.id !== data.vehicle_id;
              const selected = v.id === data.vehicle_id;
              return (
                <div
                  key={v.id}
                  onClick={() => !blocked && update({ vehicle_id: v.id, vehicle: v })}
                  className={cn(
                    'cursor-pointer rounded-xl border-2 p-4 transition-all',
                    selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                    blocked && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">{v.registration_number}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[v.make?.make_name, v.model?.model_name, v.variant?.variant_name].filter(Boolean).join(' ') || '—'}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {[v.fuel_type, v.cubic_capacity && `${v.cubic_capacity} CC`, v.seating_capacity && `${v.seating_capacity} seats`].filter(Boolean).join(' • ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {selected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditing(v); setModalOpen(true); }}
                        className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {blocked && (
                    <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-amber-600">
                      <AlertCircle className="h-3 w-3" /> Already has an active policy
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Insurer & package */}
      <Section title="Policy Coverage" description="Insurer, package type and insured value" icon={<Building2 className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Insurance Company" required error={errors.insurance_company_id}>
            <SearchableDropdown
              value={data.insurance_company_id}
              onChange={(v) => update({ insurance_company_id: v })}
              options={masters.insurers}
              loading={masters.loadingInsurers}
              placeholder="Select insurer"
              error={errors.insurance_company_id}
            />
          </Field>

          <Field label="Package Type" required error={errors.package_type}>
            <SearchableDropdown
              value={data.package_type}
              onChange={onSelectPackage}
              options={PACKAGE_TYPES.map((p) => ({ value: p.value, label: p.label }))}
              searchable={false}
              placeholder="Select package"
              error={errors.package_type}
            />
          </Field>

          {getPackageTpYears(data.package_type) > 1 && (
            <Field label="TP End Date" hint={`Long-term TP cover for ${getPackageTpYears(data.package_type)} years`}>
              <input type="date" value={data.tp_end_date} onChange={(e) => update({ tp_end_date: e.target.value })} className={inputCls} />
            </Field>
          )}

          <Field label="Insured Declared Value (IDV)" required error={errors.idv}>
            <input type="number" value={data.idv} onChange={(e) => update({ idv: e.target.value })} placeholder="₹" className={cn(inputCls, errors.idv && 'border-destructive')} />
          </Field>

          <Field label="Electric Accessory IDV">
            <input type="number" value={data.electric_accessory_idv} onChange={(e) => update({ electric_accessory_idv: e.target.value })} placeholder="₹" className={inputCls} />
          </Field>

          <Field label="Non-Electric Accessory IDV">
            <input type="number" value={data.non_electric_accessory_idv} onChange={(e) => update({ non_electric_accessory_idv: e.target.value })} placeholder="₹" className={inputCls} />
          </Field>
        </div>
      </Section>

      {/* Personal Accident */}
      <Section title="Personal Accident Cover" description="Mandatory PA section (amounts use seating capacity)" icon={<ShieldPlus className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <PaRow label="Owner PA" checked={data.pa_owner} onToggle={() => update({ pa_owner: !data.pa_owner })} />
          <PaRow
            label="Passenger PA (₹1 Lakh)"
            checked={data.pa_passenger_1l}
            amount={seating * PA_RATES.passenger1Lakh}
            onToggle={() => update({ pa_passenger_1l: !data.pa_passenger_1l, pa_passenger_2l: false })}
          />
          <PaRow
            label="Passenger PA (₹2 Lakh)"
            checked={data.pa_passenger_2l}
            amount={seating * PA_RATES.passenger2Lakh}
            onToggle={() => update({ pa_passenger_2l: !data.pa_passenger_2l, pa_passenger_1l: false })}
          />
          <PaRow
            label="Paid Driver"
            checked={data.paid_driver}
            amount={PA_RATES.paidDriver}
            onToggle={() => update({ paid_driver: !data.paid_driver })}
          />
        </div>
        {seating === 0 && (
          <p className="mt-2 text-[11px] text-amber-600">Set the vehicle's seating capacity to compute passenger PA amounts.</p>
        )}
      </Section>

      {/* Add-on coverages */}
      <Section title="Add-on Coverages" description="Select applicable riders" icon={<Package className="h-4 w-4" />}>
        {masters.loadingAddOns ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : data.add_ons.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No add-on coverages configured.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.add_ons.map((a) => (
              <div key={a.add_on_coverage_id} className={cn('flex items-center gap-2 rounded-xl border p-2.5', a.checked ? 'border-primary/40 bg-primary/5' : 'border-border')}>
                <label className="flex flex-1 cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={a.checked} onChange={() => toggleAddOn(a.add_on_coverage_id)} className="h-4 w-4 rounded border-border" />
                  <span className="text-sm text-foreground">{a.add_on_name}</span>
                </label>
                {a.checked && (
                  <input
                    type="number"
                    value={a.amount}
                    onChange={(e) => setAddOnAmount(a.add_on_coverage_id, e.target.value)}
                    placeholder="₹"
                    className="h-8 w-24 rounded-lg border border-border/70 bg-background px-2 text-sm outline-none focus:border-primary/60"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {modalOpen && customerId && (
        <VehicleFormModal
          customerId={customerId}
          vehicle={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function PaRow({ label, checked, amount, onToggle }: { label: string; checked: boolean; amount?: number; onToggle: () => void }) {
  return (
    <div className={cn('flex items-center justify-between gap-2 rounded-xl border p-2.5', checked ? 'border-primary/40 bg-primary/5' : 'border-border')}>
      <label className="flex flex-1 cursor-pointer items-center gap-2">
        <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 rounded border-border" />
        <span className="text-sm text-foreground">{label}</span>
      </label>
      {checked && amount !== undefined && amount > 0 && (
        <span className="text-xs font-semibold text-primary">₹{inr(amount)}</span>
      )}
    </div>
  );
}
