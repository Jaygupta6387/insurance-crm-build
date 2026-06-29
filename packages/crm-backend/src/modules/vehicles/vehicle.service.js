const { resolveCompanyDb } = require('../dynamic-db/dbResolver');

const NOT_APPLICABLE = 'NOT APPLICABLE';

const vehicleInclude = {
  rto_code: { select: { id: true, rto_code: true, rto_name: true, city: true } },
  make: { select: { id: true, make_name: true } },
  model: { select: { id: true, model_name: true } },
  variant: { select: { id: true, variant_name: true } },
};

/** Normalizes registration number: uppercased, or "NOT APPLICABLE" for new vehicles. */
const normalizeRegistration = (data) => {
  if (data.is_new_registration) return NOT_APPLICABLE;
  return (data.registration_number || '').toUpperCase().replace(/\s+/g, '');
};

const buildVehicleData = (data) => ({
  ...(data.rto_code_id !== undefined && { rto_code_id: data.rto_code_id || null }),
  ...(data.chassis_last6 !== undefined && {
    chassis_last6: data.chassis_last6 ? data.chassis_last6.toUpperCase() : null,
  }),
  ...(data.make_id !== undefined && { make_id: data.make_id || null }),
  ...(data.model_id !== undefined && { model_id: data.model_id || null }),
  ...(data.variant_id !== undefined && { variant_id: data.variant_id || null }),
  ...(data.manufacture_year !== undefined && { manufacture_year: data.manufacture_year ?? null }),
  ...(data.registration_date !== undefined && {
    registration_date: data.registration_date ? new Date(data.registration_date) : null,
  }),
  ...(data.fuel_type !== undefined && { fuel_type: data.fuel_type || null }),
  ...(data.cubic_capacity !== undefined && { cubic_capacity: data.cubic_capacity ?? null }),
  ...(data.battery_capacity !== undefined && { battery_capacity: data.battery_capacity || null }),
  ...(data.seating_capacity !== undefined && { seating_capacity: data.seating_capacity ?? null }),
});

/** Adds `has_active_policy` to each vehicle so the UI can block double-insuring. */
const decorateWithPolicyState = async (db, vehicles) => {
  if (!vehicles.length) return vehicles;
  const ids = vehicles.map((v) => v.id);
  const policies = await db.policy.findMany({
    where: { vehicle_id: { in: ids }, status: { not: 'CANCELLED' } },
    select: { id: true, vehicle_id: true, policy_number: true, status: true },
  });
  const byVehicle = new Map();
  policies.forEach((p) => byVehicle.set(p.vehicle_id, p));
  return vehicles.map((v) => ({
    ...v,
    active_policy: byVehicle.get(v.id) || null,
    has_active_policy: byVehicle.has(v.id),
  }));
};

const getVehiclesByCustomer = async (customerId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const vehicles = await db.vehicle.findMany({
    where: { customer_id: customerId, deleted_at: null },
    include: vehicleInclude,
    orderBy: { created_at: 'desc' },
  });
  return decorateWithPolicyState(db, vehicles);
};

const getVehicle = async (id, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const vehicle = await db.vehicle.findFirst({
    where: { id, deleted_at: null },
    include: vehicleInclude,
  });
  if (!vehicle) throw Object.assign(new Error('Vehicle not found'), { statusCode: 404 });
  return vehicle;
};

const assertUniqueRegistration = async (db, registration, excludeId) => {
  if (!registration || registration === NOT_APPLICABLE) return;
  const existing = await db.vehicle.findFirst({
    where: {
      registration_number: registration,
      deleted_at: null,
      ...(excludeId && { id: { not: excludeId } }),
    },
  });
  if (existing) {
    throw Object.assign(new Error('A vehicle with this registration number already exists'), {
      statusCode: 409,
    });
  }
};

const createVehicle = async (data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);

  const customer = await db.customer.findFirst({
    where: { id: data.customer_id, deleted_at: null },
    select: { id: true },
  });
  if (!customer) throw Object.assign(new Error('Customer not found'), { statusCode: 404 });

  const registration_number = normalizeRegistration(data);
  await assertUniqueRegistration(db, registration_number);

  return db.vehicle.create({
    data: {
      customer_id: data.customer_id,
      registration_number,
      is_new_registration: !!data.is_new_registration,
      ...buildVehicleData(data),
      created_by: userId,
    },
    include: vehicleInclude,
  });
};

const updateVehicle = async (id, data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);
  const vehicle = await db.vehicle.findFirst({ where: { id, deleted_at: null } });
  if (!vehicle) throw Object.assign(new Error('Vehicle not found'), { statusCode: 404 });

  let registration_number;
  if (data.is_new_registration !== undefined || data.registration_number !== undefined) {
    const merged = {
      is_new_registration:
        data.is_new_registration !== undefined ? data.is_new_registration : vehicle.is_new_registration,
      registration_number:
        data.registration_number !== undefined ? data.registration_number : vehicle.registration_number,
    };
    registration_number = normalizeRegistration(merged);
    await assertUniqueRegistration(db, registration_number, id);
  }

  return db.vehicle.update({
    where: { id },
    data: {
      ...(registration_number !== undefined && { registration_number }),
      ...(data.is_new_registration !== undefined && { is_new_registration: data.is_new_registration }),
      ...buildVehicleData(data),
      updated_by: userId,
    },
    include: vehicleInclude,
  });
};

const deleteVehicle = async (id, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);
  const vehicle = await db.vehicle.findFirst({ where: { id, deleted_at: null } });
  if (!vehicle) throw Object.assign(new Error('Vehicle not found'), { statusCode: 404 });

  const activePolicy = await db.policy.findFirst({
    where: { vehicle_id: id, status: { not: 'CANCELLED' } },
    select: { id: true },
  });
  if (activePolicy) {
    throw Object.assign(new Error('Cannot delete a vehicle that has an active policy'), {
      statusCode: 400,
    });
  }

  await db.vehicle.update({
    where: { id },
    data: { deleted_at: new Date(), is_active: false, updated_by: userId },
  });
  return { id };
};

/**
 * Auto-resolves an RTO from the leading 4 characters of a registration number
 * (e.g. "DL01AB1234" => "DL01"). Returns null when no match is found.
 */
const lookupRtoByRegistration = async (registration, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const prefix = (registration || '').toUpperCase().replace(/\s+/g, '').slice(0, 4);
  if (prefix.length < 4) return null;
  return db.rtoCode.findFirst({
    where: { rto_code: prefix, is_active: true },
    select: { id: true, rto_code: true, rto_name: true, city: true },
  });
};

module.exports = {
  getVehiclesByCustomer,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  lookupRtoByRegistration,
};
