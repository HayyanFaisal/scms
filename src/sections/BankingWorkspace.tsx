import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Eye, MessageSquare, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, readApiError } from "@/services/http";

interface BankingRecord {
  Account_ID: number;
  P_No_O_No: string;
  Parent_Name: string;
  Parent_CNIC?: string;
  Admin_Authority?: string;
  Bank_Name: string;
  Account_Title: string;
  Account_Number: string;
  Branch_Code?: string;
  Branch_Address?: string;
  IBAN?: string;
  CNIC_of_Account_Holder?: string;
  Verification_Status: string;
  Review_Reason?: string;
  Verified_By_Name?: string;
  Verified_At?: string;
  Submitted_At?: string;
  Evidence_Required_From?: string;
  Updated_At: string;
  Evidence_Count: number;
  Verified_Evidence_Count: number;
}

interface EvidenceFile {
  id: number;
  document_type_id: number;
  original_file_name: string;
  status: string;
  review_reason?: string;
  uploaded_at: string;
}

interface Requirement {
  document_type_id: number;
  name: string;
  is_required: boolean;
}

interface ThreadMessage { id: number; sender_type: string; body: string; created_at: string; is_internal: boolean; }
interface MessageThread { id: number; subject: string; status: string; messages: ThreadMessage[]; }
interface Workspace { requirements: Requirement[]; files: EvidenceFile[]; }
interface HistoryRow { id: number; version_number: number; action: string; verification_status: string; reason?: string; actor_type: string; actor_id: string; created_at: string; }

