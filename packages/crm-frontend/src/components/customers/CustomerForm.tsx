import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Heart, MapPin, CreditCard, FileText,
  ChevronRight, ChevronLeft, Check, Loader2,
  Plus, Trash2, Building2, Search, AlertCircle,
  Sparkles, Shield, Home, Eye, Mail, Phone,
  Calendar, Star, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useFloatingPosition } from '@/lib/floatingPosition';
import { subBrokerService } from '@/services/subBrokerService';
import { employeeService } from '@/services/employeeService';
import { customerService } from '@/services/customerService';
import { useAuthStore } from '@/store/authStore';
import {
  calculateAgeFromDob,
  fetchIndiaStates,
  fetchCitiesForState,
  DOC_TYPES,
  ACCOUNT_TYPES,
} from '@/utils/customer-utils';

// ── Types ────────────────────────────────────────────────────────────────────
interface PendingBankAccount {
  _id: string;
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  branch_name: string;
  micr_code: string;
  account_type: string;
  is_primary: boolean;
}

interface PendingDocument {
  _id: string;
  document_type: string;
  file_name: string;
  file_url: string;
}

// ── Zod schemas per step ─────────────────────────────────────────────────────
const step1Schema = z.object({
  customer_name: z.string().min(2, 'Name required'),
  customer_phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter valid 10-digit mobile'),
  customer_email: z.string().email('Invalid email').optional().or(z.literal('')),
  customer_dob: z.string().optional(),
  customer_priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  customer_since: z.string().optional(),
  is_family_head: z.boolean().default(false),
  family_relation: z.enum(['SELF', 'SPOUSE', 'FATHER', 'MOTHER', 'SON', 'DAUGHTER', 'BROTHER', 'SISTER', 'OTHER']).optional().or(z.literal('')),
  family_code: z.string().optional(),
  referred_by_type: z.enum(['SUB_BROKER', 'CUSTOMER', 'SELF']).default('SELF'),
  referred_by_sub_broker_id: z.string().optional(),
  referred_by_customer_id: z.string().optional(),
});

const step2Schema = z.object({
  age: z.string().optional().transform(v => (v ? parseInt(v, 10) : undefined)),
  height: z.string().optional().transform(v => (v ? parseFloat(v) : undefined)),
  weight: z.string().optional().transform(v => (v ? parseFloat(v) : undefined)),
  blood_group: z.enum(['A_POSITIVE','A_NEGATIVE','B_POSITIVE','B_NEGATIVE','AB_POSITIVE','AB_NEGATIVE','O_POSITIVE','O_NEGATIVE','UNKNOWN']).optional().or(z.literal('')),
  has_ped: z.boolean().default(false),
  ped_details: z.string().optional(),
});

const step3Schema = z.object({
  house_no: z.string().optional(),
  area: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional().default('India'),
  pincode: z.string().regex(/^\d{6}$/, 'Must be 6 digits').optional().or(z.literal('')),
});

const step4Schema = z.object({
  pan_card: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN (e.g. ABCDE1234F)').optional().or(z.literal('')),
  aadhar_card: z.string().regex(/^\d{12}$/, 'Aadhar must be 12 digits').optional().or(z.literal('')),
});

const STEPS = [
  { id: 1, label: 'Basic Info',  desc: 'Name, contact & family details',    icon: User,    schema: step1Schema,  gradient: 'from-blue-500 to-indigo-600',   light: 'from-blue-50/80 to-indigo-50/80',   dot: 'bg-blue-500'   },
  { id: 2, label: 'Health',      desc: 'Physical & medical history',          icon: Heart,   schema: step2Schema,  gradient: 'from-rose-500 to-pink-600',     light: 'from-rose-50/80 to-pink-50/80',     dot: 'bg-rose-500'   },
  { id: 3, label: 'Address',     desc: 'Home & correspondence address',        icon: Home,    schema: step3Schema,  gradient: 'from-emerald-500 to-teal-600',  light: 'from-emerald-50/80 to-teal-50/80',  dot: 'bg-emerald-500'},
  { id: 4, label: 'KYC & Docs',  desc: 'Identity, banking & documents',        icon: Shield,  schema: step4Schema,  gradient: 'from-amber-500 to-orange-600',  light: 'from-amber-50/80 to-orange-50/80',  dot: 'bg-amber-500'  },
  { id: 5, label: 'Review',      desc: 'Preview & confirm all details',         icon: Eye,     schema: z.object({}), gradient: 'from-violet-500 to-purple-600', light: 'from-violet-50/80 to-purple-50/80', dot: 'bg-violet-500' },
];

// ── Shared input style ────────────────────────────────────────────────────────
const inputCls = 'h-10 rounded-xl border-border/70 bg-background/80 focus:border-primary/60 transition-all duration-200';
const nativeSel = [
  'flex h-10 w-full rounded-xl border border-border/70 bg-background/80 px-3 py-1 text-sm shadow-sm',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 transition-all duration-200',
].join(' ');

