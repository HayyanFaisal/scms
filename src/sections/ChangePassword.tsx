import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';

interface ChangePasswordProps {
  voluntary?: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
}

export function ChangePassword({ voluntary = false, onComplete, onCancel }: ChangePasswordProps) {
  const { changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmation) {
      setError('The new passwords do not match.');
      return;
    }
    if (newPassword.length < 12) {
      setError('Use at least 12 characters for the new password.');
      return;
    }

    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      onComplete?.();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'Unable to change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center bg-slate-950 p-4 text-slate-100">
      <Card className="w-full max-w-md border-slate-700 bg-slate-900 text-slate-100">
        <CardHeader>
          <CardTitle>{voluntary ? 'Change your password' : 'Set your permanent password'}</CardTitle>
          <CardDescription className="text-slate-400">
            {voluntary
              ? 'Enter the current password, then choose a new password of at least 12 characters.'
              : 'This account was issued a temporary credential. Change it before continuing.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input id="current-password" type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} minLength={12} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input id="confirm-password" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} minLength={12} required />
            </div>
            <Button className="w-full" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save password and continue'}
            </Button>
            {voluntary ? (
              <Button className="w-full" type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
            ) : (
              <Button className="w-full" type="button" variant="ghost" onClick={() => void logout()}>Sign out</Button>
            )}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
