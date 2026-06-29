const { resolveCompanyDb } = require('../dynamic-db/dbResolver');

// ─── MOTOR MAKES ──────────────────────────────────────────────────────────────

const getMotorMakes = async (companySlug, filters = {}) => {
  const db = await resolveCompanyDb(companySlug);
  const { search, is_active, page = 1, limit = 10, sort_by = 'created_at', sort_order = 'desc' } = filters;

  const where = {};
  if (is_active !== undefined) {
    where.is_active = is_active === 'true' || is_active === true;
  }
  if (search) {
    where.make_name = { contains: search, mode: 'insensitive' };
  }

  const skip = (page - 1) * limit;
  const orderBy = {};
  orderBy[sort_by === 'make_name' ? 'make_name' : 'created_at'] = sort_order === 'asc' ? 'asc' : 'desc';

  const [data, total] = await Promise.all([
    db.motorMake.findMany({ where, skip, take: parseInt(limit), orderBy }),
    db.motorMake.count({ where }),
  ]);

  return {
    data,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    },
  };
};

const createMotorMake = async (data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);

  // Check if make already exists
  const existing = await db.motorMake.findUnique({ where: { make_name: data.make_name } });
  if (existing) {
    throw Object.assign(new Error('Motor make already exists'), { statusCode: 409 });
  }

  return db.motorMake.create({
    data: {
      make_name: data.make_name,
      created_by: userId,
    },
  });
};

const updateMotorMake = async (id, data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);

  const make = await db.motorMake.findUnique({ where: { id } });
  if (!make) {
    throw Object.assign(new Error('Motor make not found'), { statusCode: 404 });
  }

  // Check if new name conflicts with another make
  if (data.make_name && data.make_name !== make.make_name) {
    const existing = await db.motorMake.findUnique({ where: { make_name: data.make_name } });
    if (existing) {
      throw Object.assign(new Error('Motor make name already exists'), { statusCode: 409 });
    }
  }

  return db.motorMake.update({
    where: { id },
    data: {
      ...(data.make_name !== undefined && { make_name: data.make_name }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
      updated_by: userId,
    },
  });
};

const deleteMotorMake = async (id, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const make = await db.motorMake.findUnique({ where: { id } });
  if (!make) {
    throw Object.assign(new Error('Motor make not found'), { statusCode: 404 });
  }

  // Check if models exist
  const models = await db.motorModel.count({ where: { make_id: id } });
  if (models > 0) {
    throw Object.assign(new Error('Cannot delete make with associated models'), { statusCode: 400 });
  }

  return db.motorMake.delete({ where: { id } });
};

// ─── MOTOR MODELS ─────────────────────────────────────────────────────────────

const getMotorModels = async (companySlug, filters = {}) => {
  const db = await resolveCompanyDb(companySlug);
  const { search, is_active, make_id, page = 1, limit = 10, sort_by = 'created_at', sort_order = 'desc' } = filters;

  const where = {};
  if (is_active !== undefined) {
    where.is_active = is_active === 'true' || is_active === true;
  }
  if (make_id) {
    where.make_id = make_id;
  }
  if (search) {
    where.model_name = { contains: search, mode: 'insensitive' };
  }

  const skip = (page - 1) * limit;
  const orderBy = {};
  orderBy[sort_by === 'model_name' ? 'model_name' : 'created_at'] = sort_order === 'asc' ? 'asc' : 'desc';

  const [data, total] = await Promise.all([
    db.motorModel.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy,
      include: { make: { select: { id: true, make_name: true } } },
    }),
    db.motorModel.count({ where }),
  ]);

  return {
    data,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    },
  };
};

const createMotorModel = async (data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);

  // Validate make exists
  const make = await db.motorMake.findUnique({ where: { id: data.make_id } });
  if (!make) {
    throw Object.assign(new Error('Motor make not found'), { statusCode: 404 });
  }

  // Check if model already exists for this make
  const existing = await db.motorModel.findFirst({
    where: { make_id: data.make_id, model_name: data.model_name },
  });
  if (existing) {
    throw Object.assign(new Error('Model already exists for this make'), { statusCode: 409 });
  }

  return db.motorModel.create({
    data: {
      make_id: data.make_id,
      model_name: data.model_name,
      created_by: userId,
    },
    include: { make: { select: { id: true, make_name: true } } },
  });
};