const statusStyles: Record<string, string> = {
  pending_evidence: "bg-slate-100 text-slate-700 border-slate-300",
  pending_review: "bg-amber-100 text-amber-800 border-amber-300",
  changes_required: "bg-rose-100 text-rose-800 border-rose-300",
  verified: "bg-emerald-100 text-emerald-800 border-emerald-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) throw new Error(await readApiError(response, "Request failed."));
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function BankingWorkspace() {
  const { hasPermission } = useAuth();
  const canVerify = hasPermission("banking.verify");
  const canReadEvidence = hasPermission("documents.read");
  const canMessage = hasPermission("messages.read") && hasPermission("messages.send");
  const [records, setRecords] = useState<BankingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<BankingRecord | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [reply, setReply] = useState("");
  const [review, setReview] = useState<{ decision: string; record: BankingRecord } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; mime: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRecords(await request<BankingRecord[]>("/banking-workspace")); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to load banking records."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return records.filter(record => (status === "all" || record.Verification_Status === status)
      && (!needle || [record.P_No_O_No, record.Parent_Name, record.Parent_CNIC, record.Admin_Authority,
        record.Bank_Name, record.Account_Title, record.IBAN]
        .some(value => String(value ?? "").toLocaleLowerCase().includes(needle))));
  }, [records, search, status]);

  const openRecord = async (record: BankingRecord) => {
    setSelected(record);
    setWorkspace(null);
    setThreads([]);
    setHistory([]);
    try {
      const query = new URLSearchParams({ ownerType: "banking", ownerId: String(record.Account_ID) });
      const [documents, messages, historyRows] = await Promise.all([
        canReadEvidence ? request<Workspace>(`/document-workspace?${query.toString()}`) : Promise.resolve({ requirements: [], files: [] }),
        canMessage ? request<MessageThread[]>(`/message-threads?${query.toString()}`) : Promise.resolve([]),
        request<HistoryRow[]>(`/banking/${record.Account_ID}/history`),
      ]);
      setWorkspace(documents);
      setThreads(messages);
      setHistory(historyRows);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to load banking evidence."); }
  };

  const previewFile = async (file: EvidenceFile) => {
    try {
      const response = await apiFetch(`/document-files/${file.id}/content`);
      if (!response.ok) throw new Error(await readApiError(response, "Preview unavailable."));
      const blob = await response.blob();
      if (preview?.url) URL.revokeObjectURL(preview.url);
      setPreview({ url: URL.createObjectURL(blob), mime: blob.type, name: file.original_file_name });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Preview unavailable."); }
  };

  const submitReview = async () => {
    if (!review) return;
    setBusy(true);
    try {
      await request(`/banking/${review.record.Account_ID}/review`, {
        method: "POST",
        body: JSON.stringify({ decision: review.decision, reason }),
      });
      toast.success(review.decision === "verified" ? "Banking record verified." : "Parent-facing review response saved.");
      setReview(null); setReason(""); setSelected(null); setWorkspace(null);
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save banking decision."); }
    finally { setBusy(false); }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    try {
      const current = threads.find(thread => thread.status === "open");
      if (current) {
        await request(`/message-threads/${current.id}/messages`, { method: "POST", body: JSON.stringify({ body: reply.trim() }) });
      } else {
        await request("/message-threads", { method: "POST", body: JSON.stringify({ ownerType: "banking", ownerId: selected.Account_ID, subject: "Banking evidence review", body: reply.trim() }) });
      }
      setReply("");
      await openRecord(selected);
      toast.success("Message sent to the parent.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to send message."); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold">Banking Review</h1><p className="text-muted-foreground">Verify account details only after the configured evidence has been reviewed.</p></div>
      <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["Total records", records.length],
        ["Awaiting review", records.filter(row => row.Verification_Status === "pending_review").length],
        ["Changes required", records.filter(row => row.Verification_Status === "changes_required").length],
        ["Verified", records.filter(row => row.Verification_Status === "verified").length],
      ].map(([label, value]) => <Card key={String(label)}><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></CardContent></Card>)}
    </div>
    <Card><CardContent className="flex flex-col gap-3 pt-6 sm:flex-row">
      <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search parent, PN/O, bank, authority, or IBAN" value={search} onChange={event => setSearch(event.target.value)} /></div>
      <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger><SelectContent>
        <SelectItem value="all">All statuses</SelectItem><SelectItem value="pending_evidence">Pending evidence</SelectItem><SelectItem value="pending_review">Pending review</SelectItem><SelectItem value="changes_required">Changes required</SelectItem><SelectItem value="verified">Verified</SelectItem><SelectItem value="rejected">Rejected</SelectItem>
      </SelectContent></Select>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Banking records</CardTitle><CardDescription>{filtered.length} record(s) within your assigned authority scope.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto rounded-lg border"><Table>
      <TableHeader><TableRow><TableHead>Parent</TableHead><TableHead>Bank / account</TableHead><TableHead>Authority</TableHead><TableHead>Evidence</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
      <TableBody>{filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">{loading ? "Loading banking records..." : "No matching banking records."}</TableCell></TableRow> : filtered.map(record => <TableRow key={record.Account_ID}>
        <TableCell><div className="font-medium">{record.Parent_Name}</div><div className="text-xs text-muted-foreground">{record.P_No_O_No}</div></TableCell>
        <TableCell><div>{record.Bank_Name}</div><div className="text-xs text-muted-foreground">{record.Account_Title} · {record.IBAN || record.Account_Number}</div></TableCell>
        <TableCell>{record.Admin_Authority || "No authority"}</TableCell>
        <TableCell>{Number(record.Verified_Evidence_Count)}/{Number(record.Evidence_Count)} verified</TableCell>
        <TableCell><Badge variant="outline" className={statusStyles[record.Verification_Status] || ""}>{record.Verification_Status.replaceAll("_", " ")}</Badge></TableCell>
        <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => void openRecord(record)}><Eye className="mr-2 h-4 w-4" />Review</Button></TableCell>
      </TableRow>)}</TableBody>
    </Table></div></CardContent></Card>

    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />{selected?.Parent_Name} · banking evidence</DialogTitle><DialogDescription>{selected?.Bank_Name} · {selected?.Account_Title} · {selected?.IBAN || selected?.Account_Number}</DialogDescription></DialogHeader>
      {selected?.Review_Reason && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Previous response: {selected.Review_Reason}</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
        ["PN/O", selected?.P_No_O_No], ["Authority", selected?.Admin_Authority || "No authority"], ["Branch", selected?.Branch_Address || selected?.Branch_Code || "—"], ["Account-holder CNIC", selected?.CNIC_of_Account_Holder || "—"],
      ].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="mt-1 font-medium">{value}</div></div>)}</div>
      <div className="space-y-3"><h3 className="font-semibold">Required evidence</h3>{!canReadEvidence ? <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">Your role can view banking metadata but does not have permission to open document evidence.</p> : !workspace ? <p className="text-sm text-muted-foreground">Loading evidence...</p> : workspace.requirements.length === 0 ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No banking evidence requirement is configured. Verification is blocked until a Director publishes one.</p> : workspace.requirements.map(requirement => { const files = workspace.files.filter(file => file.document_type_id === requirement.document_type_id && file.status !== "superseded" && (!selected?.Evidence_Required_From || new Date(file.uploaded_at).getTime() >= new Date(selected.Evidence_Required_From).getTime())); const file = files[0]; return <div key={requirement.document_type_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><div><div className="font-medium">{requirement.name}{requirement.is_required ? " · Required" : ""}</div>{file ? <div className="text-xs text-muted-foreground">{file.original_file_name} · {file.status.replaceAll("_", " ")} · {new Date(file.uploaded_at).toLocaleString()}</div> : <div className="text-xs text-rose-600">No current evidence submitted</div>}{file?.review_reason && <div className="text-xs text-rose-600">{file.review_reason}</div>}</div>{file && <Button size="sm" variant="outline" onClick={() => void previewFile(file)}><Eye className="mr-2 h-4 w-4" />Preview</Button>}</div>; })}</div>
      {canMessage && <div className="space-y-3 rounded-xl border p-4"><h3 className="flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4" />Parent conversation</h3><div className="max-h-52 space-y-2 overflow-y-auto">{threads.flatMap(thread => thread.messages || []).filter(message => !message.is_internal).map(message => <div key={message.id} className={`rounded-lg p-3 text-sm ${message.sender_type === "staff" ? "ml-8 bg-blue-50" : "mr-8 bg-slate-100"}`}><div>{message.body}</div><div className="mt-1 text-xs text-muted-foreground">{message.sender_type} · {new Date(message.created_at).toLocaleString()}</div></div>)}{threads.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}</div><div className="flex gap-2"><Textarea value={reply} onChange={event => setReply(event.target.value)} placeholder="Write a parent-visible reply" /><Button disabled={busy || !reply.trim()} onClick={() => void sendReply()}>Send</Button></div></div>}
      <div className="space-y-3 rounded-xl border p-4"><h3 className="font-semibold">Version history</h3>{history.length === 0 ? <p className="text-sm text-muted-foreground">No workflow events recorded yet.</p> : <div className="max-h-48 space-y-2 overflow-y-auto">{history.map(item => <div key={item.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm"><div><div className="font-medium capitalize">{item.action.replaceAll("_", " ")}</div><div className="text-xs text-muted-foreground">Version {item.version_number} · {item.actor_type} {item.actor_id} · {item.verification_status.replaceAll("_", " ")}</div>{item.reason && <div className="mt-1 text-xs text-rose-700">{item.reason}</div>}</div><time className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</time></div>)}</div>}</div>
      <DialogFooter className="flex-wrap">{canVerify && selected?.Verification_Status === "pending_review" && <><Button variant="outline" onClick={() => { setReason(""); setReview({ decision: "changes_required", record: selected }); }}><XCircle className="mr-2 h-4 w-4" />Request changes</Button><Button onClick={() => { setReason(""); setReview({ decision: "verified", record: selected }); }}><ShieldCheck className="mr-2 h-4 w-4" />Verify banking</Button></>}<Button variant="outline" onClick={() => setSelected(null)}>Close</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={Boolean(review)} onOpenChange={open => { if (!open) setReview(null); }}><DialogContent><DialogHeader><DialogTitle>{review?.decision === "verified" ? "Verify banking record" : "Request banking changes"}</DialogTitle><DialogDescription>{review?.decision === "verified" ? "SCMS will verify that every required evidence file has already been approved." : "Explain exactly what the parent must correct or replace."}</DialogDescription></DialogHeader><div className="space-y-2"><Label>Reason {review?.decision !== "verified" && "(required)"}</Label><Textarea value={reason} onChange={event => setReason(event.target.value)} placeholder={review?.decision === "verified" ? "Optional verification note" : "Parent-visible correction instructions"} /></div><DialogFooter><Button variant="outline" onClick={() => setReview(null)}>Cancel</Button><Button disabled={busy || (review?.decision !== "verified" && reason.trim().length < 5)} onClick={() => void submitReview()}>{review?.decision === "verified" ? <><CheckCircle2 className="mr-2 h-4 w-4" />Verify</> : "Send correction request"}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(preview)} onOpenChange={open => { if (!open) setPreview(null); }}><DialogContent className="max-w-6xl"><DialogHeader><DialogTitle>{preview?.name}</DialogTitle></DialogHeader>{preview && <div className="h-[72vh] rounded-lg bg-slate-100 p-2">{preview.mime === "application/pdf" ? <iframe className="h-full w-full bg-white" src={preview.url} title={preview.name} /> : preview.mime.startsWith("image/") ? <img className="h-full w-full object-contain" src={preview.url} alt={preview.name} /> : <div className="flex h-full items-center justify-center">Preview unavailable for this file type.</div>}</div>}<DialogFooter>{preview && <a href={preview.url} download={preview.name}><Button variant="outline">Download</Button></a>}<Button onClick={() => setPreview(null)}>Close</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
