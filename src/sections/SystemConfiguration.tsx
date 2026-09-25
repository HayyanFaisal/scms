import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Building2, CalendarClock, Plus, RefreshCw, RotateCcw, Save } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import AuthorityManagement from '@/components/Admin/AuthorityManagement';
import { useAuth } from '@/hooks/useAuth';
import { configuration, emptyReferenceData, type CategoryRate, type ParentFieldPolicy, type ReferenceData, type ReferenceItem, type ReferenceType } from '@/services/configuration';

type ItemDraft = { id: number | null; type: ReferenceType; name: string; description: string; sortOrder: number; isActive: boolean };
type PolicyDraft = ParentFieldPolicy & { reason: string };

const money = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });

function dateValue(value: string | null): string {
  if (!value) return 'Open ended';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export function SystemConfiguration() {
  const { hasPermission } = useAuth();
  const [data, setData] = useState<ReferenceData>(emptyReferenceData);
  const [rates, setRates] = useState<CategoryRate[]>([]);
  const [fieldPolicies, setFieldPolicies] = useState<ParentFieldPolicy[]>([]);
  const [selectedType, setSelectedType] = useState<ReferenceType>('authority');
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [rateDraft, setRateDraft] = useState({ categoryItemId: '', monthlyAmount: '', effectiveFrom: '', notes: '' });
  const [policyDraft, setPolicyDraft] = useState<PolicyDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canManage = hasPermission('organizations.manage');
  const canReadRates = hasPermission('rates.read');
  const canManageRates = hasPermission('rates.manage');
  const canReadAuthorities = hasPermission('organizations.read');
  const canReadPolicies = hasPermission('settings.read');
  const canManagePolicies = hasPermission('settings.manage');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [masterData, rateData, policyData] = await Promise.all([
        configuration.loadMasterData(),
        canReadRates ? configuration.loadRates() : Promise.resolve([]),
        canReadPolicies ? configuration.loadParentFieldPolicies() : Promise.resolve([])
      ]);
      setData(masterData);
      setRates(rateData);
      setFieldPolicies(policyData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load configuration.');
    } finally {
      setLoading(false);
    }
  }, [canReadPolicies, canReadRates]);

  useEffect(() => { void load(); }, [load]);

  const items = data.items[selectedType] || [];
  const categories = data.items.category.filter(item => item.isActive);
  const currentRates = useMemo(() => rates.filter(rate => rate.isCurrent), [rates]);
  const historyRates = useMemo(() => rates.filter(rate => !rate.isCurrent), [rates]);

  const openNew = () => setDraft({ id: null, type: selectedType, name: '', description: '', sortOrder: (items.at(-1)?.sortOrder || 0) + 10, isActive: true });
  const openEdit = (item: ReferenceItem) => setDraft({ id: item.id, type: item.type, name: item.name, description: item.description, sortOrder: item.sortOrder, isActive: item.isActive });

  const saveItem = async () => {
    if (!draft?.name.trim()) { setError('Name is required.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      if (draft.id) {
        await configuration.updateItem(draft.id, { name: draft.name.trim(), description: draft.description.trim(), sortOrder: draft.sortOrder, isActive: draft.isActive });
        setNotice('Configuration item updated. Existing records were kept consistent.');
      } else {
        await configuration.createItem({ type: draft.type, name: draft.name.trim(), description: draft.description.trim(), sortOrder: draft.sortOrder });
        setNotice('Configuration item created.');
      }
      setDraft(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save configuration.');
    } finally { setBusy(false); }
  };

  const toggleItem = async (item: ReferenceItem) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await configuration.updateItem(item.id, { name: item.name, description: item.description, sortOrder: item.sortOrder, isActive: !item.isActive });
      setNotice(item.isActive ? `${item.name} archived. Existing records still retain it.` : `${item.name} reactivated.`);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update configuration.');
    } finally { setBusy(false); }
  };

  const publishRate = async () => {
    const categoryItemId = Number(rateDraft.categoryItemId);
    const monthlyAmount = Number(rateDraft.monthlyAmount);
    if (!categoryItemId || !monthlyAmount || !rateDraft.effectiveFrom || !rateDraft.notes.trim()) { setError('Category, amount, effective date, and reason are required.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await configuration.publishRate({ categoryItemId, monthlyAmount, effectiveFrom: rateDraft.effectiveFrom, notes: rateDraft.notes.trim() });
      setRateDraft({ categoryItemId: '', monthlyAmount: '', effectiveFrom: '', notes: '' });
      setNotice('New rate schedule published. Existing grants were not changed.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to publish the rate.');
    } finally { setBusy(false); }
  };

  const savePolicy = async () => {
    if (!policyDraft?.reason.trim()) { setError('A reason is required for a field-policy change.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await configuration.updateParentFieldPolicy(policyDraft.fieldCode, {
        updateMode: policyDraft.updateMode,
        isRequired: policyDraft.isRequired,
        isActive: policyDraft.isActive,
        reason: policyDraft.reason.trim()
      });
      setPolicyDraft(null);
      setNotice('Parent field policy updated and audited.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update the field policy.');
    } finally { setBusy(false); }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading system configuration…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">System Configuration</h1><p className="text-muted-foreground">Manage operational choices, rates, and authority credentials without changing code.</p></div>
        <Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {notice && <Alert><AlertDescription>{notice}</AlertDescription></Alert>}

      <Tabs defaultValue="registry">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="registry">Master Data</TabsTrigger>
          {canReadRates && <TabsTrigger value="rates">Category Rates</TabsTrigger>}
          {canReadPolicies && <TabsTrigger value="parent-fields">Parent Fields</TabsTrigger>}
          {canReadAuthorities && <TabsTrigger value="credentials">Authority Credentials</TabsTrigger>}
        </TabsList>

        <TabsContent value="registry" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Operational master data</CardTitle><CardDescription>Archived values remain on historical records but cannot be selected for new work.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="w-full max-w-sm space-y-2"><Label>Registry</Label><Select value={selectedType} onValueChange={value => setSelectedType(value as ReferenceType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{data.types.map(type => <SelectItem key={type.code} value={type.code}>{type.label}</SelectItem>)}</SelectContent></Select></div>
                {canManage && <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Add item</Button>}
              </div>
              <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Status</TableHead><TableHead>Order</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
                {items.map(item => <TableRow key={item.id} className={!item.isActive ? 'opacity-60' : ''}><TableCell><div className="font-medium">{item.name}</div>{item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}</TableCell><TableCell className="font-mono text-xs">{item.code}</TableCell><TableCell><Badge variant={item.isActive ? 'default' : 'secondary'}>{item.isActive ? 'Active' : 'Archived'}</Badge></TableCell><TableCell>{item.sortOrder}</TableCell><TableCell className="text-right">{canManage && <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(item)}>Edit</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void toggleItem(item)}>{item.isActive ? <Archive className="mr-1 h-4 w-4" /> : <RotateCcw className="mr-1 h-4 w-4" />}{item.isActive ? 'Archive' : 'Restore'}</Button></div>}</TableCell></TableRow>)}
                {items.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No items configured.</TableCell></TableRow>}
              </TableBody></Table>
            </CardContent>
          </Card>
        </TabsContent>

        {canReadRates && <TabsContent value="rates" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" />Current rates</CardTitle><CardDescription>Rates are suggestions for new grants; saved grants keep their approved amount.</CardDescription></CardHeader><CardContent className="space-y-3">{currentRates.map(rate => <div key={rate.id} className="flex items-center justify-between rounded-lg border p-3"><div><div className="font-medium">Category {rate.categoryName}</div><div className="text-xs text-muted-foreground">From {dateValue(rate.effectiveFrom)}</div></div><div className="text-lg font-semibold">{money.format(rate.monthlyAmount)}</div></div>)}</CardContent></Card>
            {canManageRates && <Card><CardHeader><CardTitle>Publish a future rate</CardTitle><CardDescription>Schedules are immutable. Publishing a later rate automatically closes the previous period.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label>Category</Label><Select value={rateDraft.categoryItemId} onValueChange={value => setRateDraft(current => ({ ...current, categoryItemId: value }))}><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger><SelectContent>{categories.map(category => <SelectItem key={category.id} value={String(category.id)}>Category {category.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Monthly amount (PKR)</Label><Input type="number" min="1" value={rateDraft.monthlyAmount} onChange={event => setRateDraft(current => ({ ...current, monthlyAmount: event.target.value }))} /></div><div className="space-y-2"><Label>Effective from</Label><Input type="date" value={rateDraft.effectiveFrom} onChange={event => setRateDraft(current => ({ ...current, effectiveFrom: event.target.value }))} /></div><div className="space-y-2"><Label>Reason</Label><Textarea required value={rateDraft.notes} onChange={event => setRateDraft(current => ({ ...current, notes: event.target.value }))} placeholder="Why is this rate changing?" /></div><Button disabled={busy} onClick={() => void publishRate()}><Save className="mr-2 h-4 w-4" />Publish schedule</Button></CardContent></Card>}
          </div>
          {historyRates.length > 0 && <Card><CardHeader><CardTitle>Scheduled and historical rates</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Amount</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Published by</TableHead></TableRow></TableHeader><TableBody>{historyRates.map(rate => <TableRow key={rate.id}><TableCell>{rate.categoryName}</TableCell><TableCell>{money.format(rate.monthlyAmount)}</TableCell><TableCell>{dateValue(rate.effectiveFrom)}</TableCell><TableCell>{dateValue(rate.effectiveTo)}</TableCell><TableCell>{rate.publishedByName || 'System seed'}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
        </TabsContent>}

        {canReadPolicies && <TabsContent value="parent-fields">
          <Card><CardHeader><CardTitle>Parent-managed fields</CardTitle><CardDescription>Choose whether a parent change is immediate, requires staff approval, or is locked. Required fields drive profile completeness.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Field</TableHead><TableHead>Change policy</TableHead><TableHead>Required</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{fieldPolicies.map(policy => <TableRow key={policy.fieldCode}><TableCell><div className="font-medium">{policy.label}</div><div className="font-mono text-xs text-muted-foreground">{policy.fieldCode}</div></TableCell><TableCell><Badge variant="outline">{policy.updateMode.replace('_', ' ')}</Badge></TableCell><TableCell>{policy.isRequired ? 'Yes' : 'No'}</TableCell><TableCell>{policy.isActive ? 'Active' : 'Hidden'}</TableCell><TableCell className="text-right">{canManagePolicies && <Button size="sm" variant="outline" onClick={() => setPolicyDraft({ ...policy, reason: '' })}>Configure</Button>}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        </TabsContent>}

        {canReadAuthorities && <TabsContent value="credentials"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Authority portal access</CardTitle><CardDescription>Director-authorized resets issue temporary credentials. Authority users change their own known password in their portal.</CardDescription></CardHeader><CardContent><AuthorityManagement /></CardContent></Card></TabsContent>}
      </Tabs>

      <Dialog open={!!draft} onOpenChange={open => { if (!open) setDraft(null); }}><DialogContent><DialogHeader><DialogTitle>{draft?.id ? 'Edit configuration item' : 'Add configuration item'}</DialogTitle></DialogHeader>{draft && <div className="space-y-4"><div className="space-y-2"><Label>Name</Label><Input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></div><div className="space-y-2"><Label>Description</Label><Textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></div><div className="space-y-2"><Label>Display order</Label><Input type="number" value={draft.sortOrder} onChange={event => setDraft({ ...draft, sortOrder: Number(event.target.value) || 0 })} /></div></div>}<DialogFooter><Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button><Button disabled={busy} onClick={() => void saveItem()}><Save className="mr-2 h-4 w-4" />Save</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={!!policyDraft} onOpenChange={open => { if (!open) setPolicyDraft(null); }}><DialogContent><DialogHeader><DialogTitle>Configure {policyDraft?.label}</DialogTitle></DialogHeader>{policyDraft && <div className="space-y-4"><div className="space-y-2"><Label>Parent update behavior</Label><Select value={policyDraft.updateMode} onValueChange={value => setPolicyDraft({ ...policyDraft, updateMode: value as ParentFieldPolicy['updateMode'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="direct">Apply immediately</SelectItem><SelectItem value="approval">Require staff approval</SelectItem><SelectItem value="locked">Parent cannot change</SelectItem></SelectContent></Select></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policyDraft.isRequired} onChange={event => setPolicyDraft({ ...policyDraft, isRequired: event.target.checked })} />Required for a complete profile</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policyDraft.isActive} onChange={event => setPolicyDraft({ ...policyDraft, isActive: event.target.checked })} />Show this field to parents</label><div className="space-y-2"><Label>Reason for change</Label><Textarea value={policyDraft.reason} onChange={event => setPolicyDraft({ ...policyDraft, reason: event.target.value })} placeholder="Required for the audit record" /></div></div>}<DialogFooter><Button variant="outline" onClick={() => setPolicyDraft(null)}>Cancel</Button><Button disabled={busy} onClick={() => void savePolicy()}><Save className="mr-2 h-4 w-4" />Save policy</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
