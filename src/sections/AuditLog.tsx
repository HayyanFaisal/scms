import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  History,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, readApiError } from "@/services/http";

interface AuditEvent {
  id: number;
  actor_user_id: number | null;
  actor_username?: string | null;
  actor_display_name?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  outcome: string;
  reason?: string | null;
  ip_address?: string | null;
  correlation_id: string;
  details?: Record<string, unknown> | null;
  occurred_at: string;
}

interface AuditResponse {
  items: AuditEvent[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  facets: {
    actions: string[];
    entityTypes: string[];
    outcomes: string[];
  };
}

const emptyResponse: AuditResponse = {
  items: [],
  pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
  facets: { actions: [], entityTypes: [], outcomes: [] },
};

function outcomeVariant(outcome: string) {
  if (outcome === "success") return "secondary" as const;
  if (outcome === "failure" || outcome === "denied")
    return "destructive" as const;
  return "outline" as const;
}

export function AuditLog() {
  const { hasPermission } = useAuth();
  const canExport = hasPermission("audit.export");
  const [response, setResponse] = useState<AuditResponse>(emptyResponse);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  const queryString = useCallback(
    (requestedPage = page) => {
      const params = new URLSearchParams({
        page: String(requestedPage),
        pageSize: "50",
      });
      if (search.trim()) params.set("search", search.trim());
      if (action !== "all") params.set("action", action);
      if (entityType !== "all") params.set("entityType", entityType);
      if (outcome !== "all") params.set("outcome", outcome);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return params.toString();
    },
    [action, entityType, from, outcome, page, search, to],
  );

  const loadEvents = useCallback(
    async (requestedPage = page) => {
      setBusy("load");
      setError("");
      try {
        const result = await apiFetch(
          `/audit-events?${queryString(requestedPage)}`,
        );
        if (!result.ok)
          throw new Error(
            await readApiError(result, "Unable to load the audit log."),
          );
        const payload = (await result.json()) as AuditResponse;
        setResponse(payload);
        setPage(payload.pagination.page);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the audit log.",
        );
      } finally {
        setBusy("");
      }
    },
    [page, queryString],
  );

  useEffect(() => {
    void loadEvents(1);
    // Filters are applied explicitly by the button, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportAudit = async () => {
    setBusy("export");
    setError("");
    try {
      const params = new URLSearchParams(queryString(1));
      params.delete("page");
      params.delete("pageSize");
      const result = await apiFetch(`/audit-events/export.csv?${params}`);
      if (!result.ok)
        throw new Error(
          await readApiError(result, "Unable to export the audit log."),
        );
      const url = URL.createObjectURL(await result.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `scms-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Unable to export the audit log.",
      );
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Audit Log</h1>
          </div>
          <p className="text-muted-foreground">
            Read-only, server-generated history of authentication,
            configuration, imports, reviews, and operational changes.
          </p>
        </div>
        <div className="flex gap-2">
          {canExport && (
            <Button
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() => void exportAudit()}
            >
              {busy === "export" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export filtered CSV
            </Button>
          )}
          <Button
            variant="outline"
            disabled={Boolean(busy)}
            onClick={() => void loadEvents(page)}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Search actor, action, entity, reason, ID, or correlation ID.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-4">
            <div className="space-y-2 lg:col-span-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void loadEvents(1);
                  }}
                  placeholder="Actor, action, entity, reason, or correlation ID"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {response.facets.actions.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Entity</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All entities</SelectItem>
                  {response.facets.entityTypes.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Outcome</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All outcomes</SelectItem>
                  {response.facets.outcomes.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>From</Label>
              <Input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            <Button
              className="self-end"
              disabled={Boolean(busy)}
              onClick={() => void loadEvents(1)}
            >
              {busy === "load" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Apply filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Immutable events</CardTitle>
          <CardDescription>
            {response.pagination.total.toLocaleString()} matching event(s). This
            page cannot alter or delete audit records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="w-20">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {response.items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-10 text-center text-muted-foreground"
                    >
                      {busy === "load"
                        ? "Loading audit events…"
                        : "No audit events match these filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  response.items.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(event.occurred_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {event.actor_display_name ||
                            event.actor_username ||
                            "System"}
                        </div>
                        {event.actor_username && event.actor_display_name && (
                          <div className="text-xs text-muted-foreground">
                            {event.actor_username}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-xs">{event.action}</div>
                        <Badge
                          className="mt-1"
                          variant={outcomeVariant(event.outcome)}
                        >
                          {event.outcome}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>{event.entity_type || "—"}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {event.entity_id || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-72 text-sm">
                        {event.reason || "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setSelected(event)}
                        >
                          <Eye className="h-4 w-4" />
                          <span className="sr-only">View event details</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              Page {response.pagination.page} of{" "}
              {response.pagination.totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={Boolean(busy) || page <= 1}
                onClick={() => void loadEvents(page - 1)}
              >
                <ChevronLeft className="mr-2 h-4 w-4" /> Previous
              </Button>
              <Button
                variant="outline"
                disabled={
                  Boolean(busy) || page >= response.pagination.totalPages
                }
                onClick={() => void loadEvents(page + 1)}
              >
                Next <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-auto">
          <DialogHeader>
            <DialogTitle>Audit event #{selected?.id}</DialogTitle>
            <DialogDescription>
              Correlation ID: {selected?.correlation_id}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="font-medium">Action:</span> {selected.action}
                </div>
                <div>
                  <span className="font-medium">Outcome:</span>{" "}
                  {selected.outcome}
                </div>
                <div>
                  <span className="font-medium">Entity:</span>{" "}
                  {selected.entity_type || "—"} / {selected.entity_id || "—"}
                </div>
                <div>
                  <span className="font-medium">IP:</span>{" "}
                  {selected.ip_address || "—"}
                </div>
              </div>
              <div>
                <div className="font-medium">Reason</div>
                <div className="mt-1 rounded-lg border bg-muted/30 p-3">
                  {selected.reason || "No reason recorded."}
                </div>
              </div>
              <div>
                <div className="font-medium">Structured details</div>
                <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                  {selected.details
                    ? JSON.stringify(selected.details, null, 2)
                    : "No structured details."}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
