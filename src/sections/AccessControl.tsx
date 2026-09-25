import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, KeyRound, LockKeyhole, Plus, RefreshCw, Save, ShieldCheck, UserCog, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiFetch, readApiError } from '@/services/http';
import { useAuth } from '@/hooks/useAuth';

interface Permission {
  id: number;
  code: string;
  description: string;
  group: string;
}

interface Role {
  id: number;
  name: string;
  description: string;
  isBuiltin: boolean;
  isProtected: boolean;
  isActive: boolean;
  permissionIds: number[];
}

interface DataScope {
  id: number;
  name: string;
  type: string;
  configuration: { authorities?: string[] };
  isBuiltin: boolean;
  isActive: boolean;
}

interface ScopeModule {
  code: string;
  label: string;
}

interface Catalog {
  permissions: Permission[];
  roles: Role[];
  scopes: DataScope[];
  authorities: string[];
  modules: ScopeModule[];
}

interface StaffRole {
  id: number;
  name: string;
}

interface ScopeAssignment {
  moduleCode: string;
  scopeId: number;
  scopeName?: string;
}

interface StaffUser {
  id: number;
  username: string;
  displayName: string;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  temporaryPasswordExpiresAt: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  roles: StaffRole[];
  scopes: ScopeAssignment[];
}

interface StaffDraft {
  id: number | null;
  username: string;
  displayName: string;
  email: string;
  temporaryPassword: string;
  isActive: boolean;
  roleIds: number[];
  scopeAssignments: ScopeAssignment[];
}

interface RoleDraft {
  id: number | null;
  name: string;
  description: string;
  isActive: boolean;
  permissionIds: number[];
  isBuiltin: boolean;
  isProtected: boolean;
}

interface ScopeDraft {
  id: number | null;
  name: string;
  isActive: boolean;
  authorities: string[];
}

const emptyCatalog: Catalog = { permissions: [], roles: [], scopes: [], authorities: [], modules: [] };

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

function generateTemporaryPassword(): string {
  const bytes = new Uint32Array(3);
  crypto.getRandomValues(bytes);
  return `SCMS-${bytes[0].toString(36)}-${bytes[1].toString(36)}-${bytes[2].toString(36)}!`;
}

function selectClasses(): string {
  return 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring';
}

