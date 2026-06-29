/**
 * Motor insurance shared constants and IRDAI tariff helpers.
 *
 * Single source of truth for the backend. Used by validators, the premium
 * calculation service, and the company-database seed routine. Keeping these
 * here (instead of hardcoding across services) keeps the motor domain DRY.
 */

// ─── Static enumerations ──────────────────────────────────────────────────────

const FUEL_TYPES = [
  'Petrol',
  'Diesel',
  'CNG In-Built',
  'CNG Out-Built',
  'Electric',
  'Hybrid',
];

/**
 * Package types. `tpYears` drives the TP end-date auto-calculation for the
 * long-term bundle plans (e.g. 1+3 => 3-year TP, 1+5 => 5-year TP).
 */
const PACKAGE_TYPES = [
  { value: 'Comprehensive Package', label: 'Comprehensive Package', tpYears: 1 },
  { value: 'Bundle Plan (1+3)', label: 'Bundle Plan (1+3)', tpYears: 3 },
  { value: 'Bundle Plan (3+3)', label: 'Bundle Plan (3+3)', tpYears: 3 },
  { value: 'Bundle Plan (2+2)', label: 'Bundle Plan (2+2)', tpYears: 2 },
  { value: 'Bundle Plan (1+5)', label: 'Bundle Plan (1+5)', tpYears: 5 },
  { value: 'Bundle Plan (5+5)', label: 'Bundle Plan (5+5)', tpYears: 5 },
  { value: 'SAOD', label: 'SAOD (Stand-alone OD)', tpYears: 0 },
  { value: 'SATP', label: 'SATP (Stand-alone TP)', tpYears: 1 },
];

const PAYMENT_MODES = [
  'Cash',
  'Cheque',
  'Bank Transfer',
  'UPI',
  'Credit Card',
  'Debit Card',
  'Online Payment',
];

const CLAIM_STATUSES = ['No Claim', 'Claimed', 'Pending'];

const POLICY_TYPES = ['New', 'Renew', 'Port', 'Used'];

const FUEL_TYPE_VALUES = FUEL_TYPES;
const PACKAGE_TYPE_VALUES = PACKAGE_TYPES.map((p) => p.value);
const PAYMENT_MODE_VALUES = PAYMENT_MODES;

// ─── IRDAI tariff helpers (Private Car / Four Wheeler) ────────────────────────

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

/** @param {string} rtoCity @returns {'A'|'B'} */
const getZone = (rtoCity) => {
  const city = String(rtoCity || '').toLowerCase().trim();
  return ZONE_A_CITIES.some((z) => city.includes(z)) ? 'A' : 'B';
};

/** @param {number} cc @returns {'lte1000'|'1000to1500'|'gt1500'} */
const getCcBracket = (cc) => {
  const value = Number(cc) || 0;
  if (value <= 1000) return 'lte1000';
  if (value <= 1500) return '1000to1500';
  return 'gt1500';
};

/** @param {number} manufactureYear @returns {'lte5'|'5to10'|'gt10'} */
const getAgeBracket = (manufactureYear) => {
  const age = new Date().getFullYear() - (Number(manufactureYear) || new Date().getFullYear());
  if (age <= 5) return 'lte5';
  if (age <= 10) return '5to10';
  return 'gt10';
};

const ZONES = ['A', 'B'];
const CC_BRACKETS = ['lte1000', '1000to1500', 'gt1500'];
const AGE_BRACKETS = ['lte5', '5to10', 'gt10'];

const CC_BRACKET_LABELS = {
  lte1000: '\u22641000 CC',
  '1000to1500': '1000\u20131500 CC',
  gt1500: '>1500 CC',
};

const AGE_BRACKET_LABELS = {
  lte5: 'Up to 5 years',
  '5to10': '5\u201310 years',
  gt10: 'Over 10 years',
};

// Private Car – Four Wheeler IRDAI tariff rates (% of IDV)
const PRIVATE_CAR_RATES = {
  lte5: {
    A: { lte1000: 3.127, '1000to1500': 3.283, gt1500: 3.440 },
    B: { lte1000: 3.039, '1000to1500': 3.191, gt1500: 3.343 },
  },
  '5to10': {
    A: { lte1000: 3.283, '1000to1500': 3.447, gt1500: 3.612 },
    B: { lte1000: 3.191, '1000to1500': 3.351, gt1500: 3.510 },
  },
  gt10: {
    A: { lte1000: 3.362, '1000to1500': 3.529, gt1500: 3.698 },
    B: { lte1000: 3.267, '1000to1500': 3.430, gt1500: 3.594 },
  },
};

// Private Car – Fixed TP Premium (₹) by CC bracket (IRDAI tariff)
const PRIVATE_CAR_TP_RATES = {
  lte1000: 2094,
  '1000to1500': 3416,
  gt1500: 7897,
};

/**
 * Flattens the nested tariff tables into seedable rows.
 * @returns {Array<{zone:string,cc_bracket:string,age_bracket:string,od_rate_percent:number,tp_premium:number}>}
 */
const buildPremiumRateSeedRows = () => {
  const rows = [];
  for (const age of AGE_BRACKETS) {
    for (const zone of ZONES) {
      for (const cc of CC_BRACKETS) {
        rows.push({
          zone,
          cc_bracket: cc,
          age_bracket: age,
          od_rate_percent: PRIVATE_CAR_RATES[age][zone][cc],
          tp_premium: PRIVATE_CAR_TP_RATES[cc],
        });
      }
    }
  }
  return rows;
};

module.exports = {
  FUEL_TYPES,
  FUEL_TYPE_VALUES,
  PACKAGE_TYPES,
  PACKAGE_TYPE_VALUES,
  PAYMENT_MODES,
  PAYMENT_MODE_VALUES,
  CLAIM_STATUSES,
  POLICY_TYPES,
  ZONES,
  CC_BRACKETS,
  AGE_BRACKETS,
  CC_BRACKET_LABELS,
  AGE_BRACKET_LABELS,
  PRIVATE_CAR_RATES,
  PRIVATE_CAR_TP_RATES,
  getZone,
  getCcBracket,
  getAgeBracket,
  buildPremiumRateSeedRows,
};
