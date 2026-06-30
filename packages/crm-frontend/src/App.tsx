import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { ThemeProvider } from '@/components/common/ThemeProvider';
import { ToastContextProvider } from '@/components/ui/toaster';
import ProtectedRoute from '@/components/common/ProtectedRoute';
import DashboardLayout from '@/components/layout/DashboardLayout';

import LoginPage from '@/pages/auth/LoginPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import FirstPasswordChangePage from '@/pages/auth/FirstPasswordChangePage';

import DashboardPage from '@/pages/dashboard/DashboardPage';
import EmployeeListPage from '@/pages/employees/EmployeeListPage';
import CreateEmployeePage from '@/pages/employees/CreateEmployeePage';
import EditEmployeePage from '@/pages/employees/EditEmployeePage';
import PermissionPage from '@/pages/permissions/PermissionPage';

import CustomerListPage from '@/pages/customers/CustomerListPage';
import CreateCustomerPage from '@/pages/customers/CreateCustomerPage';
import EditCustomerPage from '@/pages/customers/EditCustomerPage';
import CustomerDetailPage from '@/pages/customers/CustomerDetailPage';
import LeadListPage from '@/pages/leads/LeadListPage';
import CreateLeadPage from '@/pages/leads/CreateLeadPage';
import EditLeadPage from '@/pages/leads/EditLeadPage';
import PolicyListPage from '@/pages/policies/PolicyListPage';
import PolicyDetailPage from '@/pages/policies/PolicyDetailPage';
import EditPolicyPage from '@/pages/policies/EditPolicyPage';
import PolicyChangeRequestsPage from '@/pages/policies/PolicyChangeRequestsPage';
import CreatePolicyPage from '@/pages/policies/CreatePolicyPage';
import PendingBalancesPage from '@/pages/policies/PendingBalancesPage';
import MotorPremiumRatesPage from '@/pages/policies/MotorPremiumRatesPage';
import LobGstPage from '@/pages/policies/LobGstPage';
import SubBrokerListPage from '@/pages/sub-brokers/SubBrokerListPage';
import SubBrokerDetailPage from '@/pages/sub-brokers/SubBrokerDetailPage';
import MasterDataPage from '@/pages/master-data/MasterDataPage';
import MotorMastersPage from '@/pages/motor-masters/MotorMastersPage';

import { authService } from '@/services/authService';
import { useAuthStore } from '@/store/authStore';

function SessionRestorer({ children }: { children: ReactNode }) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const setLoading = useAuthStore((s) => s.setLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { company_slug } = useParams();
  const restoreAttempted = useRef(false);

  useEffect(() => {
    if (!company_slug) {
      setLoading(false);
      return;
    }
    if (isAuthenticated) {
      setLoading(false);
      return;
    }
    if (restoreAttempted.current) return;
    restoreAttempted.current = true;

    authService
      .refresh()
      .then((res) => {
        const { accessToken, refreshToken, user } = res.data.data;
        setAuth({
          accessToken,
          refreshToken: refreshToken ?? null,
          user,
          companySlug: company_slug,
        });
      })
      .catch(() => {
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company_slug]);

  return <>{children}</>;
}

function CompanyRoutes() {
  return (
    <SessionRestorer>
      <Routes>
        {/* Public auth routes */}
        <Route path="login" element={<LoginPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="change-password" element={<FirstPasswordChangePage />} />

        {/* Protected app routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="employees" element={<EmployeeListPage />} />
            <Route path="employees/create" element={<CreateEmployeePage />} />
            <Route path="employees/:id/edit" element={<EditEmployeePage />} />
            <Route path="employees/:id/permissions" element={<PermissionPage />} />
            {/* Customer routes */}
            <Route path="customers" element={<CustomerListPage />} />
            <Route path="customers/create" element={<CreateCustomerPage />} />
            <Route path="customers/:id" element={<CustomerDetailPage />} />
            <Route path="customers/:id/edit" element={<EditCustomerPage />} />
            {/* Lead routes */}
            <Route path="customers/leads" element={<LeadListPage />} />
            <Route path="customers/leads/create" element={<CreateLeadPage />} />
            <Route path="customers/leads/:id/edit" element={<EditLeadPage />} />
            {/* Policy routes */}
            <Route path="policies" element={<PolicyListPage />} />
            <Route path="policies/create" element={<CreatePolicyPage />} />
            <Route path="policies/create/:lob" element={<CreatePolicyPage />} />
            <Route path="policies/change-requests" element={<PolicyChangeRequestsPage />} />
            <Route path="policies/:id/edit" element={<EditPolicyPage />} />
            <Route path="policies/:id" element={<PolicyDetailPage />} />
            <Route path="pending-balances" element={<PendingBalancesPage />} />
            {/* Sub-broker routes */}
            <Route path="sub-brokers" element={<SubBrokerListPage />} />
            <Route path="sub-brokers/:id" element={<SubBrokerDetailPage />} />
            {/* Master Data routes */}
            <Route path="master-data" element={<MasterDataPage />} />
            {/* Motor Masters routes */}
            <Route path="motor-masters" element={<MotorMastersPage />} />
            <Route path="motor-premium-rates" element={<MotorPremiumRatesPage />} />
            <Route path="motor-gst" element={<Navigate to="gst/motor" replace />} />
            <Route path="gst/:lobKey" element={<LobGstPage />} />
          </Route>
        </Route>

        {/* Catch-all inside company slug */}
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </SessionRestorer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastContextProvider>
        <BrowserRouter>
          <Routes>
            {/* All routes are scoped to a company slug */}
            <Route path="/:company_slug/*" element={<CompanyRoutes />} />

            {/* Root with no slug redirects to a placeholder */}
            <Route
              path="/"
              element={
                <div className="min-h-screen flex items-center justify-center text-muted-foreground">
                  No company selected. Access via{' '}
                  <code className="mx-1 font-mono">/:company_slug/login</code>
                </div>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastContextProvider>
    </ThemeProvider>
  );
}
