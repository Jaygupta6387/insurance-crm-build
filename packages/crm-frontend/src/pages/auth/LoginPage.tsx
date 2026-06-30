import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Eye, EyeOff, LogIn, Building2, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toaster';
import { authService } from '@/services/authService';
import { useAuthStore } from '@/store/authStore';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginPage() {
  const { company_slug } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { setAuth } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [resetting, setResetting] = useState(false);
  const canSwitchLicense = typeof window.desktop?.resetForNewLicense === 'function';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (values) => {
    setLoginError('');
    try {
      const { data } = await authService.login({
        ...values,
        company_slug,
      });

      setAuth({
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken ?? null,
        user: data.data.user,
        companySlug: company_slug,
      });

      if (data.data.user.must_change_password) {
        navigate(`/${company_slug}/change-password`, { replace: true });
      } else {
        navigate(`/${company_slug}/dashboard`, { replace: true });
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed. Please try again.';
      setLoginError(message);
      toast.error('Login failed', message);
    }
  };

  const handleSwitchLicense = async () => {
    if (!window.desktop?.resetForNewLicense) return;
    const ok = window.confirm(
      'Remove this company\'s local database and license from this PC?\n\nYou can then enter a different license key and set up again.'
    );
    if (!ok) return;
    setResetting(true);
    setLoginError('');
    try {
      await window.desktop.resetForNewLicense();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not reset local data';
      setLoginError(msg);
      toast.error('Reset failed', msg);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      {/* Animated background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        {/* Company badge */}
        <div className="mb-6 flex justify-center">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur">
            <Building2 className="h-3.5 w-3.5 text-white/60" />
            <span className="text-xs font-medium text-white/60">{company_slug}</span>
          </div>
        </div>

        <Card className="border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold tracking-tight text-white">
              Welcome back
            </CardTitle>
            <CardDescription className="text-white/50">
              Sign in to your CRM account
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white/70">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="email"
                  className="border-white/10 bg-white/5 text-white placeholder:text-white/20 focus-visible:ring-white/20"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-xs text-red-400">{errors.email.message as string}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-white/70">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="border-white/10 bg-white/5 pr-10 text-white placeholder:text-white/20 focus-visible:ring-white/20"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-red-400">{errors.password.message as string}</p>
                )}
              </div>

              <div className="flex justify-end">
                <Link
                  to={`/${company_slug}/forgot-password`}
                  className="text-xs text-white/50 hover:text-white/80 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>

              {loginError && (
                <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400">
                  {loginError}
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-white text-slate-900 hover:bg-white/90"
                disabled={isSubmitting || resetting}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="mr-2 h-4 w-4" />
                )}
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>

              {canSwitchLicense && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-white/15 bg-transparent text-white/70 hover:bg-white/5 hover:text-white"
                  disabled={isSubmitting || resetting}
                  onClick={() => void handleSwitchLicense()}
                >
                  {resetting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-2 h-4 w-4" />
                  )}
                  {resetting ? 'Resetting…' : 'Use a different license / reset local database'}
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
