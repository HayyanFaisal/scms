import { db } from './database';
import type { User, UserRole } from '@/types';

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  role: UserRole | null;
}

class AuthService {
  private listeners: ((state: AuthState) => void)[] = [];

  getState(): AuthState {
    const user = db.getCurrentUser();
    return {
      user,
      isAuthenticated: !!user,
      role: user?.Role || null
    };
  }

  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach(listener => listener(state));
  }

  login(username: string, password: string): User | null {
    const user = db.login(username, password);
    if (user) {
      this.notify();
    }
    return user;
  }

  logout(): void {
    db.logout();
    this.notify();
  }

  hasPermission(permission: Permission): boolean {
    const { user } = this.getState();
    if (!user) return false;

    const rolePermissions: Record<UserRole, Permission[]> = {
      'Admin': [
        'parents:create', 'parents:read', 'parents:update', 'parents:delete',
        'children:create', 'children:read', 'children:update', 'children:delete',
        'documents:create', 'documents:read', 'documents:update', 'documents:delete',
        'banking:create', 'banking:read', 'banking:update', 'banking:delete',
        'grants:create', 'grants:read', 'grants:update', 'grants:delete',
        'gadgets:create', 'gadgets:read', 'gadgets:update', 'gadgets:delete',
        'users:create', 'users:read', 'users:update', 'users:delete',
        'reports:read', 'audit:read'
      ],
      'Finance Officer': [
        'parents:read',
        'children:read',
        'documents:read',
        'banking:read', 'banking:update',
        'grants:read', 'grants:update',
        'gadgets:read', 'gadgets:update',
        'users:read',
        'reports:read'
      ],
      'Operator': [
        'parents:create', 'parents:read', 'parents:update',
        'children:create', 'children:read', 'children:update',
        'documents:create', 'documents:read', 'documents:update',
        'banking:read',
        'grants:read',
        'gadgets:read',
        'reports:read'
      ]
    };

    return rolePermissions[user.Role]?.includes(permission) || false;
  }

  canCreate(table: string): boolean {
    return this.hasPermission(`${table}:create` as Permission);
  }

  canRead(table: string): boolean {
    return this.hasPermission(`${table}:read` as Permission);
  }

  canUpdate(table: string): boolean {
    return this.hasPermission(`${table}:update` as Permission);
  }

  canDelete(table: string): boolean {
    return this.hasPermission(`${table}:delete` as Permission);
  }
}

type Permission = 
  | 'parents:create' | 'parents:read' | 'parents:update' | 'parents:delete'
  | 'children:create' | 'children:read' | 'children:update' | 'children:delete'
  | 'documents:create' | 'documents:read' | 'documents:update' | 'documents:delete'
  | 'banking:create' | 'banking:read' | 'banking:update' | 'banking:delete'
  | 'grants:create' | 'grants:read' | 'grants:update' | 'grants:delete'
  | 'gadgets:create' | 'gadgets:read' | 'gadgets:update' | 'gadgets:delete'
  | 'users:create' | 'users:read' | 'users:update' | 'users:delete'
  | 'reports:read' | 'audit:read';

export const auth = new AuthService();
export default auth;
