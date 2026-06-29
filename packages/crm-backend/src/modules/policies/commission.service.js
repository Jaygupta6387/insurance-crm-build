const { resolveCompanyDb } = require('../dynamic-db/dbResolver');
const { audit } = require('../audit/auditService');

const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const sum = (items, key) => items.reduce((acc, it) => acc + (Number(it[key]) || 0), 0);

/**
 * Records the agency commission (step 5), optionally shares commission with a
 * sub-broker (crediting their wallet), records any pending customer balance from
 * a partial payment, and transitions the policy from DRAFT to ACTIVE.
 *
 * Wallet side-effects only run on the first DRAFT -> ACTIVE transition so that
 * re-saving commission on an already active policy never double-credits.
 */
const finalizePolicyCommission = async (policyId, data, userId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);

  const policy = await db.policy.findUnique({
    where: { id: policyId },
    include: {
      motor_detail: true,
      health_detail: true,
      customer: { select: { id: true, customer_name: true, wallet_balance: true } },
      product: { select: { id: true, name: true } },
      insurance_company: { select: { id: true, name: true } },
    },
  });
  if (!policy) throw Object.assign(new Error('Policy not found'), { statusCode: 404 });

  const isFirstFinalize = policy.status !== 'ACTIVE';
  const our = data.our_commission || {};
  const ourItems = Array.isArray(our.items) ? our.items : [];
  const ourTotal = our.total_commission_amount != null ? Number(our.total_commission_amount) : sum(ourItems, 'commission_amount');

  const share = data.sub_broker_share || {};
  const shareEnabled = !!share.enabled && !!share.sub_broker_id;

  await db.$transaction(async (tx) => {
    // 1. Agency commission (replace items)
    const existingComm = await tx.policyCommission.findFirst({ where: { policy_id: policyId } });
    let commissionId;
    if (existingComm) {
      commissionId = existingComm.id;
      await tx.policyCommission.update({
        where: { id: commissionId },
        data: { total_commission_amount: ourTotal, notes: our.notes || null },
      });
      await tx.policyCommissionItem.deleteMany({ where: { commission_id: commissionId } });
    } else {
      const created = await tx.policyCommission.create({
        data: { policy_id: policyId, total_commission_amount: ourTotal, notes: our.notes || null, created_by: userId },
      });
      commissionId = created.id;
    }
    if (ourItems.length) {
      await tx.policyCommissionItem.createMany({
        data: ourItems.map((it) => ({
          commission_id: commissionId,
          component_type: it.component_type,
          base_amount: toNum(it.base_amount),
          percentage: toNum(it.percentage),
          commission_amount: Number(it.commission_amount) || 0,
        })),
      });
    }

    // 2. Sub-broker share — create on first finalize, update on subsequent saves
    const existingSubComm = await tx.policySubBrokerCommission.findFirst({ where: { policy_id: policyId } });

    if (shareEnabled) {
      const broker = await tx.subBroker.findFirst({
        where: { id: share.sub_broker_id, deleted_at: null },
        select: { id: true, wallet_balance: true },
      });
      if (!broker) throw Object.assign(new Error('Sub-broker not found'), { statusCode: 404 });

      const shareItems = Array.isArray(share.items) ? share.items : [];
      const shareTotal =
        share.total_commission_amount != null ? Number(share.total_commission_amount) : sum(shareItems, 'commission_amount');

      if (existingSubComm) {
        const oldTotal = Number(existingSubComm.total_commission_amount) || 0;
        const delta = Math.round((shareTotal - oldTotal) * 100) / 100;

        await tx.policySubBrokerCommission.update({
          where: { id: existingSubComm.id },
          data: {
            sub_broker_id: broker.id,
            commission_basis: share.commission_basis || null,
            total_commission_amount: shareTotal,
          },
        });
        await tx.policySubBrokerCommissionItem.deleteMany({ where: { commission_id: existingSubComm.id } });
        if (shareItems.length) {
          await tx.policySubBrokerCommissionItem.createMany({
            data: shareItems.map((it) => ({
              commission_id: existingSubComm.id,
              component_type: it.component_type,
              base_amount: toNum(it.base_amount),
              percentage: toNum(it.percentage),
              commission_amount: Number(it.commission_amount) || 0,
            })),
          });
        }

        if (existingSubComm.is_wallet_credited && delta !== 0) {
          const newBalance = Math.round((Number(broker.wallet_balance) + delta) * 100) / 100;
          await tx.subBrokerWalletTransaction.create({
            data: {
              sub_broker_id: broker.id,
              type: delta > 0 ? 'CREDIT' : 'DEBIT',
              reason: 'COMMISSION_ADJUSTMENT',
              amount: Math.abs(delta),
              balance_after: newBalance,
              note: `Commission share adjustment — policy: ${policy.policy_number || policy.id}`,
              performed_by: userId,
              policy_id: policy.id,
              customer_id: policy.customer_id,
              lob_id: policy.lob_id,
              product_id: policy.product_id,
              sub_product_id: policy.sub_product_id,
              insurance_company_id: policy.insurance_company_id,
              customer_name_snapshot: policy.customer?.customer_name || null,
              insurance_company_name_snapshot: policy.insurance_company?.name || null,
              product_name_snapshot: policy.product?.name || null,
            },
          });
          await tx.subBroker.update({ where: { id: broker.id }, data: { wallet_balance: newBalance } });
        }
      } else if (isFirstFinalize) {
        const newBalance = Number(broker.wallet_balance) + shareTotal;

        const walletTx = await tx.subBrokerWalletTransaction.create({
          data: {
            sub_broker_id: broker.id,
            type: 'CREDIT',
            reason: 'COMMISSION_EARNED',
            amount: shareTotal,
            balance_after: newBalance,
            note: `Commission share — policy: ${policy.policy_number || policy.id}`,
            performed_by: userId,
            policy_id: policy.id,
            customer_id: policy.customer_id,
            lob_id: policy.lob_id,
            product_id: policy.product_id,
            sub_product_id: policy.sub_product_id,
            insurance_company_id: policy.insurance_company_id,
            customer_name_snapshot: policy.customer?.customer_name || null,
            insurance_company_name_snapshot: policy.insurance_company?.name || null,
            product_name_snapshot: policy.product?.name || null,
          },
        });

        const subComm = await tx.policySubBrokerCommission.create({
          data: {
            sub_broker_id: broker.id,
            policy_id: policy.id,
            policy_number: policy.policy_number,
            customer_id: policy.customer_id,
            lob_id: policy.lob_id,
            product_id: policy.product_id,
            sub_product_id: policy.sub_product_id,
            insurance_company_id: policy.insurance_company_id,
            commission_basis: share.commission_basis || null,
            total_commission_amount: shareTotal,
            is_wallet_credited: true,
            wallet_transaction_id: walletTx.id,
            status: 'PAID',
            created_by: userId,
          },
        });
        if (shareItems.length) {
          await tx.policySubBrokerCommissionItem.createMany({
            data: shareItems.map((it) => ({
              commission_id: subComm.id,
              component_type: it.component_type,
              base_amount: toNum(it.base_amount),
              percentage: toNum(it.percentage),
              commission_amount: Number(it.commission_amount) || 0,
            })),
          });
        }

        await tx.subBroker.update({ where: { id: broker.id }, data: { wallet_balance: newBalance } });
      }
    } else if (existingSubComm && !shareEnabled) {
      if (existingSubComm.is_wallet_credited) {
        const broker = await tx.subBroker.findUnique({ where: { id: existingSubComm.sub_broker_id } });
        if (broker) {
          const amt = Number(existingSubComm.total_commission_amount) || 0;
          if (amt > 0) {
            const newBalance = Math.round((Number(broker.wallet_balance) - amt) * 100) / 100;
            await tx.subBrokerWalletTransaction.create({
              data: {
                sub_broker_id: broker.id,
                type: 'DEBIT',
                reason: 'COMMISSION_REVERSAL',
                amount: amt,
                balance_after: newBalance,
                note: `Commission share removed — policy: ${policy.policy_number || policy.id}`,
                performed_by: userId,
                policy_id: policy.id,
                customer_id: policy.customer_id,
              },
            });
            await tx.subBroker.update({ where: { id: broker.id }, data: { wallet_balance: newBalance } });
          }
        }
      }
      await tx.policySubBrokerCommissionItem.deleteMany({ where: { commission_id: existingSubComm.id } });
      await tx.policySubBrokerCommission.delete({ where: { id: existingSubComm.id } });
    }

    // 3. Customer pending balance from partial payment (first finalize only)
    const paymentDetail = policy.motor_detail || policy.health_detail;
    if (isFirstFinalize && paymentDetail && paymentDetail.is_full_payment === false) {
      const total = Number(paymentDetail.total_premium) || 0;
      const received = Number(paymentDetail.amount_received) || 0;
      const outstanding = Math.round((total - received) * 100) / 100;
      if (outstanding > 0) {
        const newCustBalance = Number(policy.customer.wallet_balance) + outstanding;
        await tx.customerWalletTransaction.create({
          data: {
            customer_id: policy.customer_id,
            type: 'DEBIT',
            amount: outstanding,
            balance_after: newCustBalance,
            reason: 'POLICY_PENDING',
            policy_id: policy.id,
            policy_number: policy.policy_number,
            product_name: policy.product?.name || null,
            note: 'Outstanding premium on policy issuance',
            performed_by: userId,
          },
        });
        await tx.customer.update({ where: { id: policy.customer_id }, data: { wallet_balance: newCustBalance } });
      }
    }

    // 4. Activate
    await tx.policy.update({ where: { id: policyId }, data: { status: 'ACTIVE', updated_by: userId } });
  });

  await audit(companySlug, {
    userId,
    action: 'FINALIZE_POLICY',
    entityType: 'POLICY',
    entityId: policyId,
    metadata: { our_total: ourTotal, sub_broker_share: shareEnabled },
  });

  const full = await db.policy.findUnique({
    where: { id: policyId },
    include: { our_commissions: { include: { items: true } }, motor_detail: true },
  });
  return full;
};

const getPolicyCommission = async (policyId, companySlug) => {
  const db = await resolveCompanyDb(companySlug);
  return db.policyCommission.findFirst({
    where: { policy_id: policyId },
    include: { items: true },
  });
};

module.exports = { finalizePolicyCommission, getPolicyCommission };
