import { useCallback, useSyncExternalStore } from 'react';
import { auth } from '@/services/auth';
import type { UserRole } from '@/types';

const subscribeToAuth = (onStoreChange: () => void) => auth.subscribe(() => onStoreChange());
const getAuthSnapshot = () => auth.getState();

export function useAuth() {
  const state = useSyncExternalStore(
    subscribeToAuth,
    getAuthSnapshot,
    getAuthSnapshot
  );

  const login = useCallback((username: string, password: string) => {
    return auth.login(username, password);
  }, []);

  const logout = useCallback(() => {
    return auth.logout();
  }, []);

  const changePassword = useCallback((currentPassword: string, newPassword: string) => {
    return auth.changePassword(currentPassword, newPassword);
  }, []);

  const hasPermission = useCallback((permission: string): boolean => {
    return auth.hasPermission(permission);
  }, []);

  const canCreate = useCallback((table: string): boolean => {
    return auth.canCreate(table);
  }, []);

  const canRead = useCallback((table: string): boolean => {
    return auth.canRead(table);
  }, []);

  const canUpdate = useCallback((table: string): boolean => {
    return auth.canUpdate(table);
  }, []);

  const canDelete = useCallback((table: string): boolean => {
    return auth.canDelete(table);
  }, []);

  return {
    user: state.user,
    isAuthenticated: state.isAuthenticated,
    isLoading: state.isLoading,
    role: state.role,
    login,
    logout,
    changePassword,
    hasPermission,
    canCreate,
    canRead,
    canUpdate,
    canDelete
  };
}

export function useRole(role: UserRole | UserRole[]): boolean {
  const { user } = useAuth();
  
  if (!user) return false;
  
  if (Array.isArray(role)) {
    return role.includes(user.Role);
  }
  
  return user.Role === role;
}
