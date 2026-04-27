import { useState, useEffect, useCallback } from 'react';
import { auth } from '@/services/auth';
import type { User, UserRole } from '@/types';

export function useAuth() {
  const [state, setState] = useState(auth.getState());

  useEffect(() => {
    return auth.subscribe(setState);
  }, []);

  const login = useCallback((username: string, password: string): User | null => {
    return auth.login(username, password);
  }, []);

  const logout = useCallback(() => {
    auth.logout();
  }, []);

  const hasPermission = useCallback((permission: string): boolean => {
    return auth.hasPermission(permission as any);
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
    role: state.role,
    login,
    logout,
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
