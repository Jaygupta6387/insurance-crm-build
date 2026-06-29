const { resolveCompanyDb } = require('../dynamic-db/dbResolver');
const { audit } = require('../audit/auditService');
const policyService = require('./policy.service');

const REQUEST_TYPES = ['EDIT', 'DELETE'];
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

const mapRequest = (row) => ({
  id: row.id,
  policy_id: row.policy_id,
  request_type: row.request_type,
  status: row.status,
  payload: row.payload,
  reason: row.reason,
  requested_by: row.requested_by,
  reviewed_by: row.reviewed_by,
  reviewed_at: row.reviewed_at,
  review_note: row.review_note,
  created_at: row.created_at,
  updated_at: row.updated_at,
  policy_number: row.policy_number,
  customer_name: row.customer_name,
  requester_name: row.requester_name,
});

const listChangeRequests = async (companySlug, filters = {}) => {
  const db = await resolveCompanyDb(companySlug);
  const status = filters.status || 'PENDING';
  const rows = await db.$queryRaw`
    SELECT r.*,
           p.policy_number,
           c.customer_name,
           u.full_name AS requester_name
    FROM policy_change_requests r
    JOIN policies p ON p.id = r.policy_id
    JOIN customers c ON c.id = p.customer_id
    LEFT JOIN users u ON u.id = r.requested_by
    WHERE r.status = ${status}
    ORDER BY r.created_at DESC
  `;
  return rows.map(mapRequest);
};

const createChangeRequest = async ({ policy_id, request_type, payload, reason }, userId, companySlug) => {
  if (!REQUEST_TYPES.includes(request_type)) {
    throw Object.assign(new Error('Invalid request type'), { statusCode: 400 });
  }

  const db = await resolveCompanyDb(companySlug);
  const policy = await db.policy.findUnique({ where: { id: policy_id }, select: { id: true, policy_number: true } });
  if (!policy) throw Object.assign(new Error('Policy not found'), { statusCode: 404 });

  const pending = await db.$queryRaw`
    SELECT id FROM policy_change_requests
    WHERE policy_id = ${policy_id} AND status = 'PENDING'
    LIMIT 1
  `;
  if (pending.length) {
    throw Object.assign(new Error('A pending change request already exists for this policy'), { statusCode: 409 });
  }

  const rows = await db.$queryRaw`
    INSERT INTO policy_change_requests (policy_id, request_type, payload, reason, requested_by)
    VALUES (
      ${policy_id},
      ${request_type},
      ${payload ? JSON.stringify(payload) : null}::jsonb,
      ${reason || null},
      ${userId}
    )
    RETURNING *
  `;

  await audit(companySlug, {
    userId,
    action: 'POLICY_CHANGE_REQUEST',
    entityType: 'POLICY',
    entityId: policy_id,
    metadata: { request_type, request_id: rows[0].id },
  });

  return mapRequest({ ...rows[0], policy_number: policy.policy_number });
};

const reviewChangeRequest = async (requestId, { action, review_note }, reviewerId, companySlug) => {
  if (!['APPROVE', 'REJECT'].includes(action)) {
    throw Object.assign(new Error('Invalid review action'), { statusCode: 400 });
  }

  const db = await resolveCompanyDb(companySlug);
  const rows = await db.$queryRaw`
    SELECT * FROM policy_change_requests WHERE id = ${requestId} LIMIT 1
  `;
  if (!rows.length) throw Object.assign(new Error('Change request not found'), { statusCode: 404 });
  const req = rows[0];
  if (req.status !== 'PENDING') {
    throw Object.assign(new Error('This request has already been reviewed'), { statusCode: 409 });
  }

  const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

  if (action === 'APPROVE') {
    if (req.request_type === 'DELETE') {
      await policyService.hardDeletePolicy(req.policy_id, reviewerId, companySlug);
    } else if (req.request_type === 'EDIT') {
      const payload = typeof req.payload === 'string' ? JSON.parse(req.payload) : req.payload;
      if (!payload) throw Object.assign(new Error('Edit request has no payload'), { statusCode: 400 });
      await policyService.updatePolicy(req.policy_id, payload, reviewerId, companySlug);
    }
  }

  await db.$executeRaw`
    UPDATE policy_change_requests
    SET status = ${newStatus},
        reviewed_by = ${reviewerId},
        reviewed_at = NOW(),
        review_note = ${review_note || null},
        updated_at = NOW()
    WHERE id = ${requestId}
  `;

  await audit(companySlug, {
    userId: reviewerId,
    action: action === 'APPROVE' ? 'POLICY_CHANGE_APPROVED' : 'POLICY_CHANGE_REJECTED',
    entityType: 'POLICY',
    entityId: req.policy_id,
    metadata: { request_id: requestId, request_type: req.request_type },
  });

  return { id: requestId, status: newStatus };
};

module.exports = {
  listChangeRequests,
  createChangeRequest,
  reviewChangeRequest,
};
