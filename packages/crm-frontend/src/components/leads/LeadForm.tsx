import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { motion } from 'framer-motion';
import {
  User, Phone, Mail, DollarSign, Building2, Layers, Box,
  UserCheck, Tag, MessageSquare, Plus, Trash2, Calendar,
  ChevronDown, Check, Loader2, Search,
  FileText, TrendingUp, MapPin, UserCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useFloatingPosition } from '@/lib/floatingPosition';
import { employeeService } from '@/services/employeeService';
import { customerService } from '@/services/customerService';
import { subBrokerService, masterDataService } from '@/services/subBrokerService';
import type { Lead, LeadFollowUp, LeadDocument } from '@/services/leadService';
import { DOC_TYPES } from '@/utils/customer-utils';

// ── Zod schema ────────────────────────────────────────────────────────────────
const leadSchema = z.object({
  lead_name:    z.string().min(2, 'Name is required'),
  phone_number: z.string().regex(/^[6-9]\d{9}$/, 'Enter valid 10-digit mobile'),
  email:        z.string().email('Invalid email').optional().or(z.literal('')),
  expected_premium: z.string().optional(),
  referred_by_type: z.enum(['SUB_BROKER', 'CUSTOMER', 'SELF']).default('SELF'),
  referred_by_sub_broker_id: z.string().optional(),
  referred_by_customer_id:   z.string().optional(),
  lob_id:        z.string().optional(),
  product_id:    z.string().optional(),
  sub_product_id: z.string().optional(),
  assigned_to:   z.string().optional(),
  status: z.enum(['NEW', 'HOT', 'WARM', 'COLD', 'CONVERTED', 'LOST']).default('NEW'),
  notes: z.string().optional(),
});

type LeadFormValues = z.infer<typeof leadSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────
const inputCls = 'h-10 rounded-xl border-border/70 bg-background/80 focus:border-primary/60 transition-all duration-200';

const makeFollowUp = (): LeadFollowUp => ({ is_done: false, notes: '', follow_up_date: '' });
const makeDoc      = (): LeadDocument => ({ document_type: 'OTHER', file_name: '', file_url: '' });

const STATUS_OPTIONS = [
  { value: 'NEW',       label: 'New',       color: 'bg-blue-100 text-blue-700 border-blue-200'    },
  { value: 'HOT',       label: 'Hot',       color: 'bg-red-100 text-red-700 border-red-200'        },
  { value: 'WARM',      label: 'Warm',      color: 'bg-orange-100 text-orange-700 border-orange-200'},
  { value: 'COLD',      label: 'Cold',      color: 'bg-sky-100 text-sky-700 border-sky-200'        },
  { value: 'CONVERTED', label: 'Converted', color: 'bg-green-100 text-green-700 border-green-200'  },
  { value: 'LOST',      label: 'Lost',      color: 'bg-gray-100 text-gray-600 border-gray-200'     },
] as const;

const REFERRAL_TYPES = [
  { value: 'SELF',       label: 'Self'       },
  { value: 'SUB_BROKER', label: 'Sub Broker' },
  { value: 'CUSTOMER',   label: 'Customer'   },
] as const;

// ── CustomerSearchInput ───────────────────────────────────────────────────────
// Smart name field: calls customer API from the 3rd character onwards and shows
// a portal dropdown. Selecting a result fills all matching lead fields.
interface CustomerSuggestion {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  area?: string | null;
  city?: string | null;
  state?: string | null;
  referred_by_type?: string | null;
  referred_by_sub_broker_id?: string | null;
  referred_by_customer_id?: string | null;
}

interface CustomerSearchInputProps {
  value: string;
  onChange: (name: string) => void;
  onSelectCustomer: (c: CustomerSuggestion) => void;
  error?: string;
}

