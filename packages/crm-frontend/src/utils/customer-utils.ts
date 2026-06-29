// ── Age Calculation ─────────────────────────────────────────────────────────
export function calculateAgeFromDob(dob: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}

/** Returns human-readable "X years Y months" string */
export function formatAgeFull(dob: string): string | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let years  = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth()    - birth.getMonth();
  if (today.getDate() < birth.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  if (years < 0) return null;
  if (years === 0) return `${months} month${months !== 1 ? 's' : ''}`;
  return months > 0 ? `${years} yr ${months} mo` : `${years} yr`;
}

// ── Location API ─────────────────────────────────────────────────────────────
const _stateCache: string[] = [];
const _cityCache: Record<string, string[]> = {};

export async function fetchIndiaStates(): Promise<string[]> {
  if (_stateCache.length) return _stateCache;
  try {
    const res = await fetch('https://countriesnow.space/api/v0.1/countries/states', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'India' }),
    });
    const json = await res.json();
    if (!json.error && json.data?.states) {
      const states: string[] = json.data.states.map((s: { name: string }) => s.name).sort();
      _stateCache.push(...states);
      return states;
    }
  } catch (_) {}
  // Fallback list if API is unreachable
  const fallback = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Delhi',
    'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
  ];
  _stateCache.push(...fallback);
  return fallback;
}

export async function fetchCitiesForState(state: string): Promise<string[]> {
  if (!state) return [];
  if (_cityCache[state]) return _cityCache[state];
  try {
    const res = await fetch('https://countriesnow.space/api/v0.1/countries/state/cities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'India', state }),
    });
    const json = await res.json();
    if (!json.error && Array.isArray(json.data)) {
      const cities: string[] = (json.data as string[]).sort();
      _cityCache[state] = cities;
      return cities;
    }
  } catch (_) {}
  return [];
}

// ── Document Types ───────────────────────────────────────────────────────────
export const DOC_TYPES = [
  { value: 'PAN_CARD',          label: 'PAN Card' },
  { value: 'AADHAR_CARD',       label: 'Aadhar Card' },
  { value: 'PASSPORT',          label: 'Passport' },
  { value: 'DRIVING_LICENSE',   label: 'Driving License' },
  { value: 'VOTER_ID',          label: 'Voter ID' },
  { value: 'CANCELLED_CHEQUE',  label: 'Cancelled Cheque' },
  { value: 'OTHER',             label: 'Other' },
] as const;

export type DocTypeValue = typeof DOC_TYPES[number]['value'];

// ── Bank Account Types ───────────────────────────────────────────────────────
export const ACCOUNT_TYPES = [
  { value: 'SAVINGS',  label: 'Savings' },
  { value: 'CURRENT',  label: 'Current' },
  { value: 'OTHER',    label: 'Other' },
] as const;
