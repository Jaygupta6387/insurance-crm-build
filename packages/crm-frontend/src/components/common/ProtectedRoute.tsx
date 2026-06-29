import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

/**
 * Wraps routes that require authentication.
 * If the user has must_change_password = true, redirects to the change-password page.
 */
export default function ProtectedRoute() {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const { company_slug } = useParams();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={`/${company_slug}/login`} replace />;
  }

  if (user?.must_change_password) {
    return <Navigate to={`/${company_slug}/change-password`} replace />;
  }

  return <Outlet />;
}
