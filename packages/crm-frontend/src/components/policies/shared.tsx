import { useState, useRef, useEffect, useCallback, type ReactNode, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Loader2, Search, Plus, Briefcase, User, Phone, MapPin, X, FileText, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFloatingPosition } from '@/lib/floatingPosition';

export const inputCls =
  'h-10 w-full rounded-xl border border-border/70 bg-background/80 px-3 text-sm outline-none transition-all duration-200 focus:border-primary/60 focus:ring-2 focus:ring-primary/15 disabled:opacity-60 disabled:cursor-not-allowed';

export const labelCls = 'text-xs font-semibold text-foreground/80';

// ── Field ───────────────────────────────────────────────────────────────────
interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}
export function Field({ label, required, error, hint, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className={labelCls}>
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {error && <p className="text-[11px] font-medium text-destructive">{error}</p>}
    </div>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────
interface SectionProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}
export function Section({ title, description, icon, action, children, className }: SectionProps) {
  return (
    <div className={cn('rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {icon && (
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {icon}
            </div>
          )}
          <div>
            <h3 className="text-sm font-bold text-foreground">{title}</h3>
            {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── SearchableDropdown ──────────────────────────────────────────────────────
export interface DropdownOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableDropdownProps {
  value?: string;
  onChange: (value: string, option?: DropdownOption) => void;
  options: DropdownOption[];
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  error?: string;
  searchable?: boolean;
  /** When set, search is server-driven — query changes trigger this callback (debounced). */
  onSearchChange?: (query: string) => void;
  onCreateNew?: (query: string) => void;
  createLabel?: string;
}

export function SearchableDropdown({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  loading = false,
  disabled = false,
  error,
  searchable = true,
  onSearchChange,
  onCreateNew,
  createLabel = 'Add new',
}: SearchableDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const { style, reposition } = useFloatingPosition(open, triggerRef);

  const selected = options.find((o) => o.value === value);

  useEffect(() => () => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  }, []);

  const handleQueryChange = (newQuery: string) => {
    setQuery(newQuery);
    if (!onSearchChange) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => onSearchChange(newQuery), 300);
  };

  const filtered = onSearchChange
    ? options
    : searchable && query
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(query.toLowerCase()) ||
            o.sublabel?.toLowerCase().includes(query.toLowerCase()),
        )
      : options;

  const toggle = () => {
    if (disabled) return;
    if (!open) {
      if (triggerRef.current) reposition();
      setQuery('');
      if (onSearchChange) onSearchChange('');
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={cn(
          inputCls,
          'flex items-center justify-between gap-2 text-left',
          error && 'border-destructive',
          !selected && 'text-muted-foreground',
        )}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
        )}
      </button>

      {open && style && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          {createPortal(
            <div
              style={style}
              className="flex flex-col overflow-hidden rounded-xl border border-border bg-white shadow-2xl dark:bg-zinc-900"
            >
              {searchable && (
                <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    placeholder="Search…"
                    className="w-full bg-transparent text-sm outline-none"
                  />
                </div>
              )}
              <div className="flex-1 overflow-y-auto py-1">
                {loading ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-muted-foreground">No results found</div>
                ) : (
                  filtered.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onChange(o.value, o);
                        setOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                        o.value === value && 'bg-primary/5',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-foreground">{o.label}</span>
                        {o.sublabel && <span className="block truncate text-[11px] text-muted-foreground">{o.sublabel}</span>}
                      </span>
                      {o.value === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  ))
                )}
              </div>
              {onCreateNew && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onCreateNew(query);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 border-t border-border/60 px-3 py-2.5 text-sm font-medium text-primary hover:bg-primary/5"
                >
                  <Plus className="h-4 w-4" /> {createLabel}
                  {query && <span className="text-muted-foreground">"{query}"</span>}
                </button>
              )}
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}

// ── SubBrokerSearch ─────────────────────────────────────────────────────────
import { subBrokerService } from '@/services/subBrokerService';

export interface SubBrokerHit {
  id: string;
  full_name: string;
  phone: string;
  broker_code?: string;
}

interface SubBrokerSearchProps {
  selectedName?: string;
  onSelect: (b: SubBrokerHit) => void;
  onClear: () => void;
  placeholder?: string;
  error?: string;
}

export function SubBrokerSearch({ selectedName, onSelect, onClear, placeholder, error }: SubBrokerSearchProps) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SubBrokerHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const { style, reposition } = useFloatingPosition(open, inputRef);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setOpen(true);
    try {
      const res = await subBrokerService.list({ search: q, status: 'ACTIVE', limit: 10 });
      setHits(res.data.data.brokers || []);
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      if (inputRef.current) reposition();
      search(q);
    }, 300);
  };

  useEffect(() => () => debounceRef.current && clearTimeout(debounceRef.current), []);

  if (selectedName) {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2',
          error && 'border-destructive',
        )}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Briefcase className="h-3.5 w-3.5 text-primary" /> {selectedName}
        </span>
        <button type="button" onClick={onClear} className="rounded-md p-1 hover:bg-muted">
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        value={query}
        onChange={handleChange}
        onFocus={() => {
          if (hits.length) {
            reposition();
            setOpen(true);
          }
        }}
        placeholder={placeholder || 'Type name or phone to search…'}
        autoComplete="off"
        className={cn(inputCls, 'pl-9 pr-8', error && 'border-destructive')}
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
      {!loading && query.length >= 2 && <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />}

      {open && style && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          {createPortal(
            <div style={style} className="flex flex-col overflow-hidden rounded-xl border border-border bg-white shadow-2xl dark:bg-zinc-900">
              {loading && hits.length === 0 ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                </div>
              ) : hits.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">No sub-brokers found</div>
              ) : (
                <div className="overflow-y-auto py-1">
                  {hits.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSelect(b);
                        setOpen(false);
                        setQuery('');
                      }}
                      className="flex w-full flex-col gap-0.5 px-4 py-2 text-left hover:bg-muted"
                    >
                      <span className="text-sm font-medium text-foreground">{b.full_name}</span>
                      <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {b.phone}</span>
                        {b.broker_code && <span>{b.broker_code}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}

// ── CustomerSearch ──────────────────────────────────────────────────────────
import { customerService } from '@/services/customerService';

export interface CustomerHit {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  area?: string | null;
  city?: string | null;
  state?: string | null;
}

interface CustomerSearchProps {
  selectedName?: string;
  onSelect: (c: CustomerHit) => void;
  onClear: () => void;
  placeholder?: string;
  error?: string;
}

export function CustomerSearch({ selectedName, onSelect, onClear, placeholder, error }: CustomerSearchProps) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { style, reposition } = useFloatingPosition(open, inputRef);

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    if (q.length < 3) {
      setHits([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    if (inputRef.current) reposition();
    setOpen(true);
    try {
      const res = await customerService.list({ search: q, limit: 10 });
      setHits(res.data.data.customers || []);
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  };

  if (selectedName) {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2',
          error && 'border-destructive',
        )}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <User className="h-3.5 w-3.5 text-primary" /> {selectedName}
        </span>
        <button type="button" onClick={onClear} className="rounded-md p-1 hover:bg-muted">
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        value={query}
        onChange={handleChange}
        onFocus={() => {
          if (hits.length) {
            reposition();
            setOpen(true);
          }
        }}
        placeholder={placeholder || 'Type 3+ letters to search…'}
        autoComplete="off"
        className={cn(inputCls, 'pl-9 pr-8', error && 'border-destructive')}
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
      {!loading && query.length >= 3 && <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />}

      {open && style && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          {createPortal(
            <div style={style} className="flex flex-col overflow-hidden rounded-xl border border-border bg-white shadow-2xl dark:bg-zinc-900">
              {loading && hits.length === 0 ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                </div>
              ) : hits.length === 0 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">No customers found</div>
              ) : (
                <div className="overflow-y-auto py-1">
                  {hits.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSelect(c);
                        setOpen(false);
                        setQuery('');
                      }}
                      className="flex w-full flex-col gap-0.5 px-4 py-2 text-left hover:bg-muted"
                    >
                      <span className="text-sm font-medium text-foreground">{c.customer_name}</span>
                      <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {c.customer_phone}</span>
                        {(c.city || c.area) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {[c.area, c.city].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}

// ── Document list editor (file_name + file_url convention) ───────────────────
interface DocItem {
  file_name: string;
  file_url: string;
}
interface DocumentListProps {
  documents: DocItem[];
  onChange: (docs: DocItem[]) => void;
  label?: string;
}
export function DocumentList({ documents, onChange, label = 'Attach document' }: DocumentListProps) {
  const add = () => onChange([...documents, { file_name: '', file_url: '' }]);
  const update = (i: number, patch: Partial<DocItem>) =>
    onChange(documents.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  const remove = (i: number) => onChange(documents.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {documents.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={d.file_name}
            onChange={(e) => update(i, { file_name: e.target.value })}
            placeholder="File name"
            className={cn(inputCls, 'flex-1')}
          />
          <input
            value={d.file_url}
            onChange={(e) => update(i, { file_url: e.target.value })}
            placeholder="File URL"
            className={cn(inputCls, 'flex-1')}
          />
          <button type="button" onClick={() => remove(i)} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> {label}
      </button>
    </div>
  );
}

// ── Currency helper ─────────────────────────────────────────────────────────
export const inr = (v: number | string | null | undefined): string => {
  const n = Number(v) || 0;
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
};