function CustomerSearchInput({ value, onChange, onSelectCustomer, error }: CustomerSearchInputProps) {
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [open,        setOpen]        = useState(false);
  const [searching,   setSearching]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { style, reposition } = useFloatingPosition(open, inputRef, 280);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    onChange(query);

    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    // Call API on every keystroke from the 3rd character onwards
    setSearching(true);
    setOpen(true);
    try {
      const res = await customerService.list({ search: query, limit: 10 });
      const list: CustomerSuggestion[] = res.data.data.customers || [];
      setSuggestions(list);
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = (c: CustomerSuggestion) => {
    onChange(c.customer_name);
    onSelectCustomer(c);
    setOpen(false);
    setSuggestions([]);
  };

  const addressLine = (c: CustomerSuggestion) =>
    [c.area, c.city, c.state].filter(Boolean).join(', ');

  return (
    <div className="relative">
      <div className="relative">
        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onFocus={() => {
            if (suggestions.length) {
              reposition();
              setOpen(true);
            }
          }}
          placeholder="Type 3+ letters to search customers…"
          autoComplete="off"
          className={cn(
            inputCls,
            'w-full pl-9 pr-8 text-sm border outline-none',
            error && 'border-destructive',
          )}
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        {!searching && value.length >= 3 && (
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>

      {open && style && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          {createPortal(
            <div
              style={style}
              className="overflow-hidden rounded-xl border border-border bg-white dark:bg-zinc-900 shadow-2xl flex flex-col"
            >
              {searching && suggestions.length === 0 ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Searching customers…
                </div>
              ) : suggestions.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  No customers found — a new lead will be created
                </div>
              ) : (
                <>
                  <div className="px-3 py-2 border-b border-border/60 bg-muted/30">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {suggestions.length} customer{suggestions.length !== 1 ? 's' : ''} found — click to auto-fill
                    </p>
                  </div>
                  <ul className="overflow-y-auto">
                    {suggestions.map(c => (
                      <li
                        key={c.id}
                        onMouseDown={e => { e.preventDefault(); handleSelect(c); }}
                        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-accent transition-colors border-b border-border/30 last:border-0"
                      >
                        {/* Avatar circle */}
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                          {c.customer_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{c.customer_name}</p>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-2.5 w-2.5" /> {c.customer_phone}
                            </span>
                            {addressLine(c) && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                                <MapPin className="h-2.5 w-2.5 shrink-0" /> {addressLine(c)}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300 shrink-0 mt-1">
                          Fill
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}

// ── CustomerReferralSearch ────────────────────────────────────────────────────
// For the "Referred by Customer" field: live search by name/phone,
// stores the customer UUID in the form, displays the customer name.
function CustomerReferralSearch({
  value, onChange,
}: {
  value: string;                // customer UUID stored in form
  onChange: (id: string) => void;
}) {
  const [query,       setQuery]       = useState('');
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [selected,    setSelected]    = useState<CustomerSuggestion | null>(null);
  const [open,        setOpen]        = useState(false);
  const [searching,   setSearching]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { style, reposition } = useFloatingPosition(open, inputRef, 260);

  // Reset display when value is cleared externally
  useEffect(() => { if (!value) { setSelected(null); setQuery(''); } }, [value]);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    setSelected(null);
    onChange(''); // clear form value while re-searching

    if (q.length < 3) { setSuggestions([]); setOpen(false); return; }

    setSearching(true);
    setOpen(true);
    try {
      const res = await customerService.list({ search: q, limit: 10 });
      setSuggestions(res.data.data.customers || []);
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = (c: CustomerSuggestion) => {
    setSelected(c);
    setQuery(c.customer_name);
    onChange(c.id);
    setOpen(false);
    setSuggestions([]);
  };

  const addrLine = (c: CustomerSuggestion) =>
    [c.area, c.city, c.state].filter(Boolean).join(', ');

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onFocus={() => {
            if (suggestions.length) {
              reposition();
              setOpen(true);
            }
          }}
          placeholder="Type 3+ letters to search customers…"
          autoComplete="off"
          className={cn(
            inputCls,
            'w-full pl-9 pr-8 text-sm border outline-none',
            selected && 'border-emerald-400 dark:border-emerald-600',
          )}
        />
        {searching
          ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          : selected
            ? <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-500" />
            : null
        }
      </div>

      {/* Selected chip */}
      {selected && (
        <div className="mt-1.5 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <div className="h-5 w-5 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
            {selected.customer_name.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 truncate">{selected.customer_name}</span>
          <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70">{selected.customer_phone}</span>
          <button
            type="button"
            onClick={() => { setSelected(null); setQuery(''); onChange(''); }}
            className="ml-auto text-emerald-500 hover:text-emerald-700 transition-colors text-xs font-bold"
          >✕</button>
        </div>
      )}

      {open && style && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          {createPortal(
            <div style={style} className="overflow-hidden rounded-xl border border-border bg-white dark:bg-zinc-900 shadow-2xl flex flex-col">
              {searching && suggestions.length === 0 ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                </div>
              ) : suggestions.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">No customers found</div>
              ) : (
                <>
                  <div className="px-3 py-2 border-b border-border/60 bg-muted/30">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {suggestions.length} result{suggestions.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <ul className="overflow-y-auto">
                    {suggestions.map(c => (
                      <li key={c.id}
                        onMouseDown={e => { e.preventDefault(); handleSelect(c); }}
                        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-accent transition-colors border-b border-border/30 last:border-0"
                      >
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                          {c.customer_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{c.customer_name}</p>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-2.5 w-2.5" /> {c.customer_phone}
                            </span>
                            {addrLine(c) && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                                <MapPin className="h-2.5 w-2.5 shrink-0" /> {addrLine(c)}
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}

// ── SearchableDropdown ────────────────────────────────────────────────────────
// Uses createPortal + position:fixed so the popup escapes any overflow container
// and always has a solid opaque background.
function SearchableDropdown({
  value, onChange, options, placeholder, loading, className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  loading?: boolean;
  className?: string;
}) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const triggerRef = useRef<HTMLDivElement>(null);
  const { style, reposition } = useFloatingPosition(open, triggerRef, 220);

  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const selected = options.find(o => o.value === value);

  const handleOpen = () => {
    reposition();
    setQuery('');
    setOpen(true);
  };

  return (
    <div className={cn('relative', className)}>
      {/* Trigger button */}
      <div
        ref={triggerRef}
        className={cn(inputCls, 'flex items-center justify-between px-3 cursor-pointer border rounded-xl bg-background')}
        onClick={handleOpen}
      >
        <span className={cn('text-sm flex-1 truncate', !selected && 'text-muted-foreground')}>
          {selected ? selected.label : placeholder || 'Select…'}
        </span>
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        }
      </div>

      {/* Click-away overlay + portal dropdown */}
      {open && style && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          {createPortal(
            <div
              style={style}
              className="overflow-hidden rounded-xl border border-border bg-white dark:bg-zinc-900 shadow-2xl flex flex-col"
            >
              {/* Search input */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
                />
              </div>
              {/* Options list */}
              <ul className="overflow-y-auto py-1">
                {filtered.length === 0 && (
                  <li className="px-3 py-2 text-sm text-muted-foreground">No results</li>
                )}
                {filtered.map(o => (
                  <li
                    key={o.value}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer transition-colors hover:bg-accent',
                      value === o.value && 'bg-primary/10 text-primary',
                    )}
                    onMouseDown={e => { e.preventDefault(); onChange(o.value); setOpen(false); }}
                  >
                    {value === o.value && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    <span className={value === o.value ? 'font-medium' : ''}>{o.label}</span>
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title, gradient }: { icon: React.ElementType; title: string; gradient: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className={cn('h-8 w-8 rounded-xl flex items-center justify-center text-white shadow-sm bg-gradient-to-br', gradient)}>
        <Icon className="h-4 w-4" />
      </div>
      <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">{title}</h3>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive font-medium">{error}</p>}
    </div>
  );
}

// ── Main LeadForm component ────────────────────────────────────────────────────
interface LeadFormProps {
  initialData?: Partial<Lead>;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  loading?: boolean;
  isEditMode?: boolean;
}

export default function LeadForm({ initialData = {}, onSubmit, loading = false, isEditMode = false }: LeadFormProps) {
  // Master data
  const [lobs,        setLobs]        = useState<{ id: string; name: string }[]>([]);
  const [products,    setProducts]    = useState<{ id: string; name: string }[]>([]);
  const [subProducts, setSubProducts] = useState<{ id: string; name: string }[]>([]);
  const [employees,   setEmployees]   = useState<{ id: string; full_name: string }[]>([]);
  const [brokers,     setBrokers]     = useState<{ id: string; full_name: string; broker_code: string }[]>([]);
  const [loadingLobs, setLoadingLobs] = useState(false);
  const [loadingProd, setLoadingProd] = useState(false);
  const [loadingSub,  setLoadingSub]  = useState(false);

  // Follow-ups & documents local state
  const [followUps, setFollowUps] = useState<LeadFollowUp[]>(
    initialData.follow_ups?.length ? initialData.follow_ups : [makeFollowUp()]
  );
  const [documents, setDocuments] = useState<LeadDocument[]>(
    initialData.documents?.length ? initialData.documents : []
  );

  const form = useForm<LeadFormValues>({
    defaultValues: {
      lead_name:    initialData.lead_name    || '',
      phone_number: initialData.phone_number || '',
      email:        initialData.email        || '',
      expected_premium: initialData.expected_premium != null ? String(initialData.expected_premium) : '',
      referred_by_type: (initialData.referred_by_type as LeadFormValues['referred_by_type']) || 'SELF',
      referred_by_sub_broker_id: initialData.referred_by_sub_broker_id || '',
      referred_by_customer_id:   initialData.referred_by_customer_id   || '',
      lob_id:        initialData.lob_id        || '',
      product_id:    initialData.product_id    || '',
      sub_product_id: initialData.sub_product_id || '',
      assigned_to:   initialData.assigned_to   || '',
      status:        (initialData.status as LeadFormValues['status']) || 'NEW',
      notes:         initialData.notes         || '',
    },
    mode: 'onTouched',
  });

  const { register, control, handleSubmit, watch, setValue, formState: { errors } } = form;
  const leadName     = watch('lead_name');
  const referralType = watch('referred_by_type');

  // When user picks a customer from the suggestions dropdown, auto-fill all fields
  const handleCustomerSelect = useCallback((c: CustomerSuggestion) => {
    setValue('lead_name',    c.customer_name,    { shouldValidate: true });
    setValue('phone_number', c.customer_phone,   { shouldValidate: true });
    setValue('email',        c.customer_email || '', { shouldValidate: false });
    if (c.referred_by_type) {
      setValue('referred_by_type', c.referred_by_type as LeadFormValues['referred_by_type']);
    }
    if (c.referred_by_sub_broker_id) setValue('referred_by_sub_broker_id', c.referred_by_sub_broker_id);
    if (c.referred_by_customer_id)   setValue('referred_by_customer_id',   c.referred_by_customer_id);
  }, [setValue]);
  const lobId        = watch('lob_id');
  const productId    = watch('product_id');

  // Load LOBs
  useEffect(() => {
    setLoadingLobs(true);
    masterDataService.getLobs({ is_active: true })
      .then(r => setLobs(r.data.data.lobs || []))
      .catch(() => {})
      .finally(() => setLoadingLobs(false));
  }, []);

  // Load Products when LOB changes
  useEffect(() => {
    if (!lobId) { setProducts([]); setValue('product_id', ''); setValue('sub_product_id', ''); return; }
    setLoadingProd(true);
    masterDataService.getProducts({ lob_id: lobId, is_active: true })
      .then(r => setProducts(r.data.data.products || []))
      .catch(() => {})
      .finally(() => setLoadingProd(false));
  }, [lobId]);

  // Load SubProducts when Product changes
  useEffect(() => {
    if (!productId) { setSubProducts([]); setValue('sub_product_id', ''); return; }
    setLoadingSub(true);
    masterDataService.getSubProducts({ product_id: productId, is_active: true })
      .then(r => setSubProducts(r.data.data.subProducts || r.data.data.sub_products || []))
      .catch(() => {})
      .finally(() => setLoadingSub(false));
  }, [productId]);

  // Load employees + brokers on mount
  useEffect(() => {
    Promise.allSettled([
      employeeService.list().then(r => setEmployees(r.data.data.employees || [])),
      subBrokerService.list().then(r => setBrokers(r.data.data.brokers || [])),
    ]);
  }, []);


  // Follow-up handlers
  const addFollowUp = useCallback(() => setFollowUps(f => [...f, makeFollowUp()]), []);
  const removeFollowUp = useCallback((i: number) => setFollowUps(f => f.filter((_, idx) => idx !== i)), []);
  const updateFollowUp = useCallback(<K extends keyof LeadFollowUp>(i: number, key: K, val: LeadFollowUp[K]) => {
    setFollowUps(f => f.map((fu, idx) => idx === i ? { ...fu, [key]: val } : fu));
  }, []);

  // Document handlers
  const addDoc    = useCallback(() => setDocuments(d => [...d, makeDoc()]), []);
  const removeDoc = useCallback((i: number) => setDocuments(d => d.filter((_, idx) => idx !== i)), []);
  const updateDoc = useCallback(<K extends keyof LeadDocument>(i: number, key: K, val: LeadDocument[K]) => {
    setDocuments(d => d.map((doc, idx) => idx === i ? { ...doc, [key]: val } : doc));
  }, []);

  const onFormSubmit = async (values: LeadFormValues) => {
    const payload: Record<string, unknown> = {
      ...values,
      expected_premium: values.expected_premium ? parseFloat(values.expected_premium) : undefined,
      email:            values.email || undefined,
      lob_id:           values.lob_id        || undefined,
      product_id:       values.product_id    || undefined,
      sub_product_id:   values.sub_product_id || undefined,
      assigned_to:      values.assigned_to   || undefined,
      referred_by_sub_broker_id: values.referred_by_type === 'SUB_BROKER' ? values.referred_by_sub_broker_id || undefined : undefined,
      referred_by_customer_id:   values.referred_by_type === 'CUSTOMER'   ? values.referred_by_customer_id   || undefined : undefined,
      follow_ups: followUps.filter(f => f.notes || f.follow_up_date),
      documents:  documents.filter(d => d.document_type && d.file_name),
    };
    await onSubmit(payload);
  };

  const lobOptions     = lobs.map(l => ({ value: l.id, label: l.name }));
  const productOptions = products.map(p => ({ value: p.id, label: p.name }));
  const subProdOptions = subProducts.map(s => ({ value: s.id, label: s.name }));
  const empOptions     = employees.map(e => ({ value: e.id, label: e.full_name }));
  const brokerOptions  = brokers.map(b => ({ value: b.id, label: `${b.full_name} (${b.broker_code})` }));

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="h-full flex flex-col max-w-4xl mx-auto">
      <div className="flex-1 overflow-y-auto rounded-2xl border border-border/60 shadow-2xl shadow-black/10 bg-card">

        {/* Header banner */}
        <div className="sticky top-0 z-10 px-8 py-5 border-b bg-gradient-to-r from-indigo-50/80 to-violet-50/80 dark:from-indigo-950/40 dark:to-violet-950/40">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">{isEditMode ? 'Edit Lead' : 'New Lead'}</h2>
              <p className="text-xs text-muted-foreground">
                {isEditMode ? 'Update lead information below' : 'Fill in the lead details below'}
              </p>
            </div>
          </div>
        </div>

        <div className="px-8 py-7 space-y-10">

          {/* ── BASIC INFO ─────────────────────────────────────────────────── */}
          <section>
            <SectionHeader icon={User} title="Basic Information" gradient="from-blue-500 to-indigo-600" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <Field label="Lead Name *" error={errors.lead_name?.message}>
                <CustomerSearchInput
                  value={leadName}
                  onChange={v => setValue('lead_name', v, { shouldValidate: true })}
                  onSelectCustomer={handleCustomerSelect}
                  error={errors.lead_name?.message}
                />
              </Field>
              <Field label="Phone Number *" error={errors.phone_number?.message}>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input {...register('phone_number', { required: 'Phone is required', pattern: { value: /^[6-9]\d{9}$/, message: 'Enter valid 10-digit mobile' } })}
                    type="tel" placeholder="9876543210" className={cn(inputCls, 'pl-9')} />
                </div>
              </Field>
              <Field label="Email" error={errors.email?.message}>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input {...register('email')} type="email" placeholder="john@example.com" className={cn(inputCls, 'pl-9')} />
                </div>
              </Field>
            </div>
          </section>

          {/* ── INTEREST ───────────────────────────────────────────────────── */}
          <section>
            <SectionHeader icon={TrendingUp} title="Insurance Interest" gradient="from-emerald-500 to-teal-600" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <Field label="Line of Business">
                <Controller name="lob_id" control={control} render={({ field }) => (
                  <SearchableDropdown value={field.value || ''} onChange={v => { field.onChange(v); setValue('product_id', ''); setValue('sub_product_id', ''); }}
                    options={lobOptions} placeholder="Select LOB…" loading={loadingLobs} />
                )} />
              </Field>
              <Field label="Product">
                <Controller name="product_id" control={control} render={({ field }) => (
                  <SearchableDropdown value={field.value || ''} onChange={v => { field.onChange(v); setValue('sub_product_id', ''); }}
                    options={productOptions} placeholder={lobId ? 'Select product…' : 'Select LOB first'}
                    loading={loadingProd} />
                )} />
              </Field>
              <Field label="Sub Product">
                <Controller name="sub_product_id" control={control} render={({ field }) => (
                  <SearchableDropdown value={field.value || ''} onChange={field.onChange}
                    options={subProdOptions} placeholder={productId ? 'Select sub product…' : 'Select product first'}
                    loading={loadingSub} />
                )} />
              </Field>
              <Field label="Expected Premium (₹)">
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input {...register('expected_premium')} type="number" placeholder="50000" className={cn(inputCls, 'pl-9')} />
                </div>
              </Field>
            </div>
          </section>

          {/* ── SOURCE / REFERRAL ──────────────────────────────────────────── */}
          <section>
            <SectionHeader icon={Building2} title="Lead Source" gradient="from-amber-500 to-orange-600" />
            <div className="space-y-5">
              <Field label="Referred By">
                <Controller name="referred_by_type" control={control} render={({ field }) => (
                  <div className="flex gap-2 flex-wrap">
                    {REFERRAL_TYPES.map(rt => (
                      <button key={rt.value} type="button"
                        onClick={() => { field.onChange(rt.value); setValue('referred_by_sub_broker_id', ''); setValue('referred_by_customer_id', ''); }}
                        className={cn('px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all',
                          field.value === rt.value
                            ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border-transparent shadow-md'
                            : 'border-border text-muted-foreground hover:border-amber-400 hover:text-amber-600'
                        )}>
                        {rt.label}
                      </button>
                    ))}
                  </div>
                )} />
              </Field>

              {referralType === 'SUB_BROKER' && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                  <Field label="Sub Broker">
                    <Controller name="referred_by_sub_broker_id" control={control} render={({ field }) => (
                      <SearchableDropdown value={field.value || ''} onChange={field.onChange}
                        options={brokerOptions} placeholder="Search sub broker…" />
                    )} />
                  </Field>
                </motion.div>
              )}

              {referralType === 'CUSTOMER' && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                  <Field label="Referring Customer">
                    <Controller name="referred_by_customer_id" control={control} render={({ field }) => (
                      <CustomerReferralSearch value={field.value || ''} onChange={field.onChange} />
                    )} />
                  </Field>
                </motion.div>
              )}
            </div>
          </section>

          {/* ── ASSIGNMENT & STATUS ────────────────────────────────────────── */}
          <section>
            <SectionHeader icon={UserCheck} title="Assignment & Status" gradient="from-violet-500 to-purple-600" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Assign To">
                <Controller name="assigned_to" control={control} render={({ field }) => (
                  <SearchableDropdown value={field.value || ''} onChange={field.onChange}
                    options={empOptions} placeholder="Select employee…" />
                )} />
              </Field>
              <Field label="Lead Status">
                <Controller name="status" control={control} render={({ field }) => (
                  <div className="flex gap-2 flex-wrap">
                    {STATUS_OPTIONS.map(s => (
                      <button key={s.value} type="button"
                        onClick={() => field.onChange(s.value)}
                        className={cn('px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all',
                          field.value === s.value ? s.color + ' border-current shadow-sm' : 'border-border text-muted-foreground hover:border-border/80'
                        )}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                )} />
              </Field>
            </div>
          </section>

          {/* ── FOLLOW-UPS ─────────────────────────────────────────────────── */}
          <section>
            <SectionHeader icon={Calendar} title="Follow-ups" gradient="from-rose-500 to-pink-600" />
            <div className="space-y-3">
              {followUps.map((fu, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3 items-start p-4 rounded-xl border border-border/60 bg-muted/20">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Date</Label>
                      <Input type="datetime-local" value={fu.follow_up_date || ''}
                        onChange={e => updateFollowUp(i, 'follow_up_date', e.target.value)}
                        className={cn(inputCls, 'text-sm')} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs text-muted-foreground mb-1 block">Notes</Label>
                      <Input value={fu.notes || ''} onChange={e => updateFollowUp(i, 'notes', e.target.value)}
                        placeholder="What was discussed…" className={inputCls} />
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-2 pt-6">
                    <button type="button"
                      onClick={() => updateFollowUp(i, 'is_done', !fu.is_done)}
                      className={cn('h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all',
                        fu.is_done ? 'bg-green-500 border-green-500' : 'border-border hover:border-green-400'
                      )}
                      title="Mark done">
                      {fu.is_done && <Check className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />}
                    </button>
                    {followUps.length > 1 && (
                      <button type="button" onClick={() => removeFollowUp(i)}
                        className="text-destructive/60 hover:text-destructive transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addFollowUp}
                className="gap-2 rounded-xl text-xs font-semibold">
                <Plus className="h-3.5 w-3.5" /> Add Follow-up
              </Button>
            </div>
          </section>

          {/* ── DOCUMENTS ──────────────────────────────────────────────────── */}
          <section>
            <SectionHeader icon={FileText} title="Documents" gradient="from-teal-500 to-cyan-600" />
            <div className="space-y-3">
              {documents.map((doc, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl border border-border/60 bg-muted/20">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Type</Label>
                    <select value={doc.document_type}
                      onChange={e => updateDoc(i, 'document_type', e.target.value as LeadDocument['document_type'])}
                      className={cn(inputCls, 'w-full px-3 border rounded-xl bg-background/80 text-sm')}>
                      {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">File Name</Label>
                    <Input value={doc.file_name} onChange={e => updateDoc(i, 'file_name', e.target.value)}
                      placeholder="document.pdf" className={inputCls} />
                  </div>
                  <div className="relative">
                    <Label className="text-xs text-muted-foreground mb-1 block">File URL / Path</Label>
                    <div className="flex gap-2">
                      <Input value={doc.file_url} onChange={e => updateDoc(i, 'file_url', e.target.value)}
                        placeholder="https://…" className={cn(inputCls, 'flex-1')} />
                      <button type="button" onClick={() => removeDoc(i)}
                        className="text-destructive/60 hover:text-destructive transition-colors px-2">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addDoc}
                className="gap-2 rounded-xl text-xs font-semibold">
                <Plus className="h-3.5 w-3.5" /> Add Document
              </Button>
            </div>
          </section>

          {/* ── NOTES ──────────────────────────────────────────────────────── */}
          <section>
            <SectionHeader icon={MessageSquare} title="Notes" gradient="from-slate-500 to-gray-600" />
            <div>
              <textarea {...register('notes')}
                rows={4}
                placeholder="Any additional notes about this lead…"
                className={cn(inputCls, 'w-full px-4 py-3 resize-none h-auto rounded-xl border border-border/70 bg-background/80 text-sm focus:outline-none focus:border-primary/60 transition-all')}
              />
            </div>
          </section>

        </div>
      </div>

      {/* Sticky footer */}
      <div className="shrink-0 flex items-center justify-between gap-4 mt-4 px-2">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">All fields marked * are required</span>
        </div>
        <Button type="submit" disabled={loading}
          className="gap-2 px-8 h-11 rounded-xl font-bold text-white bg-gradient-to-r from-indigo-500 to-violet-600 shadow-lg hover:shadow-xl hover:brightness-110 active:scale-[0.98] transition-all">
          {loading
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
            : <><Check className="h-4 w-4" /> {isEditMode ? 'Save Changes' : 'Create Lead'}</>
          }
        </Button>
      </div>
    </form>
  );
}
