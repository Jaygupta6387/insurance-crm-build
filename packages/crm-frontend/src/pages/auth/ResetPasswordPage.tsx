import { useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toaster';
import { authService } from '@/services/authService';

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[0-9]/, 'Must contain a number')
      .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
    confirm: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

export default function ResetPasswordPage() {
  const { company_slug } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [showPwd, setShowPwd] = useState(false);
  const token = searchParams.get('token');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async ({ password }) => {
    if (!token) {
      toast.error('Invalid link', 'Reset token is missing from the URL.');
      return;
    }
    try {
      await authService.resetPassword({ token, password, company_slug });
      toast.success('Password reset!', 'You can now log in with your new password.');
      navigate(`/${company_slug}/login`);
    } catch (err) {
      const msg = err.response?.data?.message || 'Reset failed. The link may have expired.';
      toast.error('Reset failed', msg);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        <Card className="border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <KeyRound className="h-6 w-6 text-white/70" />
            </div>
            <CardTitle className="text-xl font-bold text-white">Set new password</CardTitle>
            <CardDescription className="text-white/50">
              Choose a strong password for your account.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-white/70">
                  New password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="Min. 8 chars, uppercase, number, symbol"
                    className="border-white/10 bg-white/5 pr-10 text-white placeholder:text-white/20 focus-visible:ring-white/20"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                    tabIndex={-1}
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-red-400">{errors.password.message as string}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm" className="text-white/70">
                  Confirm password
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
                {isSubmitting ? 'Saving…' : 'Set new password'}
              </Button>

              <p className="text-center text-xs text-white/40">
                <Link to={`/${company_slug}/login`} className="hover:text-white/70 transition-colors">
                  Back to login
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
