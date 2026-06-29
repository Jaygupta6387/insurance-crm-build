/**
 * Motor insurance shared constants and IRDAI tariff helpers (frontend).
 *
 * Mirrors `backend/src/constants/motor.constants.js`. Drives static dropdowns,
 * bundle-plan TP date math, and client-side premium previews so the UI never
 * hardcodes domain values inline.
 */

export type Zone = 'A' | 'B';
export type CcBracket = 'lte1000' | '1000to1500' | 'gt1500';
export type AgeBracket = 'lte5' | '5to10' | 'gt10';

export interface SelectOption {
  value: string;
  label: string;
}

// ─── Static enumerations ──────────────────────────────────────────────────────

export const FUEL_TYPES: SelectOption[] = [
  { value: 'Petrol', label: 'Petrol' },
  { value: 'Diesel', label: 'Diesel' },
  { value: 'CNG In-Built', label: 'CNG In-Built' },
  { value: 'CNG Out-Built', label: 'CNG Out-Built' },
  { value: 'Electric', label: 'Electric' },
  { value: 'Hybrid', label: 'Hybrid' },
];

export interface PackageTypeOption extends SelectOption {
  /** Number of TP-cover years; drives bundle-plan TP end-date auto-calc. */
  tpYears: number;
}

export const PACKAGE_TYPES: PackageTypeOption[] = [
  { value: 'Comprehensive Package', label: 'Comprehensive Package', tpYears: 1 },
  { value: 'Bundle Plan (1+3)', label: 'Bundle Plan (1+3)', tpYears: 3 },
  { value: 'Bundle Plan (3+3)', label: 'Bundle Plan (3+3)', tpYears: 3 },
  { value: 'Bundle Plan (2+2)', label: 'Bundle Plan (2+2)', tpYears: 2 },
  { value: 'Bundle Plan (1+5)', label: 'Bundle Plan (1+5)', tpYears: 5 },
  { value: 'Bundle Plan (5+5)', label: 'Bundle Plan (5+5)', tpYears: 5 },
  { value: 'SAOD', label: 'SAOD (Stand-alone OD)', tpYears: 0 },
  { value: 'SATP', label: 'SATP (Stand-alone TP)', tpYears: 1 },
];

export const PAYMENT_MODES: SelectOption[] = [
  { value: 'Cash', label: 'Cash' },
  { value: 'Cheque', label: 'Cheque' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
  { value: 'UPI', label: 'UPI' },
  { value: 'Credit Card', label: 'Credit Card' },
  { value: 'Debit Card', label: 'Debit Card' },
  { value: 'Online Payment', label: 'Online Payment' },
];

export const CLAIM_STATUSES: SelectOption[] = [
  { value: 'No Claim', label: 'No Claim' },
  { value: 'Claimed', label: 'Claimed' },
  { value: 'Pending', label: 'Pending' },
];

/** Per-seat Personal Accident add-on rates (₹). */
export const PA_RATES = {
  /** Passenger PA ₹1 Lakh: seating_capacity × 50 */
  passenger1Lakh: 50,
  /** Passenger PA ₹2 Lakh: seating_capacity × 100 */
  passenger2Lakh: 100,
  /** Paid driver flat add-on. */
  paidDriver: 50,
} as const;

// ─── IRDAI tariff helpers (client-side preview) ───────────────────────────────

const ZONE_A_CITIES = [
  'ahmedabad',
  'bangalore', 'bengaluru',
  'chennai', 'madras',
  'hyderabad',
  'kolkata', 'calcutta',
  'mumbai', 'bombay',
  'new delhi', 'delhi',
  'pune', 'poona',
];

export const getZone = (rtoCity: string): Zone => {
  const city = (rtoCity || '').toLowerCase().trim();
  return ZONE_A_CITIES.some((z) => city.includes(z)) ? 'A' : 'B';
};

export const getCcBracket = (cc: number): CcBracket => {
  if (cc <= 1000) return 'lte1000';
  if (cc <= 1500) return '1000to1500';
  return 'gt1500';
};

export const getAgeBracket = (manufactureYear: number): AgeBracket => {
  const age = new Date().getFullYear() - manufactureYear;
  if (age <= 5) return 'lte5';
  if (age <= 10) return '5to10';
  return 'gt10';
};

export const CC_BRACKET_LABELS: Record<CcBracket, string> = {
  lte1000: '\u22641000 CC',
  '1000to1500': '1000\u20131500 CC',
  gt1500: '>1500 CC',
};

export const AGE_BRACKET_LABELS: Record<AgeBracket, string> = {
  lte5: 'Up to 5 years',
  '5to10': '5\u201310 years',
  gt10: 'Over 10 years',
};

export const ZONE_LABELS: Record<Zone, string> = {
  A: 'Zone A (Metro)',
  B: 'Zone B (Rest of India)',
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Returns a yyyy-mm-dd string. */
export const toDateInput = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const todayInput = (): string => toDateInput(new Date());

/**
 * Adds N years to a yyyy-mm-dd start date and subtracts one day.
 * e.g. 2025-04-01 + 1 year => 2026-03-31.
 */
export const addYearsMinusOneDay = (startDate: string, years: number): string => {
  if (!startDate || years <= 0) return '';
  const d = new Date(startDate);
  if (Number.isNaN(d.getTime())) return '';
  d.setFullYear(d.getFullYear() + years);
  d.setDate(d.getDate() - 1);
  return toDateInput(d);
};

/** Returns the TP cover years for a package value, defaulting to 1. */
export const getPackageTpYears = (packageValue: string): number =>
  PACKAGE_TYPES.find((p) => p.value === packageValue)?.tpYears ?? 1;

/**
 * Safely evaluates an additive premium expression like "100+200+400".
 * Returns 0 for invalid input. Only digits, +, spaces and dots are allowed.
 */
export const evaluateAdditiveExpression = (expr: string): number => {
  if (!expr) return 0;
  const cleaned = expr.replace(/\s/g, '');
  if (!/^[\d+.]+$/.test(cleaned)) return Number(cleaned) || 0;
  return cleaned
    .split('+')
    .filter(Boolean)
    .reduce((sum, part) => sum + (Number(part) || 0), 0);
};
