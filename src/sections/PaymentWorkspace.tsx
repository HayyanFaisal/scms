import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CheckCircle2, Download, Eye, Plus, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, formatDate } from "@/lib/validation";
import { apiFetch, readApiError } from "@/services/http";

interface BudgetSummary {
  id: number | null;
  fiscalYear: string;
  authorityCode: string;
  approvedAmount: number;
  committedAmount: number;
  availableAmount: number;
  status: string;
  reason?: string;
}

interface PreviewItem {
  grantId: number;
  childName: string;
  parentName: string;
  parentPNo: string;
  category: string;
  amount: number;
  bankName: string;
  accountNumber: string;
}

interface ExcludedItem {
  grantId: number;
  childName: string;
  parentName: string;
  code: string;
}

interface Preview {
  paymentMonth: string;
  fiscalYear: string;
  authorityCode: string;
  eligible: PreviewItem[];
  excluded: ExcludedItem[];
  exclusionSummary: Record<string, number>;
  totalAmount: number;
  budget: BudgetSummary;
}

interface PaymentBatch {
  id: number;
  batch_number: string;
  payment_month: string;
  fiscal_year: string;
  authority_code: string;
  status: string;
  line_count: number;
  total_amount: number;
  preparation_reason: string;
  Created_By_Name?: string;
  Approved_By_Name?: string;
  created_at: string;
  exclusion_summary: Record<string, number>;
}

interface PaymentLine {
  id: number;
  grant_id: number;
  parent_p_no_o_no: string;
  Parent_Name: string;
  Child_Name: string;
  CNIC_BForm_No: string;
  category: string;
  amount: number;
  status: string;
  bank_name: string;
  account_title: string;
  account_number: string;
  iban: string;
  latest_reference?: string;
  latest_reason?: string;
}

interface BatchDetail extends PaymentBatch { lines: PaymentLine[]; }

interface BudgetRow extends BudgetSummary {
  rowVersion?: number;
  created_at?: string;
}

const statusClass: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  approved: "bg-blue-100 text-blue-800",
  exported: "bg-indigo-100 text-indigo-800",
  partially_confirmed: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-800",
  paid: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  returned: "bg-orange-100 text-orange-800",
  pending: "bg-slate-100 text-slate-700",
};

