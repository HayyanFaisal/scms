import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, MessageSquare, RefreshCw, RotateCcw, Send, XCircle } from 'lucide-react';
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
import { useAuth } from '@/hooks/useAuth';
import { apiFetch, readApiError } from '@/services/http';
import { SubmissionViewer, type SubmissionViewerItem } from '@/components/SubmissionViewer';

interface DocumentRow {
  id: number; document_name: string; original_file_name: string; owner_type: string; owner_id: string;
  Parent_Name: string; Admin_Authority: string | null; status: string; uploaded_at: string; review_reason: string | null;
}
interface FormRow {
  id: number; form_name: string; owner_type: string; owner_id: string; Parent_Name: string;
  Admin_Authority: string | null; status: string; submitted_at: string; review_reason: string | null;
  response_json: Record<string, unknown>; schema_json: { sections?: Array<{ fields: Array<{ key: string; label: string }> }> };
}
interface MessageRow { id: number; sender_type: 'parent' | 'staff'; body: string; is_internal: boolean | number; created_at: string; }
interface MessageThread { id: number; subject: string; status: string; updated_at: string; messages: MessageRow[]; }
interface MessageTarget { ownerType: string; ownerId: string; label: string; }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) throw new Error(await readApiError(response, 'Request failed.'));
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function DocumentReview() {
  const { hasPermission } = useAuth();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [forms, setForms] = useState<FormRow[]>([]);
  const [decision, setDecision] = useState<{ kind: 'document' | 'form'; id: number; action: 'verified' | 'changes_required' | 'rejected' } | null>(null);
  const [reason, setReason] = useState('');
  const [messageTarget, setMessageTarget] = useState<MessageTarget | null>(null);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<number | null>(null);
  const [messageDraft, setMessageDraft] = useState({ subject: '', body: '', isInternal: false });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewerItem, setViewerItem] = useState<SubmissionViewerItem | null>(null);
  const closeViewer = useCallback(() => setViewerItem(null), []);

  const load = useCallback(async () => {
    setError('');
    try {
      const [documentRows, formRows] = await Promise.all([
        hasPermission('documents.read') ? request<DocumentRow[]>('/document-review') : Promise.resolve([]),
        hasPermission('forms.read') ? request<FormRow[]>('/form-review') : Promise.resolve([])
      ]);
      setDocuments(documentRows);
      setForms(formRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load review queue.');
    }
  }, [hasPermission]);

  useEffect(() => { void load(); }, [load]);

  const review = async () => {
    if (!decision) return;
    if (decision.action !== 'verified' && reason.trim().length < 5) {
      setError('A parent-facing reason of at least 5 characters is required.');
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const path = decision.kind === 'document' ? `/document-files/${decision.id}/review` : `/form-submissions/${decision.id}/review`;
      await request(path, { method: 'POST', body: JSON.stringify({ decision: decision.action, reason: reason.trim() }) });
      setDecision(null); setReason(''); setNotice('Review decision saved.');
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Review failed.');
    } finally { setBusy(false); }
  };

  const loadThreads = async (target: MessageTarget) => {
    setBusy(true); setError('');
    try {
      const query = new URLSearchParams({ ownerType: target.ownerType, ownerId: target.ownerId });
      const rows = await request<MessageThread[]>(`/message-threads?${query.toString()}`);
      setThreads(rows);
      setSelectedThread(rows[0]?.id || null);
    } catch (messageError) {
      setError(messageError instanceof Error ? messageError.message : 'Unable to load messages.');
    } finally { setBusy(false); }
  };

  const openMessages = (target: MessageTarget) => {
    setMessageTarget(target); setThreads([]); setSelectedThread(null);
    setMessageDraft({ subject: '', body: '', isInternal: false });
    void loadThreads(target);
  };

  const sendMessage = async () => {
    if (!messageTarget || !messageDraft.body.trim()) return setError('Enter a message.');
    if (!selectedThread && !messageDraft.subject.trim()) return setError('A subject is required for a new conversation.');
    setBusy(true); setError(''); setNotice('');
    try {
      if (selectedThread) {
        await request(`/message-threads/${selectedThread}/messages`, {
          method: 'POST', body: JSON.stringify({ body: messageDraft.body, isInternal: messageDraft.isInternal })
        });
      } else {
        await request('/message-threads', {
          method: 'POST', body: JSON.stringify({
            ownerType: messageTarget.ownerType, ownerId: messageTarget.ownerId,
            subject: messageDraft.subject, body: messageDraft.body, isInternal: messageDraft.isInternal
          })
        });
      }
      setMessageDraft({ subject: '', body: '', isInternal: false });
      setNotice(messageDraft.isInternal ? 'Internal note added.' : 'Message sent to the parent.');
      await loadThreads(messageTarget);
    } catch (messageError) {
      setError(messageError instanceof Error ? messageError.message : 'Unable to send message.');
    } finally { setBusy(false); }
  };

  const recordActions = (kind: 'document' | 'form', id: number, status: string, target: MessageTarget, previewItem: SubmissionViewerItem) => {
    const reviewable = ['pending_review', 'submitted', 'changes_required'].includes(status);
    const mayReview = kind === 'document' ? hasPermission('documents.verify') : hasPermission('forms.review');
    return <div className="flex flex-wrap justify-end gap-1">
      <Button size="sm" variant="outline" onClick={() => setViewerItem(previewItem)}><Eye className="mr-1 h-4 w-4" />Preview</Button>
      {hasPermission('messages.read') && <Button size="sm" variant="outline" onClick={() => openMessages(target)}><MessageSquare className="mr-1 h-4 w-4" />Messages</Button>}
      {reviewable && mayReview && <>
        <Button size="sm" variant="outline" onClick={() => setDecision({ kind, id, action: 'verified' })}><CheckCircle2 className="mr-1 h-4 w-4" />Verify</Button>
        <Button size="sm" variant="outline" onClick={() => setDecision({ kind, id, action: 'changes_required' })}><RotateCcw className="mr-1 h-4 w-4" />Changes</Button>
        <Button size="sm" variant="destructive" onClick={() => setDecision({ kind, id, action: 'rejected' })}><XCircle className="mr-1 h-4 w-4" />Reject</Button>
      </>}
    </div>;
  };

  const readableResponse = (row: FormRow) => {
    const labels = new Map(row.schema_json.sections?.flatMap(section => section.fields.map(field => [field.key, field.label] as const)) || []);
    const entries = Object.entries(row.response_json || {});
    return <>{entries.slice(0, 2).map(([key, value]) => <div key={key} className="truncate text-xs"><span className="font-medium">{labels.get(key) || key}:</span> {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}</div>)}{entries.length > 2 && <div className="text-xs font-medium text-primary">+ {entries.length - 2} more answers</div>}</>;
  };

  const currentThread = threads.find(thread => thread.id === selectedThread);

  return <div className="space-y-6">
    <div className="flex items-start justify-between"><div><h1 className="text-2xl font-bold">Documents & Digital Forms</h1><p className="text-muted-foreground">Review submitted versions and communicate inside your assigned authority scope.</p></div><Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {notice && <Alert><AlertDescription>{notice}</AlertDescription></Alert>}
    <Tabs defaultValue="documents">
      <TabsList><TabsTrigger value="documents">Uploads ({documents.filter(row => row.status === 'pending_review').length})</TabsTrigger><TabsTrigger value="forms">Forms ({forms.filter(row => row.status === 'submitted').length})</TabsTrigger></TabsList>
      <TabsContent value="documents"><Card><CardHeader><CardTitle>Document review queue</CardTitle><CardDescription>File signatures and checksums were captured before these records entered the queue.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Parent / Record</TableHead><TableHead>Authority</TableHead><TableHead>Status</TableHead><TableHead>Uploaded</TableHead><TableHead /></TableRow></TableHeader><TableBody>{documents.map(row => <TableRow key={row.id}><TableCell><div className="font-medium">{row.document_name}</div><div className="text-xs text-muted-foreground">{row.original_file_name}</div></TableCell><TableCell>{row.Parent_Name}<div className="text-xs">{row.owner_type} {row.owner_id}</div></TableCell><TableCell>{row.Admin_Authority || 'Unassigned'}</TableCell><TableCell><Badge variant="outline">{row.status.replace('_', ' ')}</Badge>{row.review_reason && <div className="mt-1 text-xs text-red-600">{row.review_reason}</div>}</TableCell><TableCell>{new Date(row.uploaded_at).toLocaleString()}</TableCell><TableCell>{recordActions('document', row.id, row.status, { ownerType: row.owner_type, ownerId: row.owner_id, label: `${row.document_name} · ${row.Parent_Name}` }, { kind: 'document', id: row.id, title: row.document_name, fileName: row.original_file_name, status: row.status })}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>
      <TabsContent value="forms"><Card><CardHeader><CardTitle>Structured form review</CardTitle><CardDescription>Responses remain tied to their exact published template version.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Form</TableHead><TableHead>Parent / Record</TableHead><TableHead>Authority</TableHead><TableHead>Status</TableHead><TableHead>Response</TableHead><TableHead /></TableRow></TableHeader><TableBody>{forms.map(row => <TableRow key={row.id}><TableCell>{row.form_name}</TableCell><TableCell>{row.Parent_Name}<div className="text-xs">{row.owner_type} {row.owner_id}</div></TableCell><TableCell>{row.Admin_Authority || 'Unassigned'}</TableCell><TableCell><Badge variant="outline">{row.status.replace('_', ' ')}</Badge>{row.review_reason && <div className="mt-1 text-xs text-red-600">{row.review_reason}</div>}</TableCell><TableCell className="max-w-sm space-y-1">{readableResponse(row)}</TableCell><TableCell>{recordActions('form', row.id, row.status, { ownerType: row.owner_type, ownerId: row.owner_id, label: `${row.form_name} · ${row.Parent_Name}` }, { kind: 'form', title: row.form_name, schema: row.schema_json, response: row.response_json, status: row.status })}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>
    </Tabs>

    <Dialog open={Boolean(decision)} onOpenChange={open => { if (!open) { setDecision(null); setReason(''); } }}><DialogContent><DialogHeader><DialogTitle>{decision?.action === 'verified' ? 'Verify submission' : decision?.action === 'changes_required' ? 'Request replacement or correction' : 'Reject submission'}</DialogTitle></DialogHeader><div className="space-y-2"><Label>{decision?.action === 'verified' ? 'Optional review note' : 'Parent-facing reason'}</Label><Textarea value={reason} onChange={event => setReason(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setDecision(null)}>Cancel</Button><Button disabled={busy || (decision?.action !== 'verified' && reason.trim().length < 5)} onClick={() => void review()}>Confirm decision</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(messageTarget)} onOpenChange={open => { if (!open) setMessageTarget(null); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Record messages</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{messageTarget?.label}</p>
        {threads.length > 0 && <div className="space-y-2"><Label>Conversation</Label><Select value={selectedThread ? String(selectedThread) : undefined} onValueChange={value => setSelectedThread(Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{threads.map(thread => <SelectItem key={thread.id} value={String(thread.id)}>{thread.subject} · {thread.status}</SelectItem>)}</SelectContent></Select></div>}
        {currentThread && <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border bg-muted/20 p-3">{currentThread.messages.map(message => <div key={message.id} className={`rounded-lg border p-3 text-sm ${message.is_internal ? 'border-amber-300 bg-amber-50 text-amber-950' : 'bg-background'}`}><div className="mb-1 flex justify-between gap-3 text-xs text-muted-foreground"><span>{message.is_internal ? 'Internal staff note' : message.sender_type === 'parent' ? 'Parent' : 'Staff'}</span><span>{new Date(message.created_at).toLocaleString()}</span></div><div className="whitespace-pre-wrap">{message.body}</div></div>)}</div>}
        {threads.length > 0 && <Button size="sm" variant="ghost" onClick={() => { setSelectedThread(null); setMessageDraft({ subject: '', body: '', isInternal: false }); }}>Start a new conversation</Button>}
        {hasPermission('messages.send') && <div className="space-y-3 rounded-lg border p-4">
          {!selectedThread && <div className="space-y-2"><Label>Subject</Label><Input value={messageDraft.subject} onChange={event => setMessageDraft({ ...messageDraft, subject: event.target.value })} /></div>}
          <div className="space-y-2"><Label>{selectedThread ? 'Reply or internal note' : 'First message'}</Label><Textarea value={messageDraft.body} onChange={event => setMessageDraft({ ...messageDraft, body: event.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={messageDraft.isInternal} onChange={event => setMessageDraft({ ...messageDraft, isInternal: event.target.checked })} />Internal note — never shown in the parent portal</label>
        </div>}
        <DialogFooter><Button variant="outline" onClick={() => setMessageTarget(null)}>Close</Button>{hasPermission('messages.send') && <Button disabled={busy || !messageDraft.body.trim() || (!selectedThread && !messageDraft.subject.trim())} onClick={() => void sendMessage()}><Send className="mr-2 h-4 w-4" />{messageDraft.isInternal ? 'Add internal note' : 'Send to parent'}</Button>}</DialogFooter>
      </DialogContent>
    </Dialog>
    <SubmissionViewer item={viewerItem} onClose={closeViewer} />
  </div>;
}
