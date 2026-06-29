import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Save, ShieldCheck } from 'lucide-react';
import Header from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/toaster';
import { permissionService } from '@/services/permissionService';
import { employeeService } from '@/services/employeeService';

const PERMISSION_GROUPS = [
  {
    group: 'Customers',
    keys: [
      { key: 'can_view_customers', label: 'View customers' },
      { key: 'can_create_customer', label: 'Create customers' },
      { key: 'can_edit_customer', label: 'Edit customers' },
      { key: 'can_delete_customer', label: 'Delete customers' },
    ],
  },
  {
    group: 'Policies',
    keys: [
      { key: 'can_create_policy', label: 'Create policies' },
      { key: 'can_edit_policy', label: 'Edit policies' },
      { key: 'can_delete_policy', label: 'Delete policies' },
      { key: 'can_manage_policy_commission', label: 'Manage policy commission (Step 5)' },
    ],
  },
  {
    group: 'Claims',
    keys: [{ key: 'can_manage_claims', label: 'Manage claims' }],
  },
  {
    group: 'Employees',
    keys: [
      { key: 'can_create_employee', label: 'Create employees' },
      { key: 'can_edit_employee', label: 'Edit employees' },
      { key: 'can_delete_employee', label: 'Delete employees' },
    ],
  },
  {
    group: 'Reports',
    keys: [{ key: 'can_view_reports', label: 'View reports' }],
  },
];

export default function PermissionPage() {
  const { company_slug, id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [employee, setEmployee] = useState(null);
  const [perms, setPerms] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    Promise.all([
      employeeService.get(id),
      permissionService.getPermissions(id),
    ])
      .then(([empRes, permRes]) => {
        setEmployee(empRes.data.data.employee);
        setPerms(permRes.data.data.permissions);
      })
      .catch(() => {
        toast.error('Failed to load permissions');
        navigate(-1);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleToggle = (key, value) => {
    setPerms((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Only send permission keys
      const permissionPayload = Object.fromEntries(
        PERMISSION_GROUPS.flatMap((g) => g.keys).map(({ key }) => [key, perms[key] ?? false])
      );
      await permissionService.updatePermissions(id, permissionPayload);
      toast.success('Permissions saved');
      setDirty(false);
    } catch (err) {
      toast.error('Save failed', err.response?.data?.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Permissions" />
        <div className="p-6 space-y-4 max-w-2xl">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6 space-y-3">
              <Skeleton className="h-5 w-32" />
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex justify-between">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-6 w-11 rounded-full" />
                </div>
              ))}
            </CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Manage Permissions"
        subtitle={employee ? `${employee.full_name} — ${employee.email}` : ''}
      />

      <div className="flex-1 p-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to employees
        </button>

        <div className="max-w-2xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-violet-500" />
              <span className="font-semibold">Access Control</span>
              {dirty && <Badge variant="warning">Unsaved changes</Badge>}
            </div>
            <Button onClick={handleSave} disabled={saving || !dirty}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              Save permissions
            </Button>
          </div>

          {PERMISSION_GROUPS.map(({ group, keys }) => (
            <motion.div
              key={group}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{group}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {keys.map(({ key, label }, idx) => (
                    <div key={key}>
                      {idx > 0 && <Separator className="my-2" />}
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{label}</span>
                        <Switch
                          checked={perms[key] ?? false}
                          onCheckedChange={(v) => handleToggle(key, v)}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
