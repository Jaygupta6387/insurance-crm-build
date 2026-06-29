import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import Header from '@/components/layout/Header';
import { employeeService } from '@/services/employeeService';
import { useAuthStore } from '@/store/authStore';

const StatCard = ({ icon: Icon, label, value, color, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
  >
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className={`rounded-lg p-2 ${color}`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  </motion.div>
);

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await employeeService.list();
        const employees = data.data.employees;
        setStats({
          total: employees.length,
          active: employees.filter((e) => e.is_active && !e.is_blocked).length,
          blocked: employees.filter((e) => e.is_blocked).length,
        });
      } catch {
        setStats({ total: 0, active: 0, blocked: 0 });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const cards = [
    { icon: Users, label: 'Total Employees', value: stats?.total ?? '–', color: 'bg-blue-500', delay: 0 },
    { icon: UserCheck, label: 'Active', value: stats?.active ?? '–', color: 'bg-emerald-500', delay: 0.05 },
    { icon: UserX, label: 'Blocked', value: stats?.blocked ?? '–', color: 'bg-red-500', delay: 0.1 },
    { icon: ShieldCheck, label: 'Your Role', value: user?.role ?? '–', color: 'bg-violet-500', delay: 0.15 },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" subtitle={`Welcome back, ${user?.full_name}`} />

      <div className="flex-1 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-32" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))
            : cards.map((c) => <StatCard key={c.label} {...c} />)}
        </div>

        {/* Welcome banner */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mt-6"
        >
          <Card className="border-none bg-gradient-to-r from-slate-900 to-slate-700 text-white dark:from-slate-800 dark:to-slate-700">
            <CardContent className="p-8">
              <h2 className="text-xl font-semibold">CRM Platform</h2>
              <p className="mt-1 text-sm text-white/60">
                {user?.role === 'ADMIN'
                  ? 'You have full administrative access. Manage your team from the Employees section.'
                  : 'Use the sidebar to navigate your available modules.'}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
