/**
 * Reference map of all 37 Indian GST State/UT codes.
 * Mapped as clean 2-digit numeric codes to state names.
 */
export const INDIAN_STATES = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

/**
 * Validates whether a given code is a known 2-digit GST state code.
 * @param {string} code
 * @returns {boolean}
 */
export function isValidStateCode(code) {
  if (!code || typeof code !== 'string') return false;
  const clean = code.trim();
  return Boolean(INDIAN_STATES[clean]);
}

/**
 * Returns human-readable state name from clean 2-digit code.
 * @param {string} code 2-digit code
 * @returns {string} State name or fallback
 */
export function getStateNameByCode(code) {
  if (!code || typeof code !== 'string') return 'Unknown State';
  const clean = code.trim();
  return INDIAN_STATES[clean] || `State (${clean})`;
}

/**
 * Extracts 2-digit state code from GSTIN.
 * A standard GSTIN starts with a 2-digit state code (e.g. "24AKBPC4941M1ZA" -> "24").
 * @param {string} gstin
 * @returns {string|null} 2-digit code or null
 */
export function getStateCodeFromGSTIN(gstin) {
  if (!gstin || typeof gstin !== 'string') return null;
  const clean = gstin.trim().toUpperCase();
  if (clean.length < 2) return null;
  const prefix = clean.slice(0, 2);
  if (/^\d{2}$/.test(prefix) && INDIAN_STATES[prefix]) {
    return prefix;
  }
  return null;
}

/**
 * Resolves a customer's definitive 2-digit state code using the strict precedence rule:
 * 1. GSTIN-derived state ALWAYS wins when a valid GSTIN is present.
 * 2. Manual customer.state is used strictly as a fallback for customers with no GSTIN.
 * @param {Object} customer
 * @returns {string|null} 2-digit state code or null
 */
export function resolveCustomerStateCode(customer) {
  if (!customer) return null;

  // Rule 1: GSTIN always wins if valid
  if (customer.gstin) {
    const fromGstin = getStateCodeFromGSTIN(customer.gstin);
    if (fromGstin) return fromGstin;
  }

  // Rule 2: Manual state fallback for unregistered customers
  if (customer.state) {
    const cleanState = customer.state.trim();
    if (isValidStateCode(cleanState)) {
      return cleanState;
    }
  }

  // Default for unregistered retail counter customers without explicit state
  return '24';
}

/**
 * Determines tax type (INTRASTATE vs INTERSTATE).
 * @param {Object} params
 * @param {string} params.customerStateCode 2-digit state code
 * @param {string} params.companyGstin Company GSTIN to derive home state (default "24" / Gujarat)
 * @returns {'INTRASTATE'|'INTERSTATE'}
 */
export function determineTaxType({ customerStateCode, companyGstin }) {
  const companyStateCode = getStateCodeFromGSTIN(companyGstin) || '24';
  const custCode = customerStateCode ? customerStateCode.trim() : null;

  if (!custCode) {
    // If unknown, default to INTRASTATE
    return 'INTRASTATE';
  }

  return custCode === companyStateCode ? 'INTRASTATE' : 'INTERSTATE';
}
