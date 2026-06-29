import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toaster';
import { authService } from '@/services/authService';
import { useAuthStore } from '@/store/authStore';
import type { AuthUser } from '@/store/authStore';

const schema = z
  .object({
    current_password: z.string().min(1, 'Current password required'),
    new_password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'Must contain uppercase')
      .regex(/[0-9]/, 'Must contain a number')
      .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
    confirm: z.string().min(1, 'Confirm your password'),
  })
  .refine((d) => d.new_password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

export default function FirstPasswordChangePage() {
  const { company_slug } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, setUser } = useAuthStore();
  const [show, setShow] = useState({ current: false, new: false });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (values) => {
    try {
      await authService.changeFirstPassword({
        current_password: values.current_password,
        new_password: values.new_password,
      });
      setUser({ ...user, must_change_password: false } as AuthUser);
      toast.success('Password set!', 'Welcome to your CRM.');
      navigate(`/${company_slug}/dashboard`);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to change password.';
      toast.error('Error', msg);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute bottom-0 left-1/2 h-64 w-96 -translate-x-1/2 rounded-full bg-purple-600/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-md"
      >
        <Card className="border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20">
              <ShieldCheck className="h-6 w-6 text-amber-400" />
            </div>
            <CardTitle className="text-xl font-bold text-white">Set your password</CardTitle>
            <CardDescription className="text-white/50">
              This is your first login. Please set a secure password before continuing.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="current" className="text-white/70">
                  Temporary password
                </Label>
                <div className="relative">
                  <Input
                    id="current"
                    type={show.current ? 'text' : 'password'}
                    placeholder="Your temporary password"
                    className="border-white/10 bg-white/5 pr-10 text-white placeholder:text-white/20 focus-visible:ring-white/20"
                    {...register('current_password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => ({ ...s, current: !s.current }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                    tabIndex={-1}
                  >
                    {show.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.current_password && (
                  <p className="text-xs text-red-400">{errors.current_password.message as string}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="new" className="text-white/70">
                  New password
                </Label>
                <div className="relative">
                  <Input
                    id="new"
                    type={show.new ? 'text' : 'password'}
                    placeholder="Min. 8 chars, uppercase, number, symbol"
                    className="border-white/10 bg-white/5 pr-10 text-white placeholder:text-white/20 focus-visible:ring-white/20"
                    {...register('new_password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => ({ ...s, new: !s.new }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                    tabIndex={-1}
                  >
                    {show.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.new_password && (
                  <p className="text-xs text-red-400">{errors.new_password.message as string}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm" className="text-white/70">
                  Confirm new password
                </Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="Repeat new password"
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/20 focus-visible:ring-white/20"
                  {...register('confirm')}
                />
                {errors.confirm && (
                  <p className="text-xs text-red-400">{errors.confirm.message as string}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-white text-slate-900 hover:bg-white/90"
                disabled={isSubmitting}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Saving…' : 'Set password & continue'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