export function AccessControl() {
  const { user, hasPermission } = useAuth();
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [staffDraft, setStaffDraft] = useState<StaffDraft | null>(null);
  const [roleDraft, setRoleDraft] = useState<RoleDraft | null>(null);
  const [scopeDraft, setScopeDraft] = useState<ScopeDraft | null>(null);
  const canManageUsers = hasPermission('users.manage');
  const canManageRoles = hasPermission('roles.manage');
  const canManageAssignments = hasPermission('assignments.manage');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [catalogResponse, usersResponse] = await Promise.all([
        apiFetch('/access-control/catalog'),
        apiFetch('/access-control/users')
      ]);
      if (!catalogResponse.ok) throw new Error(await readApiError(catalogResponse, 'Unable to load access-control settings.'));
      if (!usersResponse.ok) throw new Error(await readApiError(usersResponse, 'Unable to load staff accounts.'));
      setCatalog(await catalogResponse.json() as Catalog);
      setUsers(await usersResponse.json() as StaffUser[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load access-control settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const defaultScopeId = catalog.scopes.find(scope => scope.name === 'No records')?.id || catalog.scopes[0]?.id || 0;
  const activeRoles = catalog.roles.filter(role => role.isActive);
  const activeScopes = catalog.scopes.filter(scope => scope.isActive);
  const permissionGroups = useMemo(() => {
    const grouped = new Map<string, Permission[]>();
    for (const permission of catalog.permissions) {
      if (!grouped.has(permission.group)) grouped.set(permission.group, []);
      grouped.get(permission.group)?.push(permission);
    }
    return [...grouped.entries()];
  }, [catalog.permissions]);

  const startNewUser = () => {
    setStaffDraft({
      id: null,
      username: '',
      displayName: '',
      email: '',
      temporaryPassword: generateTemporaryPassword(),
      isActive: true,
      roleIds: [],
      scopeAssignments: catalog.modules.map(module => ({ moduleCode: module.code, scopeId: defaultScopeId }))
    });
    setError('');
    setNotice('');
  };

  const editUser = (staff: StaffUser) => {
    const assignments = catalog.modules.map(module => ({
      moduleCode: module.code,
      scopeId: staff.scopes.find(scope => scope.moduleCode === module.code)?.scopeId || defaultScopeId
    }));
    setStaffDraft({
      id: staff.id,
      username: staff.username,
      displayName: staff.displayName,
      email: staff.email,
      temporaryPassword: '',
      isActive: staff.isActive,
      roleIds: staff.roles.map(role => role.id),
      scopeAssignments: assignments
    });
    setError('');
    setNotice('');
  };

  const updateDraftRole = (roleId: number, checked: boolean) => {
    if (!staffDraft) return;
    setStaffDraft({
      ...staffDraft,
      roleIds: checked ? [...staffDraft.roleIds, roleId] : staffDraft.roleIds.filter(id => id !== roleId)
    });
  };

  const saveUser = async () => {
    if (!staffDraft) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const path = staffDraft.id === null ? '/access-control/users' : `/access-control/users/${staffDraft.id}`;
      const response = await apiFetch(path, {
        method: staffDraft.id === null ? 'POST' : 'PATCH',
        body: JSON.stringify(staffDraft)
      });
      if (!response.ok) throw new Error(await readApiError(response, 'Unable to save the staff account.'));
      setNotice(staffDraft.id === null
        ? 'Staff account created. The temporary password expires in 24 hours.'
        : 'Staff account, roles, and data scopes updated.');
      setStaffDraft(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the staff account.');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (staff: StaffUser) => {
    const temporaryPassword = generateTemporaryPassword();
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(`/access-control/users/${staff.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ temporaryPassword })
      });
      if (!response.ok) throw new Error(await readApiError(response, 'Unable to reset the password.'));
      await navigator.clipboard?.writeText(temporaryPassword);
      setNotice(`Temporary password for ${staff.username}: ${temporaryPassword} (copied when browser permissions allow; expires in 24 hours)`);
      await load();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to reset the password.');
    } finally {
      setBusy(false);
    }
  };

  const unlockUser = async (staff: StaffUser) => {
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(`/access-control/users/${staff.id}/unlock`, { method: 'POST' });
      if (!response.ok) throw new Error(await readApiError(response, 'Unable to unlock the account.'));
      setNotice(`${staff.username} is unlocked.`);
      await load();
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : 'Unable to unlock the account.');
    } finally {
      setBusy(false);
    }
  };

  const startNewRole = () => {
    setRoleDraft({ id: null, name: '', description: '', isActive: true, permissionIds: [], isBuiltin: false, isProtected: false });
    setError('');
  };

  const editRole = (role: Role) => {
    setRoleDraft({
      id: role.id,
      name: role.name,
      description: role.description,
      isActive: role.isActive,
      permissionIds: [...role.permissionIds],
      isBuiltin: role.isBuiltin,
      isProtected: role.isProtected
    });
    setError('');
  };

  const updateDraftPermission = (permissionId: number, checked: boolean) => {
    if (!roleDraft || roleDraft.isProtected) return;
    setRoleDraft({
      ...roleDraft,
      permissionIds: checked
        ? [...roleDraft.permissionIds, permissionId]
        : roleDraft.permissionIds.filter(id => id !== permissionId)
    });
  };

  const saveRole = async () => {
    if (!roleDraft) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(roleDraft.id === null ? '/access-control/roles' : `/access-control/roles/${roleDraft.id}`, {
        method: roleDraft.id === null ? 'POST' : 'PATCH',
        body: JSON.stringify(roleDraft)
      });
      if (!response.ok) throw new Error(await readApiError(response, 'Unable to save the role.'));
      setNotice(roleDraft.id === null ? 'Role created.' : 'Role rules updated. Active sessions using a disabled role were revoked.');
      setRoleDraft(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the role.');
    } finally {
      setBusy(false);
    }
  };

  const startNewScope = () => {
    setScopeDraft({ id: null, name: '', isActive: true, authorities: [] });
    setError('');
  };

  const editScope = (scope: DataScope) => {
    setScopeDraft({
      id: scope.id,
      name: scope.name,
      isActive: scope.isActive,
      authorities: [...(scope.configuration.authorities || [])]
    });
    setError('');
  };

  const saveScope = async () => {
    if (!scopeDraft) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(scopeDraft.id === null ? '/access-control/scopes' : `/access-control/scopes/${scopeDraft.id}`, {
        method: scopeDraft.id === null ? 'POST' : 'PATCH',
        body: JSON.stringify(scopeDraft)
      });
      if (!response.ok) throw new Error(await readApiError(response, 'Unable to save the data scope.'));
      setNotice(scopeDraft.id === null ? 'Data scope created.' : 'Data scope updated.');
      setScopeDraft(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the data scope.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="min-h-64 grid place-items-center text-muted-foreground">Loading access controls…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold">Access Control</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Manage named staff accounts, role rules, and authority-level data boundaries.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={busy}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</div>}

      <Tabs defaultValue="users">
        <TabsList className="grid h-auto w-full grid-cols-3 sm:w-fit">
          <TabsTrigger value="users"><Users /> Accounts</TabsTrigger>
          <TabsTrigger value="roles"><UserCog /> Roles</TabsTrigger>
          <TabsTrigger value="scopes"><LockKeyhole /> Data scopes</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{users.length} named staff account{users.length === 1 ? '' : 's'}</p>
            {canManageUsers && <Button onClick={startNewUser}><Plus className="mr-2 h-4 w-4" /> New account</Button>}
          </div>

          {staffDraft && (
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle>{staffDraft.id === null ? 'Create staff account' : `Edit ${staffDraft.username}`}</CardTitle>
                <CardDescription>Every account must have at least one role and a scope for each protected data module.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="staff-username">Username</Label><Input id="staff-username" value={staffDraft.username} disabled={staffDraft.id !== null} onChange={event => setStaffDraft({ ...staffDraft, username: event.target.value })} /></div>
                  <div className="space-y-2"><Label htmlFor="staff-name">Display name</Label><Input id="staff-name" value={staffDraft.displayName} onChange={event => setStaffDraft({ ...staffDraft, displayName: event.target.value })} /></div>
                  <div className="space-y-2"><Label htmlFor="staff-email">Email (optional)</Label><Input id="staff-email" type="email" value={staffDraft.email} onChange={event => setStaffDraft({ ...staffDraft, email: event.target.value })} /></div>
                  {staffDraft.id === null && (
                    <div className="space-y-2">
                      <Label htmlFor="staff-password">Temporary password</Label>
                      <div className="flex gap-2"><Input id="staff-password" value={staffDraft.temporaryPassword} onChange={event => setStaffDraft({ ...staffDraft, temporaryPassword: event.target.value })} /><Button type="button" variant="outline" size="icon" title="Copy password" onClick={() => void navigator.clipboard?.writeText(staffDraft.temporaryPassword)}><Copy className="h-4 w-4" /></Button></div>
                      <p className="text-xs text-muted-foreground">Expires after 24 hours and must be replaced at first sign-in.</p>
                    </div>
                  )}
                </div>

                <div>
                  <Label>Roles</Label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {activeRoles.map(role => <label key={role.id} className="flex items-start gap-3 rounded-lg border p-3"><Checkbox checked={staffDraft.roleIds.includes(role.id)} onCheckedChange={value => updateDraftRole(role.id, value === true)} /><span><span className="block text-sm font-medium">{role.name}</span><span className="block text-xs text-muted-foreground">{role.description}</span></span></label>)}
                  </div>
                </div>

                <div>
                  <Label>Data access by module</Label>
                  <div className="mt-2 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {catalog.modules.map(module => {
                      const assignment = staffDraft.scopeAssignments.find(item => item.moduleCode === module.code);
                      return <div key={module.code} className="space-y-1 rounded-lg border p-3"><Label htmlFor={`scope-${module.code}`} className="text-xs uppercase tracking-wide text-muted-foreground">{module.label}</Label><select id={`scope-${module.code}`} className={selectClasses()} value={assignment?.scopeId || ''} onChange={event => setStaffDraft({ ...staffDraft, scopeAssignments: staffDraft.scopeAssignments.map(item => item.moduleCode === module.code ? { ...item, scopeId: Number(event.target.value) } : item) })}>{activeScopes.map(scope => <option key={scope.id} value={scope.id}>{scope.name}</option>)}</select></div>;
                    })}
                  </div>
                </div>

                {staffDraft.id !== null && <label className="flex items-center gap-3"><Switch checked={staffDraft.isActive} onCheckedChange={value => setStaffDraft({ ...staffDraft, isActive: value })} /><span className="text-sm">Account active</span></label>}
                <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setStaffDraft(null)}>Cancel</Button><Button onClick={() => void saveUser()} disabled={busy}><Save className="mr-2 h-4 w-4" /> Save account</Button></div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            {users.map(staff => {
              const locked = Boolean(staff.lockedUntil && new Date(staff.lockedUntil).getTime() > Date.now());
              return <Card key={staff.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div><CardTitle>{staff.displayName}</CardTitle><CardDescription>@{staff.username}{staff.email ? ` · ${staff.email}` : ''}</CardDescription></div>
                    <Badge variant={staff.isActive ? 'default' : 'secondary'}>{staff.isActive ? 'Active' : 'Inactive'}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">{staff.roles.map(role => <Badge key={role.id} variant="outline">{role.name}</Badge>)}{staff.mustChangePassword && <Badge variant="secondary">Password change required</Badge>}{locked && <Badge variant="destructive">Locked</Badge>}</div>
                  <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Last sign-in</dt><dd>{formatDate(staff.lastLoginAt)}</dd></div><div><dt className="text-muted-foreground">Created</dt><dd>{formatDate(staff.createdAt)}</dd></div></dl>
                  <div className="flex flex-wrap gap-2">
                    {canManageUsers && <Button size="sm" variant="outline" onClick={() => editUser(staff)}>Edit access</Button>}
                    {canManageUsers && hasPermission('accounts.issue_one_time_password') && <Button size="sm" variant="outline" onClick={() => void resetPassword(staff)} disabled={busy}><KeyRound className="mr-2 h-4 w-4" /> Reset password</Button>}
                    {canManageUsers && hasPermission('accounts.unlock') && locked && <Button size="sm" variant="outline" onClick={() => void unlockUser(staff)} disabled={busy}>Unlock</Button>}
                    {staff.id === user?.User_ID && <Badge variant="outline">Current account</Badge>}
                  </div>
                </CardContent>
              </Card>;
            })}
          </div>
        </TabsContent>

        <TabsContent value="roles" className="space-y-4 pt-4">
          <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Role permissions are combined when an account has multiple roles.</p>{canManageRoles && <Button onClick={startNewRole}><Plus className="mr-2 h-4 w-4" /> New role</Button>}</div>
          <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.6fr)]">
            <div className="space-y-2">{catalog.roles.map(role => <button key={role.id} type="button" onClick={() => editRole(role)} className={`w-full rounded-lg border p-4 text-left transition hover:border-primary/50 ${roleDraft?.id === role.id ? 'border-primary bg-primary/5' : ''}`}><span className="flex items-center justify-between gap-2"><span className="font-semibold">{role.name}</span>{role.isProtected && <ShieldCheck className="h-4 w-4 text-primary" />}</span><span className="mt-1 block text-xs text-muted-foreground">{role.permissionIds.length} permissions · {role.isActive ? 'Active' : 'Inactive'}</span></button>)}</div>
            <Card>
              <CardHeader><CardTitle>{roleDraft ? (roleDraft.id === null ? 'Create role' : roleDraft.name) : 'Select a role'}</CardTitle><CardDescription>{roleDraft?.isProtected ? 'The Director role is protected and always has every permission.' : 'Choose the exact actions this role is allowed to perform.'}</CardDescription></CardHeader>
              {roleDraft && <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="role-name">Role name</Label><Input id="role-name" disabled={roleDraft.isBuiltin} value={roleDraft.name} onChange={event => setRoleDraft({ ...roleDraft, name: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="role-description">Description</Label><Input id="role-description" disabled={roleDraft.isProtected} value={roleDraft.description} onChange={event => setRoleDraft({ ...roleDraft, description: event.target.value })} /></div></div>
                {!roleDraft.isProtected && <label className="flex items-center gap-3"><Switch checked={roleDraft.isActive} onCheckedChange={value => setRoleDraft({ ...roleDraft, isActive: value })} /><span className="text-sm">Role active</span></label>}
                <div className="grid gap-4 md:grid-cols-2">{permissionGroups.map(([group, permissions]) => <div key={group} className="rounded-lg border p-4"><h3 className="mb-3 font-semibold capitalize">{group.replaceAll('_', ' ')}</h3><div className="space-y-3">{permissions.map(permission => <label key={permission.id} className="flex items-start gap-3"><Checkbox disabled={roleDraft.isProtected} checked={roleDraft.isProtected || roleDraft.permissionIds.includes(permission.id)} onCheckedChange={value => updateDraftPermission(permission.id, value === true)} /><span><span className="block text-sm font-medium">{permission.code}</span><span className="block text-xs text-muted-foreground">{permission.description}</span></span></label>)}</div></div>)}</div>
                {canManageRoles && !roleDraft.isProtected && <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRoleDraft(null)}>Cancel</Button><Button onClick={() => void saveRole()} disabled={busy}><Save className="mr-2 h-4 w-4" /> Save role</Button></div>}
              </CardContent>}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="scopes" className="space-y-4 pt-4">
          <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Scopes limit accounts to all, none, or selected administrative authorities.</p>{canManageAssignments && <Button onClick={startNewScope} disabled={catalog.authorities.length === 0}><Plus className="mr-2 h-4 w-4" /> New scope</Button>}</div>
          {catalog.authorities.length === 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">No authorities exist in parent records yet. Add authority master data before creating a selected-authority scope.</div>}
          <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.6fr)]">
            <div className="space-y-2">{catalog.scopes.map(scope => <button key={scope.id} type="button" onClick={() => editScope(scope)} className={`w-full rounded-lg border p-4 text-left transition hover:border-primary/50 ${scopeDraft?.id === scope.id ? 'border-primary bg-primary/5' : ''}`}><span className="flex items-center justify-between"><span className="font-semibold">{scope.name}</span>{scope.isBuiltin && <LockKeyhole className="h-4 w-4 text-primary" />}</span><span className="mt-1 block text-xs text-muted-foreground">{scope.type.replaceAll('_', ' ')} · {scope.isActive ? 'Active' : 'Inactive'}</span></button>)}</div>
            <Card>
              <CardHeader><CardTitle>{scopeDraft ? (scopeDraft.id === null ? 'Create data scope' : scopeDraft.name) : 'Select a data scope'}</CardTitle><CardDescription>{scopeDraft?.id && catalog.scopes.find(scope => scope.id === scopeDraft.id)?.isBuiltin ? 'Built-in scopes are fixed security boundaries.' : 'Group one or more authorities into a reusable access boundary.'}</CardDescription></CardHeader>
              {scopeDraft && <CardContent className="space-y-5">
                <div className="space-y-2"><Label htmlFor="scope-name">Scope name</Label><Input id="scope-name" disabled={Boolean(scopeDraft.id && catalog.scopes.find(scope => scope.id === scopeDraft.id)?.isBuiltin)} value={scopeDraft.name} onChange={event => setScopeDraft({ ...scopeDraft, name: event.target.value })} /></div>
                {!(scopeDraft.id && catalog.scopes.find(scope => scope.id === scopeDraft.id)?.isBuiltin) && <>
                  <label className="flex items-center gap-3"><Switch checked={scopeDraft.isActive} onCheckedChange={value => setScopeDraft({ ...scopeDraft, isActive: value })} /><span className="text-sm">Scope active</span></label>
                  <div><Label>Authorities</Label><div className="mt-2 grid gap-2 md:grid-cols-2">{catalog.authorities.map(authority => <label key={authority} className="flex items-center gap-3 rounded-lg border p-3"><Checkbox checked={scopeDraft.authorities.includes(authority)} onCheckedChange={value => setScopeDraft({ ...scopeDraft, authorities: value === true ? [...scopeDraft.authorities, authority] : scopeDraft.authorities.filter(item => item !== authority) })} /><span className="text-sm">{authority}</span></label>)}</div></div>
                  {canManageAssignments && <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setScopeDraft(null)}>Cancel</Button><Button onClick={() => void saveScope()} disabled={busy}><Check className="mr-2 h-4 w-4" /> Save scope</Button></div>}
                </>}
              </CardContent>}
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