// ── Year picker ───────────────────────────────────────────────────────────────
function YearPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value ?? '');
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 40 }, (_, i) => String(currentYear - i));
  const filtered = query ? years.filter(y => y.includes(query)) : years;
  useEffect(() => { setQuery(value ?? ''); }, [value]);
  return (
    <div className="relative">
      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Select year..."
        className={cn(nativeSel, 'pl-9')}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-white dark:bg-zinc-900 shadow-xl max-h-48 overflow-y-auto">
          {filtered.map(y => (
            <div
              key={y}
              className={cn('cursor-pointer px-3 py-2 text-sm transition-colors hover:bg-accent mx-1 my-0.5 rounded-lg', y === value && 'bg-primary/10 text-primary font-semibold')}
              onMouseDown={() => { onChange(y); setQuery(y); setOpen(false); }}
            >
              {y}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────
interface FieldProps {
  label: string; error?: string; required?: boolean; hint?: string; className?: string; children: React.ReactNode;
}
function Field({ label, error, required, hint, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
        {label}{required && <span className="ml-1 text-red-400 normal-case">*</span>}
        {hint && <span className="ml-2 text-[11px] text-muted-foreground font-normal normal-case">{hint}</span>}
      </Label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-500 font-medium">
          <AlertCircle className="h-3 w-3 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

// ── Searchable Select ─────────────────────────────────────────────────────────
interface SearchableSelectProps {
  value: string; onChange: (v: string) => void; options: string[];
  placeholder?: string; loading?: boolean; className?: string;
}
function SearchableSelect({ value, onChange, options, placeholder, loading, className }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const { style, reposition } = useFloatingPosition(open, inputRef, 200);
  useEffect(() => { setQuery(value || ''); }, [value]);
  const filtered = query.trim() ? options.filter(o => o.toLowerCase().includes(query.toLowerCase())) : options;
  const handleSelect = (opt: string) => { onChange(opt); setQuery(opt); setOpen(false); };
  const handleBlur = () => { setTimeout(() => { setOpen(false); if (query && !options.includes(query)) onChange(query); }, 120); };
  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Input ref={inputRef} value={query}
          onChange={e => { setQuery(e.target.value); if (!open) { reposition(); setOpen(true); } }}
          onFocus={() => { reposition(); setOpen(true); }}
          onBlur={handleBlur}
          placeholder={placeholder} className={cn('pr-8', inputCls)}
        />
        {loading
          ? <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground pointer-events-none" />
          : <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        }
      </div>
      {open && style && filtered.length > 0 && createPortal(
        <div style={style} className="overflow-y-auto rounded-xl border border-border bg-white dark:bg-zinc-900 shadow-2xl">
          {filtered.slice(0, 80).map(opt => (
            <button key={opt} type="button" onMouseDown={e => { e.preventDefault(); handleSelect(opt); }}
              className={cn('w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors', opt === value && 'bg-primary/10 text-primary font-semibold')}>
              {opt}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Pincode & IFSC lookups ────────────────────────────────────────────────────
async function lookupPincode(pin: string, setValue: (k: string, v: string, opts?: object) => void) {
  if (pin.length !== 6) return;
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    const data = await res.json();
    if (data[0]?.Status === 'Success') {
      const po = data[0].PostOffice[0];
      setValue('city', po.District, { shouldDirty: true });
      setValue('state', po.State, { shouldDirty: true });
      setValue('area', po.Name, { shouldDirty: true });
      setValue('country', 'India', { shouldDirty: true });
    }
  } catch (_) {}
}

async function lookupIfsc(ifsc: string, onResult: (r: { bank_name: string; branch_name: string; micr_code: string }) => void) {
  if (ifsc.length !== 11) return;
  try {
    const res = await fetch(`https://ifsc.razorpay.com/${ifsc.toUpperCase()}`);
    if (res.ok) { const d = await res.json(); onResult({ bank_name: d.BANK || '', branch_name: d.BRANCH || '', micr_code: d.MICR || '' }); }
  } catch (_) {}
}

// ── Toggle Button ─────────────────────────────────────────────────────────────
function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        'flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all duration-200',
        active ? 'border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20' : 'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground bg-background/60',
      )}>
      {children}
    </button>
  );
}

// ── Section divider ───────────────────────────────────────────────────────────
function Divider({ label, icon: Icon }: { label: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-2 my-1">
      <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-3 w-3 text-primary" />
      </div>
      <span className="text-[11px] font-bold text-foreground/50 uppercase tracking-widest">{label}</span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

// ── Family code search (link to existing family) ──────────────────────────────
interface FamilyCodeSuggestion {
  family_code: string;
  family_head_name: string | null;
}

function FamilyCodeInput({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [input, setInput] = useState(value || '');
  const [suggestions, setSuggestions] = useState<FamilyCodeSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [headName, setHeadName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { style, reposition } = useFloatingPosition(open, inputRef, 240);

  useEffect(() => { setInput(value || ''); }, [value]);

  useEffect(() => {
    if (!value) {
      setHeadName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await customerService.lookupFamilyCode(value);
        if (!cancelled) {
          setHeadName(data.data.family_head_name ?? null);
          setError(null);
        }
      } catch {
        if (!cancelled) setHeadName(null);
      }
    })();
    return () => { cancelled = true; };
  }, [value]);

  useEffect(() => {
    const q = input.trim().toUpperCase();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await customerService.searchFamilyCodes(q);
        const list: FamilyCodeSuggestion[] = data.data.family_codes || [];
        setSuggestions(list);
        setOpen(list.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  const resolveCode = useCallback(async (code: string) => {
    const upper = code.trim().toUpperCase();
    if (upper.length < 4) return;
    setResolving(true);
    setError(null);
    try {
      const { data } = await customerService.lookupFamilyCode(upper);
      onChange(data.data.family_code);
      setInput(data.data.family_code);
      setHeadName(data.data.family_head_name ?? null);
      setOpen(false);
    } catch {
      onChange('');
      setHeadName(null);
      setError('Family code not found');
    } finally {
      setResolving(false);
    }
  }, [onChange]);

  const handleSelect = (item: FamilyCodeSuggestion) => {
    onChange(item.family_code);
    setInput(item.family_code);
    setHeadName(item.family_head_name);
    setError(null);
    setOpen(false);
    setSuggestions([]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value.toUpperCase();
    setInput(next);
    setError(null);
    if (next !== value) {
      onChange('');
      setHeadName(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Users className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onFocus={() => { if (suggestions.length) { reposition(); setOpen(true); } }}
          onBlur={() => {
            setTimeout(() => {
              const upper = input.trim().toUpperCase();
              if (upper && upper !== value) resolveCode(upper);
            }, 150);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              resolveCode(input);
            }
          }}
          placeholder="Type to search family code…"
          autoComplete="off"
          maxLength={20}
          className={cn(nativeSel, 'w-full pl-9 pr-9 font-mono')}
        />
        {(searching || resolving)
          ? <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          : input.length >= 2 && <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        }
      </div>

      {open && style && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          {createPortal(
            <div style={style} className="flex flex-col overflow-hidden rounded-xl border border-border bg-white shadow-2xl dark:bg-zinc-900">
              <div className="border-b border-border/60 bg-muted/30 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {suggestions.length} family code{suggestions.length !== 1 ? 's' : ''} found
                </p>
              </div>
              <ul className="overflow-y-auto py-1">
                {suggestions.map(item => (
                  <li
                    key={item.family_code}
                    onMouseDown={e => { e.preventDefault(); handleSelect(item); }}
                    className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 hover:bg-accent transition-colors"
                  >
                    <span className="font-mono text-sm font-semibold text-foreground">{item.family_code}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {item.family_head_name ? `Head: ${item.family_head_name}` : 'Head unknown'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )}
        </>
      )}

      {value && headName && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/30">
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
            Family head: <strong>{headName}</strong>
          </span>
          <span className="ml-auto font-mono text-[11px] text-emerald-600/80">{value}</span>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-red-500">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}

// ── Step 1 ────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Step1({ form, employees: _employees, brokers }: { form: any; employees: any[]; brokers: any[] }) {
  const { register, control, watch, setValue, formState: { errors } } = form;
  const refType = watch('referred_by_type');
  const selectedCustomerId = watch('referred_by_customer_id');
  const isFamilyHead = watch('is_family_head');
  const name = watch('customer_name');
  const phone = watch('customer_phone');

  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<Array<{ id: string; customer_name: string; customer_phone: string }>>([]);

  useEffect(() => {
    if (refType === 'SUB_BROKER') { setValue('referred_by_customer_id', ''); setCustomerSearch(''); setCustomerOpen(false); return; }
    if (refType === 'CUSTOMER') { setValue('referred_by_sub_broker_id', ''); return; }
    setValue('referred_by_sub_broker_id', ''); setValue('referred_by_customer_id', ''); setCustomerSearch(''); setCustomerOpen(false);
  }, [refType, setValue]);

  useEffect(() => {
    if (refType !== 'CUSTOMER') return;
    const t = setTimeout(async () => {
      setCustomerLoading(true);
      try {
        const { data } = await customerService.list({ search: customerSearch.trim() || undefined, page: 1, limit: 10 });
        setCustomerOptions((data?.data?.customers || []).filter((c: { id: string }) => c.id !== selectedCustomerId)
          .map((c: { id: string; customer_name: string; customer_phone: string }) => ({ id: c.id, customer_name: c.customer_name, customer_phone: c.customer_phone })));
      } catch { setCustomerOptions([]); } finally { setCustomerLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [refType, customerSearch, selectedCustomerId]);

  useEffect(() => {
    if (refType !== 'CUSTOMER' || !selectedCustomerId || customerSearch) return;
    const sel = customerOptions.find(c => c.id === selectedCustomerId);
    if (sel) setCustomerSearch(`${sel.customer_name} (${sel.customer_phone})`);
  }, [refType, selectedCustomerId, customerOptions, customerSearch]);

  const handleFamilyHeadChange = (v: boolean) => {
    setValue('is_family_head', v);
    setValue('family_relation', v ? 'SELF' : '');
    setValue('family_code', '');
  };

  const autoGenCode = async () => {
    if (name && phone?.match(/^[6-9]\d{9}$/)) {
      const { data } = await customerService.generateFamilyCode(name, phone);
      setValue('family_code', data.data.family_code);
    }
  };

  return (
    <div className="space-y-7">
      {/* Personal */}
      <div className="space-y-4">
        <Divider icon={User} label="Personal Details" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full Name" required error={errors.customer_name?.message}>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input {...register('customer_name')} placeholder="Jay Gupta" className={cn(inputCls, 'pl-9')} />
            </div>
          </Field>
          <Field label="Mobile Number" required error={errors.customer_phone?.message}>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input {...register('customer_phone')} placeholder="9876543210" maxLength={10} className={cn(inputCls, 'pl-9')} />
            </div>
          </Field>
          <Field label="Email Address" error={errors.customer_email?.message}>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input {...register('customer_email')} type="email" placeholder="jay@example.com" className={cn(inputCls, 'pl-9')} />
            </div>
          </Field>
          <Field label="Date of Birth">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input {...register('customer_dob')} type="date" className={cn(inputCls, 'pl-9')} />
            </div>
          </Field>
          <Field label="Priority Level">
            <Controller name="customer_priority" control={control} render={({ field }) => (
              <div className="flex gap-2">
                {(['LOW','MEDIUM','HIGH'] as const).map(p => (
                  <button key={p} type="button" onClick={() => field.onChange(p)}
                    className={cn(
                      'flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all',
                      field.value === p
                        ? p === 'LOW' ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                          : p === 'MEDIUM' ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                          : 'border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                        : 'border-border/60 text-muted-foreground hover:border-primary/30',
                    )}>
                    {p === 'LOW' ? '🟢' : p === 'MEDIUM' ? '🟡' : '🔴'} {p}
                  </button>
                ))}
              </div>
            )} />
          </Field>
          <Field label="Customer Since">
            <Controller name="customer_since" control={control} render={({ field }) => (
              <YearPicker value={field.value ?? ''} onChange={field.onChange} />
            )} />
          </Field>
        </div>
      </div>

      {/* Family */}
      <div className="space-y-4">
        <Divider icon={Users} label="Family Details" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Is Family Head?">
            <Controller name="is_family_head" control={control} render={({ field }) => (
              <div className="flex gap-2 mt-0.5">
                <ToggleBtn active={field.value === true} onClick={() => handleFamilyHeadChange(true)}>Yes</ToggleBtn>
                <ToggleBtn active={field.value === false} onClick={() => handleFamilyHeadChange(false)}>No</ToggleBtn>
              </div>
            )} />
          </Field>
          <Field label="Family Relation">
            <Controller name="family_relation" control={control} render={({ field }) => (
              isFamilyHead
                ? <input value="SELF" disabled className={cn(nativeSel, 'opacity-50 cursor-not-allowed')} />
                : <select value={field.value || ''} onChange={e => field.onChange(e.target.value)} className={nativeSel}>
                    <option value="">Select relation...</option>
                    {['SPOUSE','FATHER','MOTHER','SON','DAUGHTER','BROTHER','SISTER','OTHER'].map(r => (
                      <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>
                    ))}
                  </select>
            )} />
          </Field>
          <Field label="Family Code" hint={isFamilyHead ? 'Auto-generated from name + phone' : 'Search or enter a family code to link this member'} className="sm:col-span-2">
            {isFamilyHead ? (
              <div className="flex gap-2">
                <Input {...register('family_code')} disabled readOnly placeholder="JAYG638746"
                  className="font-mono uppercase flex-1 opacity-60 cursor-not-allowed h-10 rounded-xl" />
                <Button type="button" variant="outline" onClick={autoGenCode}
                  className="shrink-0 h-10 rounded-xl px-4 gap-1.5 text-sm">
                  <Sparkles className="h-3.5 w-3.5" /> Generate
                </Button>
              </div>
            ) : (
              <Controller name="family_code" control={control} render={({ field }) => (
                <FamilyCodeInput value={field.value || ''} onChange={field.onChange} />
              )} />
            )}
          </Field>
        </div>
      </div>

      {/* Referral */}
      <div className="space-y-4">
        <Divider icon={Star} label="Referral" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Referred By">
            <Controller name="referred_by_type" control={control} render={({ field }) => (
              <select value={field.value || 'SELF'} onChange={e => field.onChange(e.target.value)} className={nativeSel}>
                <option value="SELF">Self</option>
                <option value="SUB_BROKER">Sub Broker</option>
                <option value="CUSTOMER">Customer</option>
              </select>
            )} />
          </Field>
          {refType === 'SUB_BROKER' && (
            <Field label="Select Sub-Broker">
              <Controller name="referred_by_sub_broker_id" control={control} render={({ field }) => (
                <select value={field.value || ''} onChange={e => field.onChange(e.target.value)} className={nativeSel}>
                  <option value="">Select broker...</option>
                  {brokers.map(b => <option key={b.id} value={b.id}>{b.full_name} ({b.broker_code})</option>)}
                </select>
              )} />
            </Field>
          )}
          {refType === 'CUSTOMER' && (
            <Field label="Referring Customer">
              <Controller name="referred_by_customer_id" control={control} render={({ field }) => (
                <div className="relative">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={customerSearch}
                      onChange={e => { setCustomerSearch(e.target.value); setCustomerOpen(true); if (!e.target.value.trim()) field.onChange(''); }}
                      onFocus={() => setCustomerOpen(true)} onBlur={() => setTimeout(() => setCustomerOpen(false), 150)}
                      placeholder="Search customer by name" className={cn(inputCls, 'pl-9')} autoComplete="off" />
                  </div>
                  {customerOpen && (
                    <div className="absolute z-50 mt-1 w-full rounded-xl border border-input bg-white dark:bg-zinc-900 shadow-xl max-h-52 overflow-y-auto">
                      {customerLoading && <div className="px-3 py-2 text-sm text-muted-foreground">Searching...</div>}
                      {!customerLoading && customerOptions.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No customers found</div>}
                      {!customerLoading && customerOptions.map(c => (
                        <button key={c.id} type="button"
                          className={cn('w-full text-left px-3 py-2.5 hover:bg-accent transition-colors', field.value === c.id && 'bg-accent')}
                          onMouseDown={() => { field.onChange(c.id); setCustomerSearch(`${c.customer_name} (${c.customer_phone})`); setCustomerOpen(false); }}>
                          <div className="text-sm font-semibold">{c.customer_name}</div>
                          <div className="text-xs text-muted-foreground">{c.customer_phone}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )} />
            </Field>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 2 ────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Step2({ form }: { form: any }) {
  const { register, control, watch, formState: { errors } } = form;
  const hasPed = watch('has_ped');

  const bloodGroupMap: [string, string][] = [
    ['A_POSITIVE','A+'],['A_NEGATIVE','A-'],['B_POSITIVE','B+'],['B_NEGATIVE','B-'],
    ['AB_POSITIVE','AB+'],['AB_NEGATIVE','AB-'],['O_POSITIVE','O+'],['O_NEGATIVE','O-'],['UNKNOWN','Unknown'],
  ];

  return (
    <div className="space-y-7">
      <div className="space-y-4">
        <Divider icon={Heart} label="Physical Measurements" />
        <div className="grid grid-cols-3 gap-4">
          {[
            { name: 'age', label: 'Age', placeholder: '35', unit: 'yrs', error: errors.age?.message },
            { name: 'height', label: 'Height', placeholder: '170', unit: 'cm' },
            { name: 'weight', label: 'Weight', placeholder: '70', unit: 'kg' },
          ].map(f => (
            <Field key={f.name} label={f.label} error={f.error as string | undefined}>
              <div className="relative">
                <Input {...register(f.name)} type="number" step={f.name === 'age' ? '1' : '0.1'} placeholder={f.placeholder} className={cn(inputCls, 'pr-9')} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">{f.unit}</span>
              </div>
            </Field>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <Divider icon={Heart} label="Medical Information" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Blood Group">
            <Controller name="blood_group" control={control} render={({ field }) => (
              <select value={field.value || ''} onChange={e => field.onChange(e.target.value)} className={nativeSel}>
                <option value="">Select blood group...</option>
                {bloodGroupMap.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
              </select>
            )} />
          </Field>
          <Field label="Pre-Existing Disease?">
            <Controller name="has_ped" control={control} render={({ field }) => (
              <div className="flex gap-2 mt-0.5">
                <ToggleBtn active={field.value === true} onClick={() => field.onChange(true)}>Yes</ToggleBtn>
                <ToggleBtn active={field.value === false} onClick={() => field.onChange(false)}>No</ToggleBtn>
              </div>
            )} />
          </Field>
          {hasPed && (
            <Field label="PED Details" className="sm:col-span-2">
              <textarea {...register('ped_details')}
                className="w-full min-h-[80px] rounded-xl border border-border/70 bg-background/80 px-3 py-2.5 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 transition-all"
                placeholder="Describe pre-existing conditions in detail..." />
            </Field>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 3 ────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Step3({ form }: { form: ReturnType<typeof useForm<any>> }) {
  const { register, control, setValue, watch, formState: { errors } } = form;
  const pincode = watch('pincode');
  const state = watch('state') as string || '';
  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loadingS, setLoadingS] = useState(false);
  const [loadingC, setLoadingC] = useState(false);

  useEffect(() => { setLoadingS(true); fetchIndiaStates().then(s => { setStates(s); setLoadingS(false); }); }, []);
  useEffect(() => {
    if (!state) { setCities([]); return; }
    setLoadingC(true); fetchCitiesForState(state).then(c => { setCities(c); setLoadingC(false); });
  }, [state]);
  useEffect(() => { if (pincode?.length === 6) lookupPincode(pincode, setValue); }, [pincode]);

  return (
    <div className="space-y-4">
      <Divider icon={MapPin} label="Address Details" />

      {/* Pincode smart banner */}
      <div className="flex items-start gap-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 px-4 py-3">
        <Sparkles className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">
          Enter your 6-digit pincode to auto-fill area, city and state instantly.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="House / Flat No.">
          <Input {...register('house_no')} placeholder="A-102, Palm Heights" className={inputCls} />
        </Field>
        <Field label="Pincode" hint="Auto-fills location" error={errors.pincode?.message as string | undefined}>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input {...register('pincode')} placeholder="400001" maxLength={6} className={cn(inputCls, 'pl-9')} />
          </div>
        </Field>
        <Field label="Area / Street">
          <Input {...register('area')} placeholder="Sector 15, MG Road" className={inputCls} />
        </Field>
        <Field label="State">
          <Controller name="state" control={control} render={({ field }) => (
            <SearchableSelect value={field.value || ''} onChange={v => { field.onChange(v); setValue('city', '', { shouldDirty: true }); }}
              options={states} placeholder="Select state..." loading={loadingS} />
          )} />
        </Field>
        <Field label="City">
          <Controller name="city" control={control} render={({ field }) => (
            <SearchableSelect value={field.value || ''} onChange={field.onChange}
              options={cities} placeholder={loadingC ? 'Loading cities…' : cities.length ? 'Select city...' : 'Enter city'} loading={loadingC} />
          )} />
        </Field>
        <Field label="Country">
          <input value="India" disabled className={cn(nativeSel, 'opacity-60 cursor-not-allowed')} />
        </Field>
      </div>
    </div>
  );
}

// ── SingleBankAccount ─────────────────────────────────────────────────────────
interface SingleBankAccountProps { acc: PendingBankAccount; onChange: (field: keyof PendingBankAccount, value: string | boolean) => void; }
function SingleBankAccount({ acc, onChange }: SingleBankAccountProps) {
  const [lookingUp, setLookingUp] = useState(false);
  const handleIfscBlur = async () => {
    if (acc.ifsc_code.length === 11) {
      setLookingUp(true);
      await lookupIfsc(acc.ifsc_code, r => { onChange('bank_name', r.bank_name); onChange('branch_name', r.branch_name); onChange('micr_code', r.micr_code); });
      setLookingUp(false);
    }
  };
  return (
    <div className="rounded-2xl bg-gradient-to-br from-muted/40 to-muted/20 border border-border/60 p-5 space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Account Holder Name">
          <Input value={acc.account_holder_name} onChange={e => onChange('account_holder_name', e.target.value)} placeholder="Full name on bank records" className={inputCls} />
        </Field>
        <Field label="Account Type">
          <select value={acc.account_type} onChange={e => onChange('account_type', e.target.value)} className={nativeSel}>
            {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Account Number">
          <div className="relative">
            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input value={acc.account_number} onChange={e => onChange('account_number', e.target.value)} placeholder="1234567890" className={cn(inputCls, 'pl-9 font-mono tracking-wider')} />
          </div>
        </Field>
        <Field label="IFSC Code" hint="Auto-fills bank details">
          <div className="relative">
            <Input value={acc.ifsc_code} onChange={e => onChange('ifsc_code', e.target.value.toUpperCase())} onBlur={handleIfscBlur}
              placeholder="HDFC0001234" className={cn(inputCls, 'uppercase font-mono')} maxLength={11} />
            {lookingUp && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </Field>
        <Field label="Bank Name">
          <Input value={acc.bank_name} onChange={e => onChange('bank_name', e.target.value)} placeholder="Auto-filled from IFSC" className={inputCls} />
        </Field>
        <Field label="Branch Name">
          <Input value={acc.branch_name} onChange={e => onChange('branch_name', e.target.value)} placeholder="Auto-filled from IFSC" className={inputCls} />
        </Field>
        <Field label="MICR Code" hint="Auto-filled">
          <Input value={acc.micr_code} onChange={e => onChange('micr_code', e.target.value)} placeholder="Auto-filled from IFSC" className={cn(inputCls, 'font-mono')} />
        </Field>
      </div>
    </div>
  );
}

// ── DocumentRow ───────────────────────────────────────────────────────────────
interface DocumentRowProps { doc: PendingDocument; index: number; isOnly: boolean; onChange: (id: string, field: keyof PendingDocument, value: string) => void; onRemove: (id: string) => void; }
function DocumentRow({ doc, index, isOnly, onChange, onRemove }: DocumentRowProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-sm font-semibold text-foreground/80">Document {index + 1}</span>
        </div>
        {!isOnly && (
          <button type="button" onClick={() => onRemove(doc._id)}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Document Type" required>
          <select value={doc.document_type} onChange={e => onChange(doc._id, 'document_type', e.target.value)} className={nativeSel}>
            <option value="">Select type...</option>
            {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Document Name">
          <Input value={doc.file_name} onChange={e => onChange(doc._id, 'file_name', e.target.value)} placeholder="e.g. Aadhar Front" className={inputCls} />
        </Field>
      </div>
    </div>
  );
}

// ── Step 4 ────────────────────────────────────────────────────────────────────
interface Step4Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: ReturnType<typeof useForm<any>>;
  bankAccount: PendingBankAccount; documents: PendingDocument[];
  onBankChange: (field: keyof PendingBankAccount, value: string | boolean) => void;
  onDocChange: (id: string, field: keyof PendingDocument, value: string) => void;
  onDocAdd: () => void; onDocRemove: (id: string) => void;
}
function Step4({ form, bankAccount, documents, onBankChange, onDocChange, onDocAdd, onDocRemove }: Step4Props) {
  const { register, formState: { errors } } = form;
  return (
    <div className="space-y-7">
      <div className="space-y-4">
        <Divider icon={CreditCard} label="Identity Numbers" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="PAN Card" hint="e.g. ABCDE1234F" error={errors.pan_card?.message as string | undefined}>
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input {...register('pan_card')} placeholder="ABCDE1234F" className={cn(inputCls, 'pl-9 uppercase font-mono tracking-widest')} maxLength={10} />
            </div>
          </Field>
          <Field label="Aadhar Card" hint="12-digit number" error={errors.aadhar_card?.message as string | undefined}>
            <div className="relative">
              <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input {...register('aadhar_card')} placeholder="123456789012" maxLength={12} className={cn(inputCls, 'pl-9 font-mono tracking-widest')} />
            </div>
          </Field>
        </div>
      </div>

      <div className="space-y-4">
        <Divider icon={Building2} label="Bank Account" />
        <SingleBankAccount acc={bankAccount} onChange={onBankChange} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Divider icon={FileText} label="Documents" />
          <button type="button" onClick={onDocAdd}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 bg-primary/8 hover:bg-primary/12 px-3 py-1.5 rounded-lg transition-all ml-3 shrink-0">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        <div className="space-y-3">
          {documents.map((doc, i) => (
            <DocumentRow key={doc._id} doc={doc} index={i} isOnly={documents.length === 1} onChange={onDocChange} onRemove={onDocRemove} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Step 5 — Review ───────────────────────────────────────────────────────────
function Step5({ allData, bankAccounts, documents }: { allData: Record<string, unknown>; bankAccounts: PendingBankAccount[]; documents: PendingDocument[] }) {
  const sections = [
    { title: 'Basic Info', icon: User, gradient: 'from-blue-500 to-indigo-600', fields: [
      ['Name', allData.customer_name], ['Mobile', allData.customer_phone], ['Email', allData.customer_email],
      ['Date of Birth', allData.customer_dob], ['Priority', allData.customer_priority], ['Since', allData.customer_since],
      ['Family Code', allData.family_code], ['Family Head', allData.is_family_head ? 'Yes' : 'No'], ['Relation', allData.family_relation],
    ]},
    { title: 'Health', icon: Heart, gradient: 'from-rose-500 to-pink-600', fields: [
      ['Age', allData.age ? `${allData.age} yrs` : null], ['Height', allData.height ? `${allData.height} cm` : null],
      ['Weight', allData.weight ? `${allData.weight} kg` : null],
      ['Blood Group', (allData.blood_group as string)?.replace(/_/g, ' ') || null],
      ['PED', allData.has_ped ? `Yes${allData.ped_details ? ` — ${allData.ped_details}` : ''}` : 'No'],
    ]},
    { title: 'Address', icon: Home, gradient: 'from-emerald-500 to-teal-600', fields: [
      ['House/Flat', allData.house_no], ['Area', allData.area], ['City', allData.city],
      ['State', allData.state], ['Pincode', allData.pincode], ['Country', allData.country || 'India'],
    ]},
    { title: 'KYC', icon: Shield, gradient: 'from-amber-500 to-orange-600', fields: [
      ['PAN Card', allData.pan_card], ['Aadhar', allData.aadhar_card],
    ]},
  ];

  const validBanks = bankAccounts.filter(a => a.account_holder_name && a.account_number);
  const validDocs  = documents.filter(d => d.document_type && d.file_name);
  const docColors: Record<string, string> = {
    PAN_CARD: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    AADHAR_CARD: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    PASSPORT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    DRIVING_LICENSE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    VOTER_ID: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    default: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 px-4 py-3 flex items-start gap-3">
        <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
        <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
          Almost done! Review the details below before submitting. You can go back to edit any section.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sections.map(s => {
          const Icon = s.icon;
          const populated = s.fields.filter(([, v]) => v != null && v !== '');
          if (populated.length === 0) return null;
          return (
            <div key={s.title} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className={cn('h-1 w-full bg-gradient-to-r', s.gradient)} />
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn('h-6 w-6 rounded-lg flex items-center justify-center text-white bg-gradient-to-br', s.gradient)}>
                    <Icon className="h-3 w-3" />
                  </div>
                  <h3 className="text-xs font-bold text-foreground/70 uppercase tracking-wider">{s.title}</h3>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {populated.map(([label, value]) => (
                    value != null && value !== '' ? (
                      <div key={label as string} className="space-y-0.5 min-w-0">
                        <dt className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">{label as string}</dt>
                        <dd className="text-xs font-semibold text-foreground truncate">{String(value)}</dd>
                      </div>
                    ) : null
                  ))}
                </dl>
              </div>
            </div>
          );
        })}
      </div>

      {validBanks.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-amber-500 to-orange-600" />
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-6 w-6 rounded-lg flex items-center justify-center text-white bg-gradient-to-br from-amber-500 to-orange-600"><Building2 className="h-3 w-3" /></div>
              <h3 className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Bank Account</h3>
            </div>
            {validBanks.map(acc => (
              <div key={acc._id} className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3 gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{acc.bank_name || 'Bank'}</div>
                  <div className="text-xs text-muted-foreground">{acc.account_type}{acc.branch_name ? ` · ${acc.branch_name}` : ''}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-sm font-bold tracking-widest">●●●● {acc.account_number.slice(-4)}</div>
                  {acc.is_primary && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/60 text-primary">Primary</Badge>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {validDocs.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-purple-600" />
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-6 w-6 rounded-lg flex items-center justify-center text-white bg-gradient-to-br from-violet-500 to-purple-600"><FileText className="h-3 w-3" /></div>
              <h3 className="text-xs font-bold text-foreground/70 uppercase tracking-wider">Documents ({validDocs.length})</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {validDocs.map(doc => (
                <div key={doc._id} className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-1.5">
                  <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', docColors[doc.document_type] || docColors.default)}>
                    {DOC_TYPES.find(t => t.value === doc.document_type)?.label || doc.document_type}
                  </span>
                  <span className="text-xs text-muted-foreground">{doc.file_name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeId() { return Math.random().toString(36).slice(2); }
function emptyBank(): PendingBankAccount {
  return { _id: makeId(), account_holder_name: '', account_number: '', ifsc_code: '', bank_name: '', branch_name: '', micr_code: '', account_type: 'SAVINGS', is_primary: true };
}
function emptyDoc(): PendingDocument { return { _id: makeId(), document_type: 'PAN_CARD', file_name: '', file_url: '' }; }

// ── Main CustomerForm ─────────────────────────────────────────────────────────
export default function CustomerForm({
  initialData = {},
  onSubmit,
  loading: submitting,
  isEditMode = false,
}: {
  initialData?: Record<string, unknown>;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  loading?: boolean;
  isEditMode?: boolean;
}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user } = useAuthStore();
  const [step, setStep] = useState(1);
  const [allData, setAllData] = useState<Record<string, unknown>>(initialData);
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [brokers, setBrokers]     = useState<{ id: string; full_name: string; broker_code: string }[]>([]);
  const [bankAccount, setBankAccount] = useState<PendingBankAccount>(() => {
    const existing = (initialData.bank_accounts as PendingBankAccount[] | undefined)?.[0];
    return existing ? { _id: makeId(), ...existing } : emptyBank();
  });
  const [documents, setDocuments] = useState<PendingDocument[]>([emptyDoc()]);

  useEffect(() => {
    const load = async () => {
      try {
        const [e, b] = await Promise.all([employeeService.list(), subBrokerService.list()]);
        setEmployees(e.data.data.employees || []);
        setBrokers(b.data.data.brokers || []);
      } catch (_) {}
    };
    load();
  }, []);

  // No global resolver — we validate per-step in handleNext so the resolver
  // doesn't get frozen to step1Schema for the entire component lifecycle.
  const form = useForm({
    defaultValues: { customer_priority: 'MEDIUM', has_ped: false, is_family_head: false, country: 'India', referred_by_type: 'SELF', ...allData },
    mode: 'onTouched',
  });

  const FORM_DEFAULTS = { customer_priority: 'MEDIUM', has_ped: false, is_family_head: false, country: 'India', referred_by_type: 'SELF' } as const;

  const handleNext = async () => {
    // Validate ONLY the current step's fields using its own Zod schema
    const values = form.getValues();
    const result = STEPS[step - 1].schema.safeParse(values);

    if (!result.success) {
      // Manually push validation errors onto the form so Field components show them
      form.clearErrors();
      result.error.issues.forEach(issue => {
        const field = issue.path[0];
        if (field && typeof field === 'string') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          form.setError(field as any, { type: 'manual', message: issue.message });
        }
      });
      return;
    }

    const stepData = form.getValues() as Record<string, unknown>;
    // Auto-calculate age from DOB when leaving step 1
    if (step === 1 && stepData.customer_dob) {
      const age = calculateAgeFromDob(stepData.customer_dob as string);
      if (age !== null) stepData.age = String(age);
    }
    const merged = { ...allData, ...stepData };
    setAllData(merged);
    if (step < STEPS.length) {
      form.reset({ ...FORM_DEFAULTS, ...merged });
      setStep(s => s + 1);
    }
  };

  const handleBack = () => {
    const merged = { ...allData, ...form.getValues() };
    setAllData(merged);
    form.reset({ ...FORM_DEFAULTS, ...merged });
    setStep(s => s - 1);
  };

  const handleBankChange = useCallback((field: keyof PendingBankAccount, value: string | boolean) => { setBankAccount(p => ({ ...p, [field]: value })); }, []);
  const handleDocChange  = useCallback((id: string, field: keyof PendingDocument, value: string) => { setDocuments(p => p.map(d => d._id === id ? { ...d, [field]: value } : d)); }, []);
  const handleDocAdd     = useCallback(() => { setDocuments(p => [...p, emptyDoc()]); }, []);
  const handleDocRemove  = useCallback((id: string) => { setDocuments(p => p.filter(d => d._id !== id)); }, []);

  const handleFinalSubmit = async () => {
    const final: Record<string, unknown> = { ...allData };
    Object.keys(final).forEach(k => { if (final[k] === '' || final[k] === undefined) delete final[k]; });
    final.pendingBankAccounts = (bankAccount.account_holder_name && bankAccount.account_number) ? [bankAccount] : [];
    final.pendingDocuments    = documents.filter(d => d.document_type && d.file_name);
    await onSubmit(final);
  };

  const currentStep = STEPS[step - 1];
  const StepIcon    = currentStep.icon;
  const progress    = Math.round(((step - 1) / (STEPS.length - 1)) * 100);

  return (
    <div className="h-full flex flex-col max-w-5xl mx-auto">
      <div className="flex-1 flex overflow-hidden rounded-2xl border border-border/60 shadow-2xl shadow-black/10">

        {/* ── LEFT SIDEBAR ──────────────────────────────────────────────────── */}
        <div className="hidden md:flex w-64 shrink-0 flex-col bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 relative overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute -top-12 -left-12 h-40 w-40 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
          <div className="absolute top-1/2 -right-16 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />

          {/* Brand */}
          <div className="relative px-6 pt-7 pb-5">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <Users className="h-4.5 w-4.5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-white leading-tight">Customer Portal</p>
                <p className="text-[10px] text-white/40 font-medium">Insurance CRM</p>
              </div>
            </div>
          </div>

          <div className="relative px-4 mb-2">
            <div className="h-px bg-white/8" />
            <div className="mt-3 px-2">
              <p className="text-[11px] text-white/30 font-semibold uppercase tracking-widest">
                {isEditMode ? 'Editing Customer' : 'New Registration'}
              </p>
            </div>
          </div>

          {/* Steps */}
          <div className="relative flex-1 px-3 py-2 space-y-0.5">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done   = step > s.id;
              const active = step === s.id;
              return (
                <div key={s.id}>
                  <div className={cn(
                    'relative flex items-start gap-3 px-3 py-3 rounded-xl transition-all duration-200',
                    active && 'bg-white/10 shadow-sm',
                    !active && !done && 'opacity-40',
                  )}>
                    {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-0.5 rounded-full bg-white/60" />}
                    <div className={cn(
                      'h-8 w-8 rounded-xl shrink-0 flex items-center justify-center text-white transition-all',
                      done   ? `bg-gradient-to-br ${s.gradient} shadow-md` :
                      active ? `bg-gradient-to-br ${s.gradient} shadow-lg shadow-black/20` :
                               'bg-white/8 border border-white/10',
                    )}>
                      {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Icon className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <p className={cn('text-sm font-semibold leading-tight', active ? 'text-white' : done ? 'text-white/60' : 'text-white/40')}>
                        {s.label}
                      </p>
                      <p className="text-[11px] text-white/30 mt-0.5 leading-tight">{s.desc}</p>
                    </div>
                    {done && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 ml-auto mt-0.5" strokeWidth={2.5} />}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="ml-7 h-3.5 flex items-center">
                      <div className="w-px h-full bg-white/8 mx-3.5" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Progress card */}
          <div className="relative px-4 pb-6 pt-2">
            <div className="rounded-xl bg-white/5 border border-white/8 p-4">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Progress</span>
                <span className="text-sm font-bold text-white">{progress}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className={cn('h-full rounded-full bg-gradient-to-r', currentStep.gradient)}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: 'easeInOut' }}
                />
              </div>
              <p className="text-[11px] text-white/25 mt-2">{step} of {STEPS.length} steps completed</p>
            </div>
          </div>
        </div>

        {/* ── RIGHT CONTENT ─────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-card">

          {/* Mobile step bar */}
          <div className="md:hidden flex items-center gap-1.5 px-4 py-3 border-b bg-muted/20 overflow-x-auto shrink-0">
            {STEPS.map(s => {
              const done = step > s.id; const active = step === s.id;
              return (
                <div key={s.id} className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 transition-all',
                  active ? `bg-gradient-to-r ${s.gradient} text-white shadow-sm` : done ? 'text-muted-foreground' : 'text-muted-foreground/40',
                )}>
                  {done ? <Check className="h-2.5 w-2.5" /> : <s.icon className="h-2.5 w-2.5" />}
                  {active && s.label}
                </div>
              );
            })}
          </div>

          {/* Step heading */}
          <div className={cn('shrink-0 px-7 py-5 border-b bg-gradient-to-r', currentStep.light)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className={cn('h-11 w-11 rounded-2xl flex items-center justify-center text-white shadow-lg bg-gradient-to-br', currentStep.gradient)}>
                  <StepIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-foreground leading-tight">{currentStep.label}</h2>
                  <p className="text-xs text-muted-foreground font-medium">{currentStep.desc}</p>
                </div>
              </div>
              <div className={cn('rounded-xl px-3 py-1.5 text-xs font-bold text-white shadow-md bg-gradient-to-r hidden sm:block', currentStep.gradient)}>
                Step {step} / {STEPS.length}
              </div>
            </div>
          </div>

          {/* Form body — scrollable */}
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="p-7"
              >
                {step === 1 && <Step1 form={form} employees={employees} brokers={brokers} />}
                {step === 2 && <Step2 form={form} />}
                {step === 3 && <Step3 form={form} />}
                {step === 4 && (
                  <Step4
                    form={form} bankAccount={bankAccount} documents={documents}
                    onBankChange={handleBankChange} onDocChange={handleDocChange}
                    onDocAdd={handleDocAdd} onDocRemove={handleDocRemove}
                  />
                )}
                {step === 5 && <Step5 allData={allData} bankAccounts={[bankAccount]} documents={documents} />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation footer */}
          <div className="shrink-0 px-7 py-4 border-t bg-card/80 flex items-center justify-between gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={step === 1 || submitting}
              className="gap-2 rounded-xl px-5 h-10 font-semibold border-2 border-border/60"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>

            {/* Dot indicators */}
            <div className="flex items-center gap-1.5">
              {STEPS.map(s => (
                <div key={s.id} className={cn(
                  'rounded-full transition-all duration-300',
                  step === s.id ? cn('h-2 w-5', s.dot) : step > s.id ? cn('h-1.5 w-1.5', s.dot, 'opacity-60') : 'h-1.5 w-1.5 bg-border',
                )} />
              ))}
            </div>

            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={handleNext}
                className={cn('gap-2 rounded-xl px-6 h-10 font-semibold text-white bg-gradient-to-r shadow-md hover:shadow-lg hover:brightness-110 active:scale-[0.98] transition-all', currentStep.gradient)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            ) : step === STEPS.length - 1 ? (
              <Button type="button" onClick={handleNext}
                className={cn('gap-2 rounded-xl px-6 h-10 font-semibold text-white bg-gradient-to-r shadow-md hover:shadow-lg hover:brightness-110 transition-all', currentStep.gradient)}>
                Review <Eye className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" onClick={handleFinalSubmit} disabled={submitting}
                className="gap-2 rounded-xl px-7 h-10 font-bold text-white bg-gradient-to-r from-violet-500 to-purple-600 shadow-lg hover:shadow-xl hover:brightness-110 active:scale-[0.98] transition-all">
                {submitting
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                  : isEditMode
                    ? <><Check className="h-4 w-4" /> Save Changes</>
                    : <><Sparkles className="h-4 w-4" /> Create Customer</>
                }
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
