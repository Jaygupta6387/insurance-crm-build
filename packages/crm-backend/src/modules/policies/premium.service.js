const { resolveCompanyDb } = require('../dynamic-db/dbResolver');
const { getZone, getCcBracket, getAgeBracket } = require('../../constants/motor.constants');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);

/**
 * Resolves a premium rate row — requires both product_id and sub_product_id.
 * No fallback; if either is missing or no row matches, caller uses manual entry.
 */
const resolveRate = async (db, { product_id, sub_product_id, zone, cc_bracket, age_bracket }) => {
  if (!product_id || !sub_product_id) return null;

  return db.motorPremiumRate.findFirst({
    where: {
      product_id,
      sub_product_id,
      zone,
      cc_bracket,
      age_bracket,
      is_active: true,
    },
  });
};

/**
 * Resolves the GST rate: product-specific -> global (product_id NULL).
 * Returns { gst_on_od_percent, gst_on_tp_percent }.
 */
const resolveGst = async (db, { product_id }) => {
  let row = null;
  if (product_id) {
    row = await db.gstRate.findFirst({ where: { product_id, is_active: true } });
  }
  if (!row) {
    row = await db.gstRate.findFirst({ where: { product_id: null, is_active: true }, orderBy: { created_at: 'asc' } });
  }
  return {
    gst_on_od_percent: row ? num(row.gst_on_od_percent ?? row.gst_percent) : 0,
    gst_on_tp_percent: row ? num(row.gst_on_tp_percent ?? row.gst_percent) : 0,
  };
};

/** Resolves single GST percent for Health / Life / SME LOBs. */
const resolveHealthGst = async (db, { lob_id, product_id }) => {
  let row = null;
  if (product_id) {
    row = await db.gstRate.findFirst({
      where: { product_id, is_active: true, ...(lob_id && { lob_id }) },
    });
  }
  if (!row && lob_id) {
    row = await db.gstRate.findFirst({
      where: { lob_id, product_id: null, is_active: true },
      orderBy: { created_at: 'asc' },
    });
  }
  if (!row) {
    row = await db.gstRate.findFirst({
      where: { product_id: null, lob_id: null, is_active: true },
      orderBy: { created_at: 'asc' },
    });
  }
  return { gst_percent: row ? num(row.gst_percent ?? row.gst_on_od_percent) : 0 };
};

/**
 * Computes the full motor premium breakdown.
 *
 * Scenario A (product + sub-product rate row found): basic from IDV × OD rate, fixed TP.
 * Scenario B (missing product/sub-product or no rate row): manual basic & TP premiums.
 */
const calculatePremium = async (input, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const zone = input.zone || getZone(input.rto_city || '');
  const cc_bracket = getCcBracket(num(input.cubic_capacity));
  const age_bracket = getAgeBracket(num(input.manufacture_year) || new Date().getFullYear());

  const rate = await resolveRate(db, {
    product_id: input.product_id || null,
    sub_product_id: input.sub_product_id || null,
    zone,
    cc_bracket,
    age_bracket,
  });

  const rate_source = rate ? 'DB' : 'MANUAL';
  const idv = num(input.idv);
  const discount_percent = num(input.discount_percent);
  const ncb_percent = num(input.ncb_percent);
  const addon_premium = num(input.addon_premium);

  const od_rate_percent = rate ? num(rate.od_rate_percent) : 0;
  const basic_premium = rate ? round2((idv * od_rate_percent) / 100) : num(input.basic_premium);

  const basic_after_discount = round2(basic_premium * (1 - discount_percent / 100));
  const od_premium = round2(basic_after_discount * (1 - ncb_percent / 100));

  const tp_premium = rate ? num(rate.tp_premium) : num(input.tp_premium);

  const total_od_premium = round2(od_premium + addon_premium);
  const net_premium = round2(total_od_premium + tp_premium);

  const { gst_on_od_percent, gst_on_tp_percent } = await resolveGst(db, { product_id: input.product_id || null });
  const gst_on_od = round2((total_od_premium * gst_on_od_percent) / 100);
  const gst_on_tp = round2((tp_premium * gst_on_tp_percent) / 100);
  const total_gst = round2(gst_on_od + gst_on_tp);
  const total_premium = round2(net_premium + total_gst);

  return {
    rate_source,
    zone,
    cc_bracket,
    age_bracket,
    od_rate_percent,
    fixed_basic_premium: rate ? basic_premium : null,
    fixed_tp_premium: rate ? tp_premium : null,
    basic_premium,
    discount_percent,
    basic_after_discount,
    ncb_percent,
    od_premium,
    addon_premium,
    tp_premium,
    total_od_premium,
    net_premium,
    gst_on_od_percent,
    gst_on_tp_percent,
    gst_on_od,
    gst_on_tp,
    total_gst,
    total_premium,
  };
};

module.exports = { calculatePremium, resolveRate, resolveGst, resolveHealthGst, round2 };
