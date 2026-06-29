import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Car, Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toaster';
import { motorMastersService } from '@/services/motorMastersService';
import { vehicleService, type Vehicle } from '@/services/vehicleService';
import { FUEL_TYPES } from '@/constants/motor';
import { Field, SearchableDropdown, inputCls, type DropdownOption } from './shared';

interface VehicleFormModalProps {
  customerId: string;
  vehicle?: Vehicle | null;
  onClose: () => void;
  onSaved: (v: Vehicle) => void;
}

interface FormState {
  registration_number: string;
  is_new_registration: boolean;
  rto_code_id: string;
  chassis_last6: string;
  make_id: string;
  model_id: string;
  variant_id: string;
  manufacture_year: string;
  registration_date: string;
  fuel_type: string;
  cubic_capacity: string;
  battery_capacity: string;
  seating_capacity: string;
}

const emptyForm: FormState = {
  registration_number: '', is_new_registration: false, rto_code_id: '', chassis_last6: '',
  make_id: '', model_id: '', variant_id: '', manufacture_year: '', registration_date: '',
  fuel_type: '', cubic_capacity: '', battery_capacity: '', seating_capacity: '',
};

const toRtoOption = (c: { id: string; rto_code: string; rto_name: string; city: string }): DropdownOption => ({
  value: c.id,
  label: `${c.rto_code} — ${c.rto_name}`,
  sublabel: c.city,
});