const updateMotorModel = async (id, data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);

  const model = await db.motorModel.findUnique({ where: { id } });
  if (!model) {
    throw Object.assign(new Error('Motor model not found'), { statusCode: 404 });
  }

  // If make_id is being changed, validate new make exists
  if (data.make_id && data.make_id !== model.make_id) {
    const make = await db.motorMake.findUnique({ where: { id: data.make_id } });
    if (!make) {
      throw Object.assign(new Error('Motor make not found'), { statusCode: 404 });
    }
  }

  // Check if new name conflicts
  if (data.model_name && data.model_name !== model.model_name) {
    const make_id = data.make_id || model.make_id;
    const existing = await db.motorModel.findFirst({
      where: { make_id, model_name: data.model_name, id: { not: id } },
    });
    if (existing) {
      throw Object.assign(new Error('Model name already exists for this make'), { statusCode: 409 });
    }
  }

  return db.motorModel.update({
    where: { id },
    data: {
      ...(data.make_id !== undefined && { make_id: data.make_id }),
      ...(data.model_name !== undefined && { model_name: data.model_name }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
      updated_by: userId,
    },
    include: { make: { select: { id: true, make_name: true } } },
  });
};

const deleteMotorModel = async (id, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const model = await db.motorModel.findUnique({ where: { id } });
  if (!model) {
    throw Object.assign(new Error('Motor model not found'), { statusCode: 404 });
  }

  // Check if variants exist
  const variants = await db.motorVariant.count({ where: { model_id: id } });
  if (variants > 0) {
    throw Object.assign(new Error('Cannot delete model with associated variants'), { statusCode: 400 });
  }

  return db.motorModel.delete({ where: { id } });
};

// ─── MOTOR VARIANTS ───────────────────────────────────────────────────────────

const getMotorVariants = async (companySlug, filters = {}) => {
  const db = await resolveCompanyDb(companySlug);
  const { search, is_active, make_id, model_id, page = 1, limit = 10, sort_by = 'created_at', sort_order = 'desc' } = filters;

  const where = {};
  if (is_active !== undefined) {
    where.is_active = is_active === 'true' || is_active === true;
  }
  if (make_id) {
    where.make_id = make_id;
  }
  if (model_id) {
    where.model_id = model_id;
  }
  if (search) {
    where.variant_name = { contains: search, mode: 'insensitive' };
  }

  const skip = (page - 1) * limit;
  const orderBy = {};
  orderBy[sort_by === 'variant_name' ? 'variant_name' : 'created_at'] = sort_order === 'asc' ? 'asc' : 'desc';

  const [data, total] = await Promise.all([
    db.motorVariant.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy,
      include: {
        make: { select: { id: true, make_name: true } },
        model: { select: { id: true, model_name: true } },
      },
    }),
    db.motorVariant.count({ where }),
  ]);

  return {
    data,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    },
  };
};

const createMotorVariant = async (data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);

  // Validate make exists
  const make = await db.motorMake.findUnique({ where: { id: data.make_id } });
  if (!make) {
    throw Object.assign(new Error('Motor make not found'), { statusCode: 404 });
  }

  // Validate model exists
  const model = await db.motorModel.findUnique({ where: { id: data.model_id } });
  if (!model) {
    throw Object.assign(new Error('Motor model not found'), { statusCode: 404 });
  }

  // Validate model belongs to make
  if (model.make_id !== data.make_id) {
    throw Object.assign(new Error('Model does not belong to the selected make'), { statusCode: 400 });
  }

  // Check if variant already exists
  const existing = await db.motorVariant.findFirst({
    where: { model_id: data.model_id, variant_name: data.variant_name },
  });
  if (existing) {
    throw Object.assign(new Error('Variant already exists for this model'), { statusCode: 409 });
  }

  return db.motorVariant.create({
    data: {
      make_id: data.make_id,
      model_id: data.model_id,
      variant_name: data.variant_name,
      created_by: userId,
    },
    include: {
      make: { select: { id: true, make_name: true } },
      model: { select: { id: true, model_name: true } },
    },
  });
};

