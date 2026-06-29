import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Loader2, CreditCard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { bankAccountService } from '@/services/bankAccountService';
import { useToast } from '@/components/ui/toaster';

const schema = z.object({
  account_holder_name: z.string().min(2, 'Required'),
  account_number: z.string().min(6, 'Invalid account number').max(20),
  ifsc_code: z
    .string()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC (e.g. SBIN0001234)'),
  bank_name: z.string().optional(),
  branch_name: z.string().optional(),
  micr_code: z.string().optional(),
  account_type: z.enum(['SAVINGS','CURRENT','SALARY','FIXED_DEPOSIT','OTHER']).default('SAVINGS'),
  is_primary: z.boolean().default(false),
});

async function lookupIfsc(ifsc, setValue) {
  if (ifsc.length !== 11) return;
  try {
    const res = await fetch(`https://ifsc.razorpay.com/${ifsc.toUpperCase()}`);
    if (res.ok) {
      const d = await res.json();
      if (d.BANK) setValue('bank_name', d.BANK);
      if (d.BRANCH) setValue('branch_name', d.BRANCH);
      if (d.MICR) setValue('micr_code', d.MICR);
    }
  } catch (_) {}
}

export default function BankAccountModal({ customerId, account, onClose, onSaved }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const isEditing = !!account;

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: account
      ? { ...account, is_primary: account.is_primary }
      : { account_type: 'SAVINGS', is_primary: false },
  });

  const ifsc = watch('ifsc_code');
  useEffect(() => {
    if (ifsc?.length === 11) lookupIfsc(ifsc, setValue);
  }, [ifsc]);

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      if (isEditing) {
        await bankAccountService.update(account.id, data);
        toast.success('Bank account updated');
      } else {
        await bankAccountService.add({ ...data, customer_id: customerId });
        toast.success('Bank account added');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-border px-6 py-4">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-foreground">
                {isEditing ? 'Edit Bank Account' : 'Add Bank Account'}
              </h2>
              <p className="text-xs text-muted-foreground">IFSC auto-fills bank details</p>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted transition-colors">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Account Holder Name <span className="text-red-400">*</span></Label>
                <Input {...register('account_holder_name')} placeholder="Jay Gupta" />
                {errors.account_holder_name && (
                  <p className="text-xs text-red-400">{errors.account_holder_name.message as string}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Account Number <span className="text-red-400">*</span></Label>
                <Input {...register('account_number')} placeholder="123456789012" />
                {errors.account_number && (
                  <p className="text-xs text-red-400">{errors.account_number.message as string}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>IFSC Code <span className="text-red-400">*</span></Label>
                <Input
                  {...register('ifsc_code')}
                  placeholder="SBIN0001234"
                  className="uppercase"
                  maxLength={11}
                  onChange={(e) => {
                    e.target.value = e.target.value.toUpperCase();
                    register('ifsc_code').onChange(e);
                  }}
                />
                {errors.ifsc_code && (
                  <p className="text-xs text-red-400">{errors.ifsc_code.message as string}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Bank Name</Label>
                <Input {...register('bank_name')} placeholder="State Bank of India" readOnly />
              </div>

              <div className="space-y-1.5">
                <Label>Branch</Label>
                <Input {...register('branch_name')} placeholder="Mumbai Main" readOnly />
              </div>

              <div className="space-y-1.5">
                <Label>MICR Code</Label>
                <Input {...register('micr_code')} placeholder="400002003" readOnly />
              </div>

              <div className="space-y-1.5">
                <Label>Account Type</Label>
                <Select
                  defaultValue="SAVINGS"
                  onValueChange={(v) => setValue('account_type', v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['SAVINGS','CURRENT','SALARY','FIXED_DEPOSIT','OTHER'].map(t => (
                      <SelectItem key={t} value={t}>{t.replace('_',' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                <input
                  type="checkbox"
                  id="is_primary"
                  {...register('is_primary')}
                  className="h-4 w-4 rounded border-border"
                />
                <label htmlFor="is_primary" className="text-sm font-medium cursor-pointer">
                  Set as primary account
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={loading} className="flex-1 gap-2">
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save Account'}
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
