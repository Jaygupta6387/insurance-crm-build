const { resolveCompanyDb } = require('../dynamic-db/dbResolver');
const { audit } = require('../audit/auditService');

// ─── Lead Code Generator ──────────────────────────────────────────────────────
const generateLeadCode = async (db) => {
  const year = new Date().getFullYear();
  const prefix = `LD-${year}-`;

  const last = await db.lead.findFirst({
    where: { lead_code: { startsWith: prefix } },
    orderBy: { lead_code: 'desc' },
    select: { lead_code: true },
  });

  const seq = last ? parseInt(last.lead_code.replace(prefix, ''), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(6, '0')}`;
};

// ─── Build where clause ────────────────────────────────────────────────────────
const buildWhere = (filters) => {
  const where = { deleted_at: null };

  if (filters.search) {
    where.OR = [
      { lead_name:    { contains: filters.search, mode: 'insensitive' } },
      { phone_number: { contains: filters.search } },
      { email:        { contains: filters.search, mode: 'insensitive' } },
      { lead_code:    { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  if (filters.status)      where.status      = filters.status;
  if (filters.assigned_to) where.assigned_to = filters.assigned_to;
  if (filters.lob_id)      where.lob_id      = filters.lob_id;

  return where;
};

// ─── LOB / Product / SubProduct name lookup helpers ───────────────────────────
const enrichLobProduct = async (db, lead) => {
  if (!lead) return lead;

  const [lob, product, subProduct, assignee] = await Promise.all([
    lead.lob_id        ? db.lob.findUnique({ where: { id: lead.lob_id }, select: { id: true, name: true } })          : null,
    lead.product_id    ? db.product.findUnique({ where: { id: lead.product_id }, select: { id: true, name: true } })  : null,
    lead.sub_product_id ? db.subProduct.findUnique({ where: { id: lead.sub_product_id }, select: { id: true, name: true } }) : null,
    lead.assigned_to   ? db.user.findUnique({ where: { id: lead.assigned_to }, select: { id: true, full_name: true } }) : null,
  ]);

  return { ...lead, lob, product, sub_product: subProduct, assignee };
};

// ─── Service Methods ───────────────────────────────────────────────────────────

const createLead = async (data, creatorId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const lead_code = await generateLeadCode(db);

  const { follow_ups = [], documents = [], ...leadData } = data;

  const lead = await db.lead.create({
    data: {
      lead_code,
      lead_name:                leadData.lead_name,
      phone_number:             leadData.phone_number,
      email:                    leadData.email              || null,
      expected_premium:         leadData.expected_premium   ?? null,
      referred_by_type:         leadData.referred_by_type   || 'SELF',
      referred_by_sub_broker_id: leadData.referred_by_sub_broker_id || null,
      referred_by_customer_id:  leadData.referred_by_customer_id   || null,
      lob_id:                   leadData.lob_id        || null,
      product_id:               leadData.product_id    || null,
      sub_product_id:           leadData.sub_product_id || null,
      assigned_to:              leadData.assigned_to   || null,
      status:                   leadData.status        || 'NEW',
      notes:                    leadData.notes         || null,
      created_by:               creatorId,
      updated_by:               creatorId,
      follow_ups: follow_ups.length > 0
        ? { create: follow_ups.map(f => ({ ...f, id: undefined, created_by: creatorId })) }
        : undefined,
      documents: documents.length > 0
        ? { create: documents.map(d => ({ ...d, id: undefined, created_by: creatorId })) }
        : undefined,
    },
    include: { follow_ups: true, documents: true },
  });

  await audit(companySlug, {
    userId: creatorId,
    action: 'CREATE_LEAD',
    entityType: 'LEAD',
    entityId: lead.id,
    metadata: { lead_code, lead_name: lead.lead_name },
  });

  return enrichLobProduct(db, lead);
};

const getLeads = async (filters, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  const page  = filters.page  || 1;
  const limit = filters.limit || 20;
  const skip  = (page - 1) * limit;

  const where = buildWhere(filters);

  const [leads, total] = await Promise.all([
    db.lead.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [filters.sort_by || 'created_at']: filters.sort_order || 'desc' },
      include: {
        follow_ups: { orderBy: { created_at: 'desc' } },
        documents:  true,
        _count: { select: { follow_ups: true, documents: true } },
      },
    }),
    db.lead.count({ where }),
  ]);

  // Enrich all leads with lob/product names in parallel
  const enriched = await Promise.all(leads.map(l => enrichLobProduct(db, l)));

  return {
    leads: enriched,
    pagination: {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    },
  };
};

const getLead = async (id, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const lead = await db.lead.findFirst({
    where: { id, deleted_at: null },
    include: {
      follow_ups: { orderBy: { follow_up_date: 'asc' } },
      documents:  true,
    },
  });

  if (!lead) {
    throw Object.assign(new Error('Lead not found'), { statusCode: 404 });
  }

  return enrichLobProduct(db, lead);
};

const updateLead = async (id, data, updaterId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const existing = await db.lead.findFirst({ where: { id, deleted_at: null } });
  if (!existing) {
    throw Object.assign(new Error('Lead not found'), { statusCode: 404 });
  }

  const { follow_ups, documents, ...leadData } = data;

  // Update core lead fields
  await db.lead.update({
    where: { id },
    data: { ...leadData, updated_by: updaterId },
  });

  // Sync follow-ups: delete existing and recreate
  if (follow_ups !== undefined) {
    await db.leadFollowUp.deleteMany({ where: { lead_id: id } });
    if (follow_ups.length > 0) {
      await db.leadFollowUp.createMany({
        data: follow_ups.map(f => ({
          lead_id: id,
          notes:          f.notes          || null,
          follow_up_date: f.follow_up_date || null,
          is_done:        f.is_done        ?? false,
          created_by:     updaterId,
        })),
      });
    }
  }

  // Sync documents: delete existing and recreate
  if (documents !== undefined) {
    await db.leadDocument.deleteMany({ where: { lead_id: id } });
    if (documents.length > 0) {
      await db.leadDocument.createMany({
        data: documents.map(d => ({
          lead_id:       id,
          document_type: d.document_type,
          file_name:     d.file_name,
          file_url:      d.file_url,
          created_by:    updaterId,
        })),
      });
    }
  }

  await audit(companySlug, {
    userId: updaterId,
    action: 'UPDATE_LEAD',
    entityType: 'LEAD',
    entityId: id,
    metadata: { fields_updated: Object.keys(leadData) },
  });

  return getLead(id, companySlug);
};

const deleteLead = async (id, deleterId, isAdmin, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const existing = await db.lead.findFirst({ where: { id, deleted_at: null } });
  if (!existing) {
    throw Object.assign(new Error('Lead not found'), { statusCode: 404 });
  }

  if (!isAdmin) {
    throw Object.assign(new Error('Only administrators can delete leads'), { statusCode: 403 });
  }

  await db.lead.update({
    where: { id },
    data: { deleted_at: new Date(), is_active: false, updated_by: deleterId },
  });

  await audit(companySlug, {
    userId: deleterId,
    action: 'DELETE_LEAD',
    entityType: 'LEAD',
    entityId: id,
    metadata: { lead_code: existing.lead_code, lead_name: existing.lead_name },
  });
};

// Mark lead as CONVERTED and return mapped customer fields for pre-fill
const convertLead = async (id, userId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const lead = await db.lead.findFirst({ where: { id, deleted_at: null } });
  if (!lead) {
    throw Object.assign(new Error('Lead not found'), { statusCode: 404 });
  }

  await db.lead.update({
    where: { id },
    data: { status: 'CONVERTED', updated_by: userId },
  });

  await audit(companySlug, {
    userId,
    action: 'CONVERT_LEAD',
    entityType: 'LEAD',
    entityId: id,
    metadata: { lead_code: lead.lead_code, lead_name: lead.lead_name },
  });

  // Return field mapping for CustomerForm pre-fill
  return {
    customer_name:              lead.lead_name,
    customer_phone:             lead.phone_number,
    customer_email:             lead.email             || '',
    referred_by_type:           lead.referred_by_type,
    referred_by_sub_broker_id:  lead.referred_by_sub_broker_id || '',
    referred_by_customer_id:    lead.referred_by_customer_id   || '',
    lead_id:                    lead.id,
    lead_code:                  lead.lead_code,
  };
};

module.exports = { createLead, getLeads, getLead, updateLead, deleteLead, convertLead };
