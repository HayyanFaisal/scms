import type { User, UserRole } from '@/types';
import { apiFetch, readApiError, setCsrfToken } from './http';

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  role: UserRole | null;
}

type SessionResponse = {
  user: User;
  csrfToken: string;
};

class AuthService {
  private listeners = new Set<(state: AuthState) => void>();
  private state: AuthState = {
    user: null,
    isAuthenticated: false,
    isLoading: true,
    role: null
  };

  constructor() {
    void this.refreshSession();
  }

  getState(): AuthState {
    return this.state;
  }

  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private update(user: User | null, isLoading = false): void {
    this.state = {
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      role: user?.Role || null
    };
    this.listeners.forEach(listener => listener(this.state));
  }

  async refreshSession(): Promise<User | null> {
    try {
      const response = await apiFetch('/auth/session');
      if (!response.ok) {
        setCsrfToken(null);
        this.update(null);
        return null;
      }
      const payload = await response.json() as SessionResponse;
      setCsrfToken(payload.csrfToken);
      this.update(payload.user);
      return payload.user;
    } catch {
      setCsrfToken(null);
      this.update(null);
      return null;
    }
  }

  async login(username: string, password: string): Promise<User> {
    const response = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (!response.ok) throw new Error(await readApiError(response, 'Unable to sign in.'));

    const payload = await response.json() as SessionResponse;
    setCsrfToken(payload.csrfToken);
    this.update(payload.user);
    return payload.user;
  }

  async logout(): Promise<void> {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      setCsrfToken(null);
      this.update(null);
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const response = await apiFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    if (!response.ok) throw new Error(await readApiError(response, 'Unable to change password.'));
    await this.refreshSession();
  }

  hasPermission(permission: string): boolean {
    return Boolean(this.state.user?.Permissions?.includes(permission));
  }

  canCreate(table: string): boolean {
    const aliases: Record<string, string> = { documents: 'documents.upload', banking: 'banking.update', grants: 'grants.manage', gadgets: 'gadgets.manage' };
    return this.hasPermission(aliases[table] || `${table}.create`);
  }

  canRead(table: string): boolean {
    return this.hasPermission(`${table}.read`);
  }

  canUpdate(table: string): boolean {
    const aliases: Record<string, string> = { grants: 'grants.manage', gadgets: 'gadgets.manage' };
    return this.hasPermission(aliases[table] || `${table}.update`);
  }

  canDelete(table: string): boolean {
    const aliases: Record<string, string> = {
      parents: 'parents.archive', children: 'children.archive', documents: 'documents.delete',
      grants: 'grants.manage', gadgets: 'gadgets.manage'
    };
    return this.hasPermission(aliases[table] || `${table}.delete`);
  }
}

export const auth = new AuthService();
export default auth;