const updateMotorVariant = async (id, data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);

  const variant = await db.motorVariant.findUnique({ where: { id } });
  if (!variant) {
    throw Object.assign(new Error('Motor variant not found'), { statusCode: 404 });
  }

  // If make_id or model_id is being changed, validate they exist
  if (data.make_id && data.make_id !== variant.make_id) {
    const make = await db.motorMake.findUnique({ where: { id: data.make_id } });
    if (!make) {
      throw Object.assign(new Error('Motor make not found'), { statusCode: 404 });
    }
  }

  if (data.model_id && data.model_id !== variant.model_id) {
    const model = await db.motorModel.findUnique({ where: { id: data.model_id } });
    if (!model) {
      throw Object.assign(new Error('Motor model not found'), { statusCode: 404 });
    }

    // Validate model belongs to make
    const make_id = data.make_id || variant.make_id;
    if (model.make_id !== make_id) {
      throw Object.assign(new Error('Model does not belong to the selected make'), { statusCode: 400 });
    }
  }

  // Check if new name conflicts
  if (data.variant_name && data.variant_name !== variant.variant_name) {
    const model_id = data.model_id || variant.model_id;
    const existing = await db.motorVariant.findFirst({
      where: { model_id, variant_name: data.variant_name, id: { not: id } },
    });
    if (existing) {
      throw Object.assign(new Error('Variant name already exists for this model'), { statusCode: 409 });
    }
  }

  return db.motorVariant.update({
    where: { id },
    data: {
      ...(data.make_id !== undefined && { make_id: data.make_id }),
      ...(data.model_id !== undefined && { model_id: data.model_id }),
      ...(data.variant_name !== undefined && { variant_name: data.variant_name }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
      updated_by: userId,
    },
    include: {
      make: { select: { id: true, make_name: true } },
      model: { select: { id: true, model_name: true } },
    },
  });
};

const deleteMotorVariant = async (id, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const variant = await db.motorVariant.findUnique({ where: { id } });
  if (!variant) {
    throw Object.assign(new Error('Motor variant not found'), { statusCode: 404 });
  }

  return db.motorVariant.delete({ where: { id } });
};

// ─── RTO CODES ────────────────────────────────────────────────────────────────

const getRtoCodes = async (companySlug, filters = {}) => {
  const db = await resolveCompanyDb(companySlug);
  const { search, is_active, city, page = 1, limit = 10, sort_by = 'created_at', sort_order = 'desc' } = filters;

  const where = {};
  if (is_active !== undefined) {
    where.is_active = is_active === 'true' || is_active === true;
  }
  if (city) {
    where.city = { contains: city, mode: 'insensitive' };
  }
  if (search) {
    where.OR = [
      { rto_code: { contains: search, mode: 'insensitive' } },
      { rto_name: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
    ];
  }

  const skip = (page - 1) * limit;
  const orderBy = {};
  orderBy[sort_by === 'rto_code' || sort_by === 'city' ? sort_by : 'created_at'] = sort_order === 'asc' ? 'asc' : 'desc';

  const [data, total] = await Promise.all([
    db.rtoCode.findMany({ where, skip, take: parseInt(limit), orderBy }),
    db.rtoCode.count({ where }),
  ]);

  return {
    data,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    },
  };
};

const createRtoCode = async (data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);

  // Check if code already exists
  const existing = await db.rtoCode.findUnique({ where: { rto_code: data.rto_code } });
  if (existing) {
    throw Object.assign(new Error('RTO code already exists'), { statusCode: 409 });
  }

  return db.rtoCode.create({
    data: {
      rto_code: data.rto_code,
      rto_name: data.rto_name,
      city: data.city,
      created_by: userId,
    },
  });
};

