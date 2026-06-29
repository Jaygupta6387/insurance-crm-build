import { useAuthStore } from '@/store/authStore';

export function usePolicyPermissions() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  return {
    isAdmin,
    canEditDirect: isAdmin || !!user?.permissions?.can_edit_policy,
    canDeleteDirect: isAdmin || !!user?.permissions?.can_delete_policy,
  };
}
