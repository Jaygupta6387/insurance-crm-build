import * as React from 'react';
import { NavLink, useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  LogOut,
  ChevronRight,
  Building2,
  UserPlus,
  UserRoundSearch,
  Briefcase,
  Database,
  Car,
  TrendingUp,
  FileText,
  PlusCircle,
  Wallet,
  Calculator,
  Percent,
  ClipboardList,
  HeartPulse,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/authService';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  icon: React.ElementType;
  href: string;
  adminOnly?: boolean;
  permission?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, href: 'dashboard' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { label: 'All Customers', icon: UserRoundSearch, href: 'customers',        permission: 'can_view_customers'  },
      { label: 'Add Customer',  icon: UserPlus,        href: 'customers/create', permission: 'can_create_customer' },
      { label: 'Leads',         icon: TrendingUp,      href: 'customers/leads',  permission: 'can_view_customers'  },
    ],
  },
  {
    label: 'Policy',
    items: [
      { label: 'All Policies',     icon: FileText,       href: 'policies',                  permission: 'can_view_customers' },
      { label: 'Create Policy',    icon: PlusCircle,     href: 'policies/create',           permission: 'can_create_policy'  },
      { label: 'Change Requests',  icon: ClipboardList,  href: 'policies/change-requests',  adminOnly: true },
      { label: 'Pending Balances', icon: Wallet,         href: 'pending-balances',          permission: 'can_view_customers' },
    ],
  },
  {
    label: 'Team',
    items: [
      { label: 'Employees',   icon: Users,      href: 'employees',   adminOnly: true },
      { label: 'Sub-Brokers', icon: Briefcase,  href: 'sub-brokers', adminOnly: true },
      { label: 'Permissions', icon: ShieldCheck, href: 'permissions', adminOnly: true },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { label: 'Master Data', icon: Database, href: 'master-data', adminOnly: true },
      { label: 'Motor Masters', icon: Car, href: 'motor-masters', permission: 'can_view_motor_masters' },
      { label: 'Premium Rates', icon: Calculator, href: 'motor-premium-rates', adminOnly: true },
    ],
  },
  {
    label: 'GST',
    items: [
      { label: 'Motor GST', icon: Percent, href: 'gst/motor', adminOnly: true },
      { label: 'Health GST', icon: HeartPulse, href: 'gst/health', adminOnly: true },
      { label: 'Life GST', icon: Percent, href: 'gst/life', adminOnly: true },
      { label: 'SME GST', icon: Percent, href: 'gst/sme', adminOnly: true },
    ],
  },
];

export default function Sidebar() {
  const { company_slug } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    try {
      await authService.logout();
    } finally {
      logout();
      navigate(`/${company_slug}/login`);
    }
  };

  const initials = user?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
          <Building2 className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-white/50">Company</p>
          <p className="text-sm font-semibold text-white">{company_slug}</p>
        </div>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_GROUPS.map((group) => {
          // Filter items by role/permission
          const visible = group.items.filter((item) => {
            if (item.adminOnly && user?.role !== 'ADMIN') return false;
            if (item.permission && user?.role !== 'ADMIN') {
              return !!user?.permissions?.[item.permission];
            }
            return true;
          });
          if (visible.length === 0) return null;

          return (
            <div key={group.label}>
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {visible.map((item) => (
                  <NavLink
                    key={item.href}
                    to={`/${company_slug}/${item.href}`}
                    end={!item.href.includes('/')}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                        isActive
                          ? 'bg-sidebar-accent text-white'
                          : 'text-white/60 hover:bg-sidebar-accent/50 hover:text-white'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        {isActive && <ChevronRight className="h-3 w-3 opacity-60" />}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* User footer */}
      <div className="px-4 py-4">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-white/10 text-white text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-white">{user?.full_name}</p>
            <p className="truncate text-xs text-white/50">{user?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.aside>
  );
}