const updateRtoCode = async (id, data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);

  const rtoCode = await db.rtoCode.findUnique({ where: { id } });
  if (!rtoCode) {
    throw Object.assign(new Error('RTO code not found'), { statusCode: 404 });
  }

  // Check if new code conflicts
  if (data.rto_code && data.rto_code !== rtoCode.rto_code) {
    const existing = await db.rtoCode.findUnique({ where: { rto_code: data.rto_code } });
    if (existing) {
      throw Object.assign(new Error('RTO code already exists'), { statusCode: 409 });
    }
  }

  return db.rtoCode.update({
    where: { id },
    data: {
      ...(data.rto_code !== undefined && { rto_code: data.rto_code }),
      ...(data.rto_name !== undefined && { rto_name: data.rto_name }),
      ...(data.city !== undefined && { city: data.city }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
      updated_by: userId,
    },
  });
};

const deleteRtoCode = async (id, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const rtoCode = await db.rtoCode.findUnique({ where: { id } });
  if (!rtoCode) {
    throw Object.assign(new Error('RTO code not found'), { statusCode: 404 });
  }

  return db.rtoCode.delete({ where: { id } });
};

// ─── ADD-ON COVERAGES ─────────────────────────────────────────────────────────

const getAddOnCoverages = async (companySlug, filters = {}) => {
  const db = await resolveCompanyDb(companySlug);
  const { search, is_active, page = 1, limit = 10, sort_by = 'created_at', sort_order = 'desc' } = filters;

  const where = {};
  if (is_active !== undefined) {
    where.is_active = is_active === 'true' || is_active === true;
  }
  if (search) {
    where.add_on_name = { contains: search, mode: 'insensitive' };
  }

  const skip = (page - 1) * limit;
  const orderBy = {};
  orderBy[sort_by === 'add_on_name' ? 'add_on_name' : 'created_at'] = sort_order === 'asc' ? 'asc' : 'desc';

  const [data, total] = await Promise.all([
    db.addOnCoverage.findMany({ where, skip, take: parseInt(limit), orderBy }),
    db.addOnCoverage.count({ where }),
  ]);

  return {
    data,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    },
  };
};

const createAddOnCoverage = async (data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);

  // Check if already exists
  const existing = await db.addOnCoverage.findUnique({ where: { add_on_name: data.add_on_name } });
  if (existing) {
    throw Object.assign(new Error('Add-on coverage already exists'), { statusCode: 409 });
  }

  return db.addOnCoverage.create({
    data: {
      add_on_name: data.add_on_name,
      created_by: userId,
    },
  });
};

const updateAddOnCoverage = async (id, data, companySlug, userId) => {
  const db = await resolveCompanyDb(companySlug);

  const addOn = await db.addOnCoverage.findUnique({ where: { id } });
  if (!addOn) {
    throw Object.assign(new Error('Add-on coverage not found'), { statusCode: 404 });
  }

  // Check if new name conflicts
  if (data.add_on_name && data.add_on_name !== addOn.add_on_name) {
    const existing = await db.addOnCoverage.findUnique({ where: { add_on_name: data.add_on_name } });
    if (existing) {
      throw Object.assign(new Error('Add-on coverage name already exists'), { statusCode: 409 });
    }
  }

  return db.addOnCoverage.update({
    where: { id },
    data: {
      ...(data.add_on_name !== undefined && { add_on_name: data.add_on_name }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
      updated_by: userId,
    },
  });
};

const deleteAddOnCoverage = async (id, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const addOn = await db.addOnCoverage.findUnique({ where: { id } });
  if (!addOn) {
    throw Object.assign(new Error('Add-on coverage not found'), { statusCode: 404 });
  }

  return db.addOnCoverage.delete({ where: { id } });
};

module.exports = {
  // Motor Makes
  getMotorMakes,
  createMotorMake,
  updateMotorMake,
  deleteMotorMake,
  // Motor Models
  getMotorModels,
  createMotorModel,
  updateMotorModel,
  deleteMotorModel,
  // Motor Variants
  getMotorVariants,
  createMotorVariant,
  updateMotorVariant,
  deleteMotorVariant,
  // RTO Codes
  getRtoCodes,
  createRtoCode,
  updateRtoCode,
  deleteRtoCode,
  // Add-On Coverages
  getAddOnCoverages,
  createAddOnCoverage,
  updateAddOnCoverage,
  deleteAddOnCoverage,
};