export default function VehicleFormModal({ customerId, vehicle, onClose, onSaved }: VehicleFormModalProps) {
  const toast = useToast();
  const isEdit = !!vehicle;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [rtoCodes, setRtoCodes] = useState<DropdownOption[]>([]);
  const [makes, setMakes] = useState<DropdownOption[]>([]);
  const [models, setModels] = useState<DropdownOption[]>([]);
  const [variants, setVariants] = useState<DropdownOption[]>([]);
  const [loading, setLoading] = useState({ rto: false, makes: false, models: false, variants: false });
  const selectedRtoIdRef = useRef('');

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    selectedRtoIdRef.current = form.rto_code_id;
  }, [form.rto_code_id]);

  useEffect(() => {
    if (vehicle) {
      setForm({
        registration_number: vehicle.registration_number === 'NOT APPLICABLE' ? '' : vehicle.registration_number || '',
        is_new_registration: vehicle.is_new_registration,
        rto_code_id: vehicle.rto_code_id || '',
        chassis_last6: vehicle.chassis_last6 || '',
        make_id: vehicle.make_id || '',
        model_id: vehicle.model_id || '',
        variant_id: vehicle.variant_id || '',
        manufacture_year: vehicle.manufacture_year ? String(vehicle.manufacture_year) : '',
        registration_date: vehicle.registration_date ? vehicle.registration_date.slice(0, 10) : '',
        fuel_type: vehicle.fuel_type || '',
        cubic_capacity: vehicle.cubic_capacity ? String(vehicle.cubic_capacity) : '',
        battery_capacity: vehicle.battery_capacity || '',
        seating_capacity: vehicle.seating_capacity ? String(vehicle.seating_capacity) : '',
      });
      if (vehicle.rto_code) {
        setRtoCodes([toRtoOption(vehicle.rto_code)]);
      }
    }
  }, [vehicle]);

  // Masters — RTO search is server-side (not limited to first 50 local rows)
  const loadRto = useCallback((search?: string) => {
    setLoading((l) => ({ ...l, rto: true }));
    motorMastersService.getRtoCodes({
      search: search?.trim() || undefined,
      limit: 50,
      sort_by: 'rto_code',
      sort_order: 'asc',
      is_active: true,
    })
      .then((r) => {
        const list = (r.data.data?.data || []).map(toRtoOption);
        setRtoCodes((prev) => {
          const pinned = prev.find((o) => o.value === selectedRtoIdRef.current);
          if (pinned && !list.some((o) => o.value === pinned.value)) return [pinned, ...list];
          return list;
        });
      })
      .finally(() => setLoading((l) => ({ ...l, rto: false })));
  }, []);

  const loadMakes = useCallback(() => {
    setLoading((l) => ({ ...l, makes: true }));
    motorMastersService.getMotorMakes({ limit: 100 })
      .then((r) => setMakes((r.data.data.data || []).map((m: { id: string; make_name: string }) => ({ value: m.id, label: m.make_name }))))
      .finally(() => setLoading((l) => ({ ...l, makes: false })));
  }, []);

  useEffect(() => { loadMakes(); }, [loadMakes]);

  useEffect(() => {
    if (!form.make_id) { setModels([]); return; }
    setLoading((l) => ({ ...l, models: true }));
    motorMastersService.getMotorModels({ make_id: form.make_id, limit: 100 })
      .then((r) => setModels((r.data.data.data || []).map((m: { id: string; model_name: string }) => ({ value: m.id, label: m.model_name }))))
      .finally(() => setLoading((l) => ({ ...l, models: false })));
  }, [form.make_id]);

  useEffect(() => {
    if (!form.model_id) { setVariants([]); return; }
    setLoading((l) => ({ ...l, variants: true }));
    motorMastersService.getMotorVariants({ model_id: form.model_id, limit: 100 })
      .then((r) => setVariants((r.data.data.data || []).map((v: { id: string; variant_name: string }) => ({ value: v.id, label: v.variant_name }))))
      .finally(() => setLoading((l) => ({ ...l, variants: false })));
  }, [form.model_id]);

  // RTO auto-lookup from registration prefix
  const handleRegistrationBlur = async () => {
    if (form.is_new_registration || form.rto_code_id || form.registration_number.length < 4) return;
    try {
      const res = await vehicleService.rtoLookup(form.registration_number);
      const rto = res.data.data.rto_code;
      if (rto) {
        set({ rto_code_id: rto.id });
        const opt = toRtoOption(rto);
        setRtoCodes((prev) => (prev.some((o) => o.value === opt.value) ? prev : [opt, ...prev]));
      }
    } catch { /* ignore */ }
  };

  // Inline create for MMV / RTO
  const createMake = async (name: string) => {
    if (!name.trim()) return;
    try {
      const res = await motorMastersService.createMotorMake({ make_name: name.trim() });
      const m = res.data.data.motor_make;
      setMakes((prev) => [{ value: m.id, label: m.make_name }, ...prev]);
      set({ make_id: m.id, model_id: '', variant_id: '' });
    } catch (e) { toast.error('Failed to add make'); }
  };
  const createModel = async (name: string) => {
    if (!name.trim() || !form.make_id) return;
    try {
      const res = await motorMastersService.createMotorModel({ make_id: form.make_id, model_name: name.trim() });
      const m = res.data.data.motor_model;
      setModels((prev) => [{ value: m.id, label: m.model_name }, ...prev]);
      set({ model_id: m.id, variant_id: '' });
    } catch { toast.error('Failed to add model'); }
  };
  const createVariant = async (name: string) => {
    if (!name.trim() || !form.model_id) return;
    try {
      const res = await motorMastersService.createMotorVariant({ make_id: form.make_id, model_id: form.model_id, variant_name: name.trim() });
      const v = res.data.data.motor_variant;
      setVariants((prev) => [{ value: v.id, label: v.variant_name }, ...prev]);
      set({ variant_id: v.id });
    } catch { toast.error('Failed to add variant'); }
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.is_new_registration && !form.registration_number.trim()) e.registration_number = 'Registration number is required';
    if (form.chassis_last6 && !/^[A-Za-z0-9]{6}$/.test(form.chassis_last6)) e.chassis_last6 = 'Must be exactly 6 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        customer_id: customerId,
        registration_number: form.is_new_registration ? undefined : form.registration_number,
        is_new_registration: form.is_new_registration,
        rto_code_id: form.rto_code_id || undefined,
        chassis_last6: form.chassis_last6 || undefined,
        make_id: form.make_id || undefined,
        model_id: form.model_id || undefined,
        variant_id: form.variant_id || undefined,
        manufacture_year: form.manufacture_year ? Number(form.manufacture_year) : undefined,
        registration_date: form.registration_date || undefined,
        fuel_type: form.fuel_type || undefined,
        cubic_capacity: form.cubic_capacity ? Number(form.cubic_capacity) : undefined,
        battery_capacity: form.battery_capacity || undefined,
        seating_capacity: form.seating_capacity ? Number(form.seating_capacity) : undefined,
      };
      const res = isEdit
        ? await vehicleService.update(vehicle!.id, payload)
        : await vehicleService.create(payload);
      onSaved(res.data.data.vehicle);
      toast.success(isEdit ? 'Vehicle updated' : 'Vehicle added');
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to save vehicle';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Car className="h-4 w-4" />
            </div>
            <h3 className="text-base font-bold text-foreground">{isEdit ? 'Edit Vehicle' : 'Add Vehicle'}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Registration Number" required={!form.is_new_registration} error={errors.registration_number}>
              <input
                value={form.is_new_registration ? 'NOT APPLICABLE' : form.registration_number}
                onChange={(e) => set({ registration_number: e.target.value.toUpperCase() })}
                onBlur={handleRegistrationBlur}
                disabled={form.is_new_registration}
                placeholder="e.g. DL01AB1234"
                className={cn(inputCls, errors.registration_number && 'border-destructive')}
              />
              <label className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={form.is_new_registration}
                  onChange={(e) => set({ is_new_registration: e.target.checked, registration_number: '' })}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                New registration (no number yet)
              </label>
            </Field>

            <Field label="RTO Code" hint="Auto-detected from registration; or search by code, name, or city">
              <SearchableDropdown
                value={form.rto_code_id}
                onChange={(v) => set({ rto_code_id: v })}
                options={rtoCodes}
                loading={loading.rto}
                placeholder="Search RTO code (e.g. DL01)"
                onSearchChange={loadRto}
              />
            </Field>

            <Field label="Chassis Number (Last 6)" error={errors.chassis_last6}>
              <input
                value={form.chassis_last6}
                onChange={(e) => set({ chassis_last6: e.target.value.toUpperCase().slice(0, 6) })}
                maxLength={6}
                placeholder="6 characters"
                className={cn(inputCls, errors.chassis_last6 && 'border-destructive')}
              />
            </Field>

            <Field label="Manufacture Year">
              <input
                type="number"
                value={form.manufacture_year}
                onChange={(e) => set({ manufacture_year: e.target.value })}
                placeholder="e.g. 2022"
                className={inputCls}
              />
            </Field>

            <Field label="Make">
              <SearchableDropdown
                value={form.make_id}
                onChange={(v) => set({ make_id: v, model_id: '', variant_id: '' })}
                options={makes}
                loading={loading.makes}
                placeholder="Select make"
                onCreateNew={createMake}
                createLabel="Add make"
              />
            </Field>

            <Field label="Model">
              <SearchableDropdown
                value={form.model_id}
                onChange={(v) => set({ model_id: v, variant_id: '' })}
                options={models}
                loading={loading.models}
                disabled={!form.make_id}
                placeholder={form.make_id ? 'Select model' : 'Select make first'}
                onCreateNew={form.make_id ? createModel : undefined}
                createLabel="Add model"
              />
            </Field>

            <Field label="Variant">
              <SearchableDropdown
                value={form.variant_id}
                onChange={(v) => set({ variant_id: v })}
                options={variants}
                loading={loading.variants}
                disabled={!form.model_id}
                placeholder={form.model_id ? 'Select variant' : 'Select model first'}
                onCreateNew={form.model_id ? createVariant : undefined}
                createLabel="Add variant"
              />
            </Field>

            <Field label="Registration Date">
              <input type="date" value={form.registration_date} onChange={(e) => set({ registration_date: e.target.value })} className={inputCls} />
            </Field>

            <Field label="Fuel Type">
              <SearchableDropdown
                value={form.fuel_type}
                onChange={(v) => set({ fuel_type: v })}
                options={FUEL_TYPES}
                searchable={false}
                placeholder="Select fuel type"
              />
            </Field>

            <Field label="Cubic Capacity (CC)">
              <input type="number" value={form.cubic_capacity} onChange={(e) => set({ cubic_capacity: e.target.value })} placeholder="e.g. 1197" className={inputCls} />
            </Field>

            <Field label="Battery Capacity">
              <input value={form.battery_capacity} onChange={(e) => set({ battery_capacity: e.target.value })} placeholder="e.g. 30.2 kWh" className={inputCls} />
            </Field>

            <Field label="Seating Capacity">
              <input type="number" value={form.seating_capacity} onChange={(e) => set({ seating_capacity: e.target.value })} placeholder="e.g. 5" className={inputCls} />
            </Field>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-4">
          <button onClick={onClose} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEdit ? 'Update Vehicle' : 'Add Vehicle'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