const exclusionLabels: Record<string, string> = {
  partial_grant_period: "Grant does not cover the full month",
  child_not_approved: "Child is not approved",
  parent_not_approved: "Parent is not approved",
  banking_missing: "Banking details are missing",
  banking_not_verified: "Banking evidence is not verified",
  already_scheduled: "Payment already scheduled for this month",
  invalid_amount: "Grant amount is invalid",
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) throw new Error(await readApiError(response, "Request failed."));
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function defaultMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function PaymentWorkspace() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("payments.manage");
  const canApprove = hasPermission("payments.approve");
  const canExport = hasPermission("payments.export");
  const canConfirm = hasPermission("payments.confirm");
  const canReadBudgets = hasPermission("budgets.read");
  const canManageBudgets = hasPermission("budgets.manage");
  const [batches, setBatches] = useState<PaymentBatch[]>([]);
  const [authorities, setAuthorities] = useState<string[]>([]);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(defaultMonth());
  const [authority, setAuthority] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [prepareReason, setPrepareReason] = useState("");
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [action, setAction] = useState<{ kind: "approve" | "cancel" | "budget-confirm"; id: number } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [confirmLine, setConfirmLine] = useState<PaymentLine | null>(null);
  const [confirmation, setConfirmation] = useState({ outcome: "paid", reference: "", reason: "" });
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState({ fiscalYear: "", authority: "", approvedAmount: "", reason: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [batchRows, authorityRows, budgetRows] = await Promise.all([
        request<PaymentBatch[]>("/payment-batches"),
        request<string[]>("/payment-batches/authorities"),
        canReadBudgets ? request<BudgetRow[]>("/fiscal-budgets") : Promise.resolve([]),
      ]);
      setBatches(batchRows);
      setAuthorities(authorityRows);
      setBudgets(budgetRows);
      setAuthority(current => current || authorityRows[0] || "");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to load payments."); }
    finally { setLoading(false); }
  }, [canReadBudgets]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return batches.filter(batch => !needle || [batch.batch_number, batch.authority_code, batch.status, batch.Created_By_Name]
      .some(value => String(value || "").toLowerCase().includes(needle)));
  }, [batches, search]);

  const runPreview = async () => {
    if (!month || !authority) return;
    setBusy(true);
    try {
      setPreview(await request<Preview>(`/payment-batches/preview?month=${encodeURIComponent(month)}&authority=${encodeURIComponent(authority)}`));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to preview payments."); }
    finally { setBusy(false); }
  };

  const createBatch = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const created = await request<BatchDetail>("/payment-batches", {
        method: "POST",
        body: JSON.stringify({ month: preview.paymentMonth, authority: preview.authorityCode, reason: prepareReason }),
      });
      toast.success(`Draft ${created.batch_number} created with ${created.line_count} payment lines.`);
      setPreview(null); setPrepareReason(""); setDetail(created);
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to create payment batch."); }
    finally { setBusy(false); }
  };

  const openBatch = async (id: number) => {
    try { setDetail(await request<BatchDetail>(`/payment-batches/${id}`)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to load batch."); }
  };

  const submitAction = async () => {
    if (!action) return;
    setBusy(true);
    try {
      const path = action.kind === "approve" ? `/payment-batches/${action.id}/approve`
        : action.kind === "cancel" ? `/payment-batches/${action.id}/cancel`
          : `/fiscal-budgets/${action.id}/confirm`;
      await request(path, { method: "POST", body: JSON.stringify({ reason: actionReason }) });
      toast.success(action.kind === "approve" ? "Payment batch approved." : action.kind === "cancel" ? "Payment batch cancelled." : "Fiscal budget confirmed.");
      setAction(null); setActionReason(""); setDetail(null);
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to complete action."); }
    finally { setBusy(false); }
  };

  const exportBatch = async (batch: PaymentBatch) => {
    setBusy(true);
    try {
      // Export marks the batch as exported, so it is intentionally a CSRF-
      // protected POST rather than a state-changing GET.
      const response = await apiFetch(`/payment-batches/${batch.id}/export.csv`, { method: "POST" });
      if (!response.ok) throw new Error(await readApiError(response, "Unable to export payment batch."));
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${batch.batch_number}.csv`; anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Sensitive payment instructions exported and audited.");
      await load();
      if (detail?.id === batch.id) await openBatch(batch.id);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to export payment batch."); }
    finally { setBusy(false); }
  };

  const submitConfirmation = async () => {
    if (!confirmLine) return;
    setBusy(true);
    try {
      await request(`/payment-lines/${confirmLine.id}/confirm`, { method: "POST", body: JSON.stringify(confirmation) });
      toast.success("Payment outcome recorded with an immutable confirmation attempt.");
      const batchId = detail?.id;
      setConfirmLine(null); setConfirmation({ outcome: "paid", reference: "", reason: "" });
      if (batchId) await openBatch(batchId);
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to record payment outcome."); }
    finally { setBusy(false); }
  };

  const saveBudget = async () => {
    setBusy(true);
    try {
      await request("/fiscal-budgets", { method: "POST", body: JSON.stringify({ ...budgetDraft, approvedAmount: Number(budgetDraft.approvedAmount) }) });
      toast.success("Draft fiscal budget saved.");
      setBudgetOpen(false); setBudgetDraft({ fiscalYear: "", authority: "", approvedAmount: "", reason: "" });
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save budget."); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">Payments</h1><p className="text-muted-foreground">Prepare monthly grant batches, enforce verified banking and budgets, export instructions, and record outcomes.</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
    <Tabs defaultValue="batches"><TabsList><TabsTrigger value="batches">Payment batches</TabsTrigger>{canReadBudgets && <TabsTrigger value="budgets">Fiscal budgets</TabsTrigger>}</TabsList>
      <TabsContent value="batches" className="space-y-5">
        {canManage && <Card><CardHeader><CardTitle>Prepare a monthly batch</CardTitle><CardDescription>Preview is read-only. It explains every exclusion before any payment line is created.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-[180px_1fr_auto]"><Input type="month" value={month} onChange={event => setMonth(event.target.value)} /><Select value={authority} onValueChange={setAuthority}><SelectTrigger><SelectValue placeholder="Choose authority" /></SelectTrigger><SelectContent>{authorities.map(value => <SelectItem key={value} value={value}>{value === "__NONE__" ? "No authority" : value}</SelectItem>)}</SelectContent></Select><Button disabled={busy || !month || !authority} onClick={() => void runPreview()}><Search className="mr-2 h-4 w-4" />Preview</Button></CardContent></Card>}
        <Card><CardContent className="pt-6"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search batch, authority, status, or preparer" value={search} onChange={event => setSearch(event.target.value)} /></div></CardContent></Card>
        <Card><CardHeader><CardTitle>Batch register</CardTitle><CardDescription>{filtered.length} authority-scoped batch(es).</CardDescription></CardHeader><CardContent><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Batch</TableHead><TableHead>Period / authority</TableHead><TableHead>Lines</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead>Prepared by</TableHead><TableHead /></TableRow></TableHeader><TableBody>{filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">{loading ? "Loading batches..." : "No payment batches yet."}</TableCell></TableRow> : filtered.map(batch => <TableRow key={batch.id}><TableCell className="font-mono text-xs">{batch.batch_number}</TableCell><TableCell><div>{String(batch.payment_month).slice(0, 7)}</div><div className="text-xs text-muted-foreground">{batch.authority_code === "__NONE__" ? "No authority" : batch.authority_code}</div></TableCell><TableCell>{batch.line_count}</TableCell><TableCell>{formatCurrency(Number(batch.total_amount))}</TableCell><TableCell><Badge className={statusClass[batch.status] || ""}>{batch.status.replaceAll("_", " ")}</Badge></TableCell><TableCell>{batch.Created_By_Name || "—"}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => void openBatch(batch.id)}><Eye className="mr-2 h-4 w-4" />Open</Button></TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
      </TabsContent>
      {canReadBudgets && <TabsContent value="budgets" className="space-y-5"><div className="flex justify-end">{canManageBudgets && <Button onClick={() => setBudgetOpen(true)}><Plus className="mr-2 h-4 w-4" />New budget</Button>}</div><Card><CardHeader><CardTitle>Monthly Grant budgets</CardTitle><CardDescription>Only confirmed budgets can authorize payment batches.</CardDescription></CardHeader><CardContent><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Fiscal year</TableHead><TableHead>Authority</TableHead><TableHead>Approved</TableHead><TableHead>Committed</TableHead><TableHead>Available</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{budgets.length === 0 ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No budgets configured.</TableCell></TableRow> : budgets.map(budget => <TableRow key={budget.id}><TableCell>{budget.fiscalYear}</TableCell><TableCell>{budget.authorityCode === "__NONE__" ? "No authority" : budget.authorityCode}</TableCell><TableCell>{formatCurrency(Number(budget.approvedAmount))}</TableCell><TableCell>{formatCurrency(Number(budget.committedAmount))}</TableCell><TableCell>{formatCurrency(Number(budget.availableAmount))}</TableCell><TableCell><Badge className={statusClass[budget.status] || ""}>{budget.status}</Badge></TableCell><TableCell className="text-right">{canManageBudgets && budget.status === "draft" && budget.id && <Button size="sm" onClick={() => { setActionReason(""); setAction({ kind: "budget-confirm", id: budget.id! }); }}><ShieldCheck className="mr-2 h-4 w-4" />Confirm</Button>}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card></TabsContent>}
    </Tabs>

    <Dialog open={Boolean(preview)} onOpenChange={open => { if (!open) setPreview(null); }}><DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto"><DialogHeader><DialogTitle>Payment preview · {preview?.paymentMonth}</DialogTitle><DialogDescription>{preview?.authorityCode === "__NONE__" ? "No authority" : preview?.authorityCode} · fiscal year {preview?.fiscalYear}</DialogDescription></DialogHeader>{preview && <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Eligible", preview.eligible.length],["Excluded", preview.excluded.length],["Batch total", formatCurrency(preview.totalAmount)],["Budget status", preview.budget.status.replaceAll("_", " ")]].map(([label,value]) => <div key={String(label)} className="rounded-lg border p-3"><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="mt-1 text-lg font-bold">{value}</div></div>)}</div>{preview.budget.status !== "confirmed" && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">The draft can be prepared, but approval is blocked until a Director confirms a {preview.fiscalYear} budget for this authority.</div>}<div className="grid gap-5 lg:grid-cols-2"><div><h3 className="mb-2 font-semibold">Eligible payments</h3><div className="max-h-72 overflow-auto rounded-lg border">{preview.eligible.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No eligible payment lines.</p> : preview.eligible.map(item => <div key={item.grantId} className="border-b p-3 text-sm last:border-0"><div className="flex justify-between gap-3"><strong>{item.childName}</strong><span>{formatCurrency(item.amount)}</span></div><div className="text-xs text-muted-foreground">{item.parentName} · {item.parentPNo} · Category {item.category}</div><div className="text-xs text-muted-foreground">{item.bankName} · {item.accountNumber}</div></div>)}</div></div><div><h3 className="mb-2 font-semibold">Excluded grants</h3><div className="max-h-72 overflow-auto rounded-lg border">{preview.excluded.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No exclusions.</p> : preview.excluded.map(item => <div key={`${item.grantId}-${item.code}`} className="border-b p-3 text-sm last:border-0"><strong>{item.childName}</strong><div className="text-xs text-rose-700">{exclusionLabels[item.code] || item.code}</div></div>)}</div></div></div>{canManage && <div className="space-y-2"><Label>Preparation reason</Label><Textarea value={prepareReason} onChange={event => setPrepareReason(event.target.value)} placeholder="Why this payment batch is being prepared" /></div>}</div>}<DialogFooter><Button variant="outline" onClick={() => setPreview(null)}>Close</Button>{canManage && <Button disabled={busy || !preview?.eligible.length || prepareReason.trim().length < 5} onClick={() => void createBatch()}><Plus className="mr-2 h-4 w-4" />Create draft batch</Button>}</DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(detail)} onOpenChange={open => { if (!open) setDetail(null); }}><DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-2"><Banknote className="h-5 w-5" />{detail?.batch_number}</DialogTitle><DialogDescription>{detail?.authority_code} · {detail && formatCurrency(Number(detail.total_amount))} · {detail?.line_count} lines</DialogDescription></DialogHeader>{detail && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-4">{[["Status", detail.status.replaceAll("_", " ")],["Payment month", String(detail.payment_month).slice(0,7)],["Prepared by", detail.Created_By_Name || "—"],["Approved by", detail.Approved_By_Name || "—"]].map(([label,value]) => <div key={label} className="rounded-lg border p-3"><div className="text-xs uppercase text-muted-foreground">{label}</div><div className="mt-1 font-medium capitalize">{value}</div></div>)}</div><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Beneficiary</TableHead><TableHead>Grant</TableHead><TableHead>Banking</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{detail.lines.map(line => <TableRow key={line.id}><TableCell><div className="font-medium">{line.Child_Name}</div><div className="text-xs text-muted-foreground">{line.Parent_Name} · {line.parent_p_no_o_no}</div></TableCell><TableCell>#{line.grant_id} · Category {line.category}</TableCell><TableCell><div>{line.bank_name}</div><div className="text-xs text-muted-foreground">{line.account_number}</div></TableCell><TableCell>{formatCurrency(Number(line.amount))}</TableCell><TableCell><Badge className={statusClass[line.status] || ""}>{line.status}</Badge>{line.latest_reference && <div className="mt-1 text-xs">Ref: {line.latest_reference}</div>}{line.latest_reason && <div className="mt-1 text-xs text-rose-700">{line.latest_reason}</div>}</TableCell><TableCell className="text-right">{canConfirm && ["exported","partially_confirmed"].includes(detail.status) && <Button size="sm" variant="outline" onClick={() => setConfirmLine(line)}><CheckCircle2 className="mr-2 h-4 w-4" />Outcome</Button>}</TableCell></TableRow>)}</TableBody></Table></div><p className="text-sm text-muted-foreground">Prepared {formatDate(detail.created_at)} · {detail.preparation_reason}</p></div>}<DialogFooter className="flex-wrap">{canManage && detail && ["draft","approved"].includes(detail.status) && <Button variant="destructive" onClick={() => { setActionReason(""); setAction({ kind: "cancel", id: detail.id }); }}><XCircle className="mr-2 h-4 w-4" />Cancel batch</Button>}{canApprove && detail?.status === "draft" && <Button onClick={() => { setActionReason(""); setAction({ kind: "approve", id: detail.id }); }}><ShieldCheck className="mr-2 h-4 w-4" />Approve</Button>}{canExport && detail && ["approved","exported","partially_confirmed","confirmed"].includes(detail.status) && <Button variant="outline" disabled={busy} onClick={() => void exportBatch(detail)}><Download className="mr-2 h-4 w-4" />Export CSV</Button>}<Button variant="outline" onClick={() => setDetail(null)}>Close</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(action)} onOpenChange={open => { if (!open) setAction(null); }}><DialogContent><DialogHeader><DialogTitle>{action?.kind === "approve" ? "Approve payment batch" : action?.kind === "cancel" ? "Cancel payment batch" : "Confirm fiscal budget"}</DialogTitle><DialogDescription>{action?.kind === "approve" ? "The preparer cannot approve their own batch. Approval reserves the confirmed budget." : action?.kind === "cancel" ? "Only unexported batches can be cancelled; their duplicate guards are released." : "A confirmed budget cannot be overwritten by ordinary editing."}</DialogDescription></DialogHeader><div className="space-y-2"><Label>Reason</Label><Textarea value={actionReason} onChange={event => setActionReason(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setAction(null)}>Back</Button><Button disabled={busy || actionReason.trim().length < 5} onClick={() => void submitAction()}>Confirm action</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(confirmLine)} onOpenChange={open => { if (!open) setConfirmLine(null); }}><DialogContent><DialogHeader><DialogTitle>Record payment outcome</DialogTitle><DialogDescription>{confirmLine?.Child_Name} · {confirmLine && formatCurrency(Number(confirmLine.amount))}. Every attempt remains in history.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>Outcome</Label><Select value={confirmation.outcome} onValueChange={outcome => setConfirmation({ ...confirmation, outcome })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="paid">Paid</SelectItem><SelectItem value="failed">Failed</SelectItem><SelectItem value="returned">Returned</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Bank reference {confirmation.outcome === "paid" && "(required)"}</Label><Input value={confirmation.reference} onChange={event => setConfirmation({ ...confirmation, reference: event.target.value })} /></div><div className="space-y-2"><Label>Reason {confirmation.outcome !== "paid" && "(required)"}</Label><Textarea value={confirmation.reason} onChange={event => setConfirmation({ ...confirmation, reason: event.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => setConfirmLine(null)}>Cancel</Button><Button disabled={busy || (confirmation.outcome === "paid" ? confirmation.reference.trim().length < 3 : confirmation.reason.trim().length < 5)} onClick={() => void submitConfirmation()}>Save outcome</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}><DialogContent><DialogHeader><DialogTitle>New fiscal budget</DialogTitle><DialogDescription>Create a draft authority budget. Confirmation is a separate audited action.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>Fiscal year</Label><Input placeholder="2026-2027" value={budgetDraft.fiscalYear} onChange={event => setBudgetDraft({ ...budgetDraft, fiscalYear: event.target.value })} /></div><div className="space-y-2"><Label>Authority</Label><Select value={budgetDraft.authority} onValueChange={value => setBudgetDraft({ ...budgetDraft, authority: value })}><SelectTrigger><SelectValue placeholder="Choose authority" /></SelectTrigger><SelectContent>{authorities.map(value => <SelectItem key={value} value={value}>{value === "__NONE__" ? "No authority" : value}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Approved amount (PKR)</Label><Input type="number" min="1" step="0.01" value={budgetDraft.approvedAmount} onChange={event => setBudgetDraft({ ...budgetDraft, approvedAmount: event.target.value })} /></div><div className="space-y-2"><Label>Reason</Label><Textarea value={budgetDraft.reason} onChange={event => setBudgetDraft({ ...budgetDraft, reason: event.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => setBudgetOpen(false)}>Cancel</Button><Button disabled={busy || !budgetDraft.authority || !/^\d{4}-\d{4}$/.test(budgetDraft.fiscalYear) || Number(budgetDraft.approvedAmount) <= 0 || budgetDraft.reason.trim().length < 5} onClick={() => void saveBudget()}>Save draft</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
