import PolicyCommissionStep from '../commission/PolicyCommissionStep';
import type { StepProps, CommissionRow } from './types';

const num = (v: string | number | null | undefined) => (v === '' || v == null ? 0 : Number(v) || 0);

export default function Step4Commission({ data, update, errors, masters }: StepProps) {
  const isSubBrokerReferral = data.referred_by_type === 'SUB_BROKER';
  const subBrokerName = data.referred_sub_broker_name
    || masters.subBrokers.find((b) => b.value === data.referred_by_sub_broker_id)?.label;

  const premiumBase = num(data.total_premium);
  const ourCommission = num(data.commission_premium.amount);

  const setCommission = (row: CommissionRow) => update({ commission_premium: row });
  const setShare = (row: CommissionRow) => update({ share_premium: row });

  const baseForShare = data.share_basis === 'PREMIUM' ? premiumBase : ourCommission;

  const toggleShare = () => {
    if (!data.share_with_sub_broker) {
      update({ share_with_sub_broker: true });
    } else {
      update({ share_with_sub_broker: false, share_premium: { percentage: '', amount: '' } });
    }
  };

  const showSubBrokerSection = isSubBrokerReferral || data.share_with_sub_broker;

  return (
    <PolicyCommissionStep
      rows={[{
        key: 'premium',
        label: 'Premium',
        baseAmount: premiumBase,
        row: data.commission_premium,
        onRowChange: setCommission,
      }]}
      totalCommission={ourCommission}
      notes={data.commission_notes}
      onNotesChange={(v) => update({ commission_notes: v })}
      referredByType={data.referred_by_type}
      referredSubBrokerName={subBrokerName}
      shareEnabled={data.share_with_sub_broker}
      onShareToggle={toggleShare}
      shareBasis={data.share_basis}
      onShareBasisChange={(v) => update({
        share_basis: v,
        share_premium: { percentage: '', amount: '' },
      })}
      shareRows={[{
        key: 'premium',
        label: 'Premium',
        baseAmount: baseForShare,
        row: data.share_premium,
        onRowChange: setShare,
      }]}
      shareTotal={num(data.share_premium.amount)}
      shareError={errors.share}
      showSubBrokerSection={showSubBrokerSection}
    />
  );
}
