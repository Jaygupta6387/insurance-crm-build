import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import Header from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toaster';
import { employeeService } from '@/services/employeeService';

const schema = z.object({
  full_name: z.string().min(2, 'At least 2 characters'),
  phone: z.string().optional(),
  is_active: z.boolean(),
});

export default function EditEmployeePage() {
  const { company_slug, id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({ resolver: zodResolver(schema) });

  useEffect(() => {
    employeeService.get(id).then(({ data }) => {
      const emp = data.data.employee;
      setEmployee(emp);
      reset({ full_name: emp.full_name, phone: emp.phone || '', is_active: emp.is_active });
    }).catch(() => {
      toast.error('Failed to load employee');
      navigate(-1);
    }).finally(() => setLoading(false));
  }, [id]);

  const onSubmit = async (values) => {
    try {
      await employeeService.update(id, values);
      toast.success('Employee updated');
      navigate(`/${company_slug}/employees`);
    } catch (err) {
      toast.error('Update failed', err.response?.data?.message);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Edit Employee" />
        <div className="p-6 space-y-4 max-w-lg">
          <Skeleton className="h-10 w-32" />
          <Card><CardContent className="p-6 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </CardContent></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Edit Employee" subtitle={employee?.email} />

      <div className="flex-1 p-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle>Edit {employee?.full_name}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full name</Label>
                  <Input id="full_name" {...register('full_name')} />
                  {errors.full_name && (
                    <p className="text-xs text-destructive">{errors.full_name.message as string}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Email (cannot be changed)</Label>
                  <Input value={employee?.email || ''} disabled className="opacity-60" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" type="tel" placeholder="+1 555 000 0000" {...register('phone')} />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Active status</p>
                    <p className="text-xs text-muted-foreground">Inactive employees cannot log in</p>
                  </div>
                  <Switch
                    checked={watch('is_active')}
                    onCheckedChange={(v) => setValue('is_active', v, { shouldDirty: true })}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="submit" disabled={isSubmitting || !isDirty}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4" />
                    Save changes
                  </Button>
                  <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
