import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, readApiError } from "@/services/http";
import { useAuth } from "@/hooks/useAuth";

interface ImportField {
  code: string;
  label: string;
  group: "Parent" | "Child";
}
interface ImportCatalog {
  profiles: Array<{ code: string; label: string }>;
  fields: ImportField[];
  acceptedFormats: string[];
  limits: { maxFileSizeBytes: number; maxRows: number; maxColumns: number };
}
interface SourceSheet {
  name: string;
  rowCount: number;
  columnCount: number;
  preview: string[][];
}
interface ImportJob {
  id: number;
  original_file_name: string;
  file_format: string;
  status: string;
  import_profile?: string;
  selected_sheet?: string;
  header_row?: number;
  source_metadata: { sheets?: SourceSheet[] };
  mapping_json?: Record<string, string>;
  transforms_json?: Record<string, string[]>;
  total_rows: number;
  valid_rows: number;
  warning_rows: number;
  invalid_rows: number;
  conflict_rows: number;
  executed_rows: number;
  skipped_rows: number;
  progress_percent: number;
  created_at: string;
  created_by_name?: string;
  rollback_status?: string;
  rollback_summary?: { rolledBackRows: number; blockedRows: number } | null;
  source_deleted_at?: string | null;
  source_delete_reason?: string | null;
}
interface ImportRow {
  id: number;
  source_row_number: number;
  status: string;
  raw_data: Record<string, unknown>;
  mapped_data: Record<string, unknown>;
  issues: Array<{ code: string; field?: string; message: string }>;
  proposed_action?: string;
  rollback_status?: string;
  rollback_details?: { blockers?: string[] };
}
interface ImportConflict {
  id: number;
  import_row_id: number;
  conflict_type: string;
  field_code?: string;
  existing_value: unknown;
  incoming_value: unknown;
  status: string;
  resolution?: string;
}
interface JobDetail {
  job: ImportJob;
  rows: ImportRow[];
  logs: Array<{
    id: number;
    level: string;
    event_code: string;
    message: string;
    created_at: string;
  }>;
  conflicts: ImportConflict[];
}
interface MappingTemplate {
  id: number;
  name: string;
  description?: string;
  import_profile: string;
  mapping_json: Record<string, string>;
  transforms_json: Record<string, string[]>;
  is_active: boolean;
  row_version: number;
  created_by?: number;
}
interface HeadingAlias {
  id: number;
  field_code: string;
  alias: string;
  is_active: boolean;
}
interface ImportSettings {
  sourceRetentionDays: number;
  cleanupEnabled: boolean;
  updatedAt?: string | null;
}
interface DeleteTarget {
  kind: "template" | "alias";
  id: number;
  label: string;
  rowVersion?: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok)
    throw new Error(await readApiError(response, "Import request failed."));
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function statusBadge(status: string) {
  if (status === "completed" || status === "rolled_back") return "default";
  if (status === "validated") return "secondary";
  if (status.includes("issue") || status === "failed") return "destructive";
  return "outline";
}

export function ImportWorkspace() {
  const { hasPermission } = useAuth();
  const canReadImportSettings = hasPermission("settings.read");
  const canManageImportSettings = hasPermission("settings.manage");
  const fileInput = useRef<HTMLInputElement>(null);
  const [catalog, setCatalog] = useState<ImportCatalog | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [profile, setProfile] = useState("mixed");
  const [sheetName, setSheetName] = useState("");
  const [headerRow, setHeaderRow] = useState("1");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [transforms, setTransforms] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [manualValues, setManualValues] = useState<Record<number, string>>({});
  const [templates, setTemplates] = useState<MappingTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [headingAliases, setHeadingAliases] = useState<HeadingAlias[]>([]);
  const [aliasFieldCode, setAliasFieldCode] = useState("");
  const [aliasText, setAliasText] = useState("");
  const [configurationReason, setConfigurationReason] = useState("");
  const [importSettings, setImportSettings] = useState<ImportSettings | null>(
    null,
  );
  const [retentionDays, setRetentionDays] = useState("90");
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackReason, setRollbackReason] = useState("");
  const [rollbackConfirmation, setRollbackConfirmation] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const loadJobs = useCallback(async () => {
    const rows = await request<ImportJob[]>("/imports/jobs");
    setJobs(rows);
    return rows;
  }, []);

  const loadTemplates = useCallback(async () => {
    const rows = await request<MappingTemplate[]>(
      "/imports/mapping-templates?includeInactive=1",
    );
    setTemplates(rows);
    return rows;
  }, []);

  const loadImportConfiguration = useCallback(async () => {
    if (!canReadImportSettings) return;
    const [settings, aliases] = await Promise.all([
      request<ImportSettings>("/imports/settings"),
      request<HeadingAlias[]>("/imports/heading-aliases"),
    ]);
    setImportSettings(settings);
    setRetentionDays(String(settings.sourceRetentionDays));
    setHeadingAliases(aliases);
  }, [canReadImportSettings]);

  const openJob = useCallback(async (jobId: number) => {
    setBusy("detail");
    setError("");
    try {
      const result = await request<JobDetail>(`/imports/jobs/${jobId}`);
      setDetail(result);
      setProfile(result.job.import_profile || "mixed");
      setSheetName(
        result.job.selected_sheet ||
          result.job.source_metadata.sheets?.[0]?.name ||
          "",
      );
      setHeaderRow(String(result.job.header_row || 1));
      const existingHeaders = Object.keys(result.rows[0]?.raw_data || {});
      setHeaders(existingHeaders);
      setMapping(result.job.mapping_json || {});
      setTransforms(result.job.transforms_json || {});
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load import job.",
      );
    } finally {
      setBusy("");
    }
  }, []);

  useEffect(() => {
    Promise.all([
      request<ImportCatalog>("/imports/catalog"),
      loadJobs(),
      loadTemplates(),
    ])
      .then(([loadedCatalog, , loadedTemplates]) => {
        setCatalog(loadedCatalog);
        setTemplates(loadedTemplates);
      })
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load the import workspace.",
        ),
      );
  }, [loadJobs, loadTemplates]);

  useEffect(() => {
    void loadImportConfiguration().catch((loadError) =>
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load import settings.",
      ),
    );
  }, [loadImportConfiguration]);

  useEffect(() => {
    if (!detail || !["executing", "rolling_back"].includes(detail.job.status))
      return undefined;
    const interval = setInterval(() => {
      void openJob(detail.job.id);
      void loadJobs();
    }, 2000);
    return () => clearInterval(interval);
  }, [detail, loadJobs, openJob]);

  const selectedSheet = useMemo(
    () =>
      detail?.job.source_metadata.sheets?.find(
        (sheet) => sheet.name === sheetName,
      ),
    [detail, sheetName],
  );
  const visibleFields = useMemo(
    () =>
      (catalog?.fields || []).filter(
        (field) => profile !== "parent" || field.group === "Parent",
      ),
    [catalog, profile],
  );
  const currentMappingRows = useMemo(
    () =>
      Object.entries(mapping)
        .map(([fieldCode, sourceHeading]) => ({
          fieldCode,
          sourceHeading,
          label:
            catalog?.fields.find((field) => field.code === fieldCode)?.label ||
            fieldCode,
          transforms: transforms[fieldCode] || [],
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [catalog, mapping, transforms],
  );

  const upload = async () => {
    if (!uploadFile) return setError("Choose an .xlsx or .csv file first.");
    setBusy("upload");
    setError("");
    setNotice("");
    try {
      const body = new FormData();
      body.append("file", uploadFile);
      const job = await request<ImportJob>("/imports/jobs", {
        method: "POST",
        body,
      });
      setUploadFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await loadJobs();
      await openJob(job.id);
      setNotice(
        "The protected source file was uploaded. Choose the sheet and header row to stage it.",
      );
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Upload failed.",
      );
    } finally {
      setBusy("");
    }
  };

  const stage = async () => {
    if (!detail || !sheetName) return;
    setBusy("stage");
    setError("");
    setNotice("");
    try {
      const result = await request<{
        job: ImportJob;
        headers: string[];
        suggestedMapping: Record<string, string>;
      }>(`/imports/jobs/${detail.job.id}/stage`, {
        method: "POST",
        body: JSON.stringify({
          profile,
          sheetName,
          headerRow: Number(headerRow),
        }),
      });
      setHeaders(result.headers);
      setMapping(result.suggestedMapping);
      setTransforms({});
      await loadJobs();
      await openJob(detail.job.id);
      setHeaders(result.headers);
      setMapping(result.suggestedMapping);
      setNotice(
        `${result.job.total_rows.toLocaleString()} rows are staged. Review the suggested column mapping before the dry run.`,
      );
    } catch (stageError) {
      setError(
        stageError instanceof Error ? stageError.message : "Staging failed.",
      );
    } finally {
      setBusy("");
    }
  };

  const validate = async () => {
    if (!detail) return;
    setBusy("validate");
    setError("");
    setNotice("");
    try {
      const result = await request<{ counts: Record<string, number> }>(
        `/imports/jobs/${detail.job.id}/validate`,
        {
          method: "POST",
          body: JSON.stringify({ mapping, transforms }),
        },
      );
      await loadJobs();
      await openJob(detail.job.id);
      setNotice(
        `Dry run complete: ${result.counts.valid || 0} valid, ${result.counts.warning || 0} warnings, ${result.counts.conflict || 0} conflicts, and ${result.counts.invalid || 0} invalid rows. No operational records were changed.`,
      );
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Validation failed.",
      );
    } finally {
      setBusy("");
    }
  };

  const setTransform = (fieldCode: string, value: string) => {
    const defaults =
      fieldCode.includes("cnic") ||
      fieldCode.includes("Bform") ||
      fieldCode === "parent.pNoONo"
        ? ["trim", "normalize_identifier"]
        : ["trim"];
    setTransforms((current) => ({
      ...current,
      [fieldCode]: value === "automatic" ? defaults : ["trim", value],
    }));
  };

  const transformSelection = (fieldCode: string) => {
    const configured = transforms[fieldCode] || [];
    return (
      ["uppercase", "lowercase", "digits_only"].find((value) =>
        configured.includes(value),
      ) || "automatic"
    );
  };

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => String(item.id) === templateId);
    if (!template) {
      setTemplateName("");
      setTemplateDescription("");
      return;
    }
    setTemplateName(template.name);
    setTemplateDescription(template.description || "");
    if (!template.is_active) {
      setError("");
      setNotice(
        `${template.name} is archived. Reactivate it before applying or updating its mapping.`,
      );
      return;
    }
    if (template.import_profile !== profile) {
      setError(
        `This template is for the ${template.import_profile} profile. Choose that profile or another template.`,
      );
      return;
    }
    const applicableMapping = Object.fromEntries(
      Object.entries(template.mapping_json).filter(([, header]) =>
        headers.includes(header),
      ),
    );
    setMapping(applicableMapping);
    setTransforms(template.transforms_json || {});
    setError("");
    setNotice(
      `${template.name} applied. ${Object.keys(applicableMapping).length} mapped columns matched this file.`,
    );
  };

  const saveTemplate = async () => {
    if (!templateName.trim())
      return setError("Enter a descriptive mapping template name.");
    setBusy("template");
    setError("");
    setNotice("");
    try {
      await request("/imports/mapping-templates", {
        method: "POST",
        body: JSON.stringify({
          name: templateName.trim(),
          description: templateDescription.trim(),
          profile,
          headers,
          mapping,
          transforms,
        }),
      });
      await loadTemplates();
      setTemplateName("");
      setTemplateDescription("");
      setNotice(
        "Mapping template saved. It can be reused for later spreadsheets with matching headings.",
      );
    } catch (templateError) {
      setError(
        templateError instanceof Error
          ? templateError.message
          : "Unable to save the mapping template.",
      );
    } finally {
      setBusy("");
    }
  };

  const updateTemplate = async () => {
    const template = templates.find(
      (item) => String(item.id) === selectedTemplateId,
    );
    if (!template || !template.is_active)
      return setError("Choose an active mapping template to update.");
    if (!templateName.trim())
      return setError("Enter a descriptive mapping template name.");
    setBusy("template-update");
    setError("");
    setNotice("");
    try {
      const updated = await request<MappingTemplate>(
        `/imports/mapping-templates/${template.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            rowVersion: template.row_version,
            name: templateName.trim(),
            description: templateDescription.trim(),
            profile,
            headers,
            mapping,
            transforms,
          }),
        },
      );
      await loadTemplates();
      setSelectedTemplateId(String(updated.id));
      setNotice("Mapping template updated with the current reviewed mapping.");
    } catch (templateError) {
      setError(
        templateError instanceof Error
          ? templateError.message
          : "Unable to update the mapping template.",
      );
    } finally {
      setBusy("");
    }
  };

  const setTemplateActive = async (isActive: boolean) => {
    const template = templates.find(
      (item) => String(item.id) === selectedTemplateId,
    );
    if (!template) return setError("Choose a mapping template first.");
    setBusy("template-state");
    setError("");
    setNotice("");
    try {
      const updated = await request<MappingTemplate>(
        `/imports/mapping-templates/${template.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            rowVersion: template.row_version,
            isActive,
          }),
        },
      );
      await loadTemplates();
      setSelectedTemplateId(String(updated.id));
      setNotice(
        isActive
          ? "Mapping template reactivated and available for reuse."
          : "Mapping template archived. Existing import history is unchanged.",
      );
    } catch (templateError) {
      setError(
        templateError instanceof Error
          ? templateError.message
          : "Unable to change the mapping template state.",
      );
    } finally {
      setBusy("");
    }
  };

  const createHeadingAlias = async () => {
    if (!aliasFieldCode || !aliasText.trim())
      return setError("Choose a destination field and enter a source heading.");
    if (configurationReason.trim().length < 5)
      return setError("Enter a reason of at least 5 characters.");
    setBusy("alias-create");
    setError("");
    setNotice("");
    try {
      await request("/imports/heading-aliases", {
        method: "POST",
        body: JSON.stringify({
          fieldCode: aliasFieldCode,
          alias: aliasText.trim(),
          reason: configurationReason.trim(),
        }),
      });
      await loadImportConfiguration();
      setAliasText("");
      setNotice(
        "Heading alias added. New staging runs will suggest this destination automatically.",
      );
    } catch (aliasError) {
      setError(
        aliasError instanceof Error
          ? aliasError.message
          : "Unable to add the heading alias.",
      );
    } finally {
      setBusy("");
    }
  };

  const setHeadingAliasActive = async (
    alias: HeadingAlias,
    isActive: boolean,
  ) => {
    if (configurationReason.trim().length < 5)
      return setError("Enter a reason of at least 5 characters.");
    setBusy(`alias-${alias.id}`);
    setError("");
    setNotice("");
    try {
      await request(`/imports/heading-aliases/${alias.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          isActive,
          reason: configurationReason.trim(),
        }),
      });
      await loadImportConfiguration();
      setNotice(
        isActive
          ? "Heading alias reactivated."
          : "Heading alias disabled. Existing jobs are unchanged.",
      );
    } catch (aliasError) {
      setError(
        aliasError instanceof Error
          ? aliasError.message
          : "Unable to change the heading alias.",
      );
    } finally {
      setBusy("");
    }
  };

  const deleteConfigurationItem = async () => {
    if (!deleteTarget) return;
    setBusy("configuration-delete");
    setError("");
    setNotice("");
    try {
      const path =
        deleteTarget.kind === "template"
          ? `/imports/mapping-templates/${deleteTarget.id}`
          : `/imports/heading-aliases/${deleteTarget.id}`;
      await request(path, {
        method: "DELETE",
        body: JSON.stringify({
          reason: deleteReason.trim(),
          confirmation: deleteConfirmation.trim(),
          rowVersion: deleteTarget.rowVersion,
        }),
      });
      if (deleteTarget.kind === "template") {
        await loadTemplates();
        setSelectedTemplateId("");
        setTemplateName("");
        setTemplateDescription("");
      } else {
        await loadImportConfiguration();
      }
      setDeleteTarget(null);
      setDeleteReason("");
      setDeleteConfirmation("");
      setNotice(
        `${deleteTarget.kind === "template" ? "Mapping template" : "Heading alias"} permanently deleted. Its audit record remains available.`,
      );
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete the selected configuration item.",
      );
    } finally {
      setBusy("");
    }
  };

  const saveImportSettings = async () => {
    const days = Number(retentionDays);
    if (!Number.isInteger(days) || days < 7 || days > 3650)
      return setError("Source retention must be between 7 and 3650 days.");
    if (!importSettings) return;
    if (configurationReason.trim().length < 5)
      return setError("Enter a reason of at least 5 characters.");
    setBusy("settings-save");
    setError("");
    setNotice("");
    try {
      const updated = await request<ImportSettings>("/imports/settings", {
        method: "PATCH",
        body: JSON.stringify({
          sourceRetentionDays: days,
          cleanupEnabled: importSettings.cleanupEnabled,
          reason: configurationReason.trim(),
        }),
      });
      setImportSettings(updated);
      setRetentionDays(String(updated.sourceRetentionDays));
      setNotice("Import retention settings saved and added to the audit log.");
    } catch (settingsError) {
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : "Unable to save import settings.",
      );
    } finally {
      setBusy("");
    }
  };

  const runSourceCleanup = async () => {
    if (configurationReason.trim().length < 5)
      return setError("Enter a reason of at least 5 characters.");
    setBusy("settings-cleanup");
    setError("");
    setNotice("");
    try {
      const result = await request<{ cleaned: number; missing: number }>(
        "/imports/maintenance/cleanup",
        {
          method: "POST",
          body: JSON.stringify({ reason: configurationReason.trim() }),
        },
      );
      await loadJobs();
      if (detail) await openJob(detail.job.id);
      setNotice(
        `Retention cleanup finished: ${result.cleaned} source file(s) removed and ${result.missing} already absent. Staged results and audit history were retained.`,
      );
    } catch (settingsError) {
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : "Unable to run source cleanup.",
      );
    } finally {
      setBusy("");
    }
  };

  const downloadResult = async (format: "csv" | "xlsx") => {
    if (!detail) return;
    setBusy(`download-${format}`);
    setError("");
    try {
      const response = await apiFetch(
        `/imports/jobs/${detail.job.id}/result.${format}`,
      );
      if (!response.ok)
        throw new Error(
          await readApiError(response, "Unable to download the result report."),
        );
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `import-${detail.job.id}-result.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Unable to download the result report.",
      );
    } finally {
      setBusy("");
    }
  };

  const rollback = async () => {
    if (!detail) return;
    setBusy("rollback");
    setError("");
    setNotice("");
    try {
      await request(`/imports/jobs/${detail.job.id}/rollback`, {
        method: "POST",
        body: JSON.stringify({
          reason: rollbackReason,
          confirmation: rollbackConfirmation,
        }),
      });
      setRollbackOpen(false);
      setRollbackReason("");
      setRollbackConfirmation("");
      await openJob(detail.job.id);
      await loadJobs();
      setNotice(
        "Guarded rollback started. Rows changed after the import will be protected and reported instead of overwritten.",
      );
    } catch (rollbackError) {
      setError(
        rollbackError instanceof Error
          ? rollbackError.message
          : "Unable to start rollback.",
      );
    } finally {
      setBusy("");
    }
  };

  const resolveConflict = async (
    conflict: ImportConflict,
    resolution: string,
  ) => {
    setBusy(`conflict-${conflict.id}`);
    setError("");
    setNotice("");
    try {
      await request(`/imports/conflicts/${conflict.id}/resolve`, {
        method: "POST",
        body: JSON.stringify({
          resolution,
          value: manualValues[conflict.id] || undefined,
        }),
      });
      if (detail) await openJob(detail.job.id);
      await loadJobs();
      setNotice(
        "Conflict decision saved. The staged source row remains fully auditable.",
      );
    } catch (resolveError) {
      setError(
        resolveError instanceof Error
          ? resolveError.message
          : "Unable to resolve conflict.",
      );
    } finally {
      setBusy("");
    }
  };

  const execute = async () => {
    if (!detail) return;
    setBusy("execute");
    setError("");
    setNotice("");
    try {
      await request(`/imports/jobs/${detail.job.id}/execute`, {
        method: "POST",
      });
      await openJob(detail.job.id);
      await loadJobs();
      setNotice(
        "Execution started. Progress and logs are stored on the server and this screen will refresh automatically.",
      );
    } catch (executeError) {
      setError(
        executeError instanceof Error
          ? executeError.message
          : "Unable to start import execution.",
      );
    } finally {
      setBusy("");
    }
  };

  const matchingTemplates = templates.filter(
    (template) => template.import_profile === profile,
  );
  const canRollback = Boolean(
    detail &&
    hasPermission("imports.rollback") &&
    [
      "completed",
      "completed_with_issues",
      "rollback_completed_with_issues",
    ].includes(detail.job.status),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Data Imports</h1>
          <p className="text-muted-foreground">
            Stage, map, and validate parent and child spreadsheets before any
            operational data is changed.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadJobs()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh jobs
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {canReadImportSettings && importSettings && (
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <Settings2 className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <CardTitle>Import configuration</CardTitle>
                <CardDescription>
                  Teach SCMS local spreadsheet headings and control how long
                  protected source files remain on this server.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-5 xl:grid-cols-2">
              <div className="space-y-4 rounded-xl border p-4">
                <div>
                  <h3 className="font-semibold">Recognized heading aliases</h3>
                  <p className="text-sm text-muted-foreground">
                    Example: map a local heading such as “Service No.” to Parent
                    PN/O. Aliases suggest a mapping; an operator still reviews
                    it before validation.
                  </p>
                </div>
                {canManageImportSettings && (
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <Select
                      value={aliasFieldCode || "__none"}
                      onValueChange={(value) =>
                        setAliasFieldCode(value === "__none" ? "" : value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Destination field" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">
                          Choose destination field
                        </SelectItem>
                        {catalog?.fields.map((field) => (
                          <SelectItem key={field.code} value={field.code}>
                            {field.group} · {field.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={aliasText}
                      onChange={(event) => setAliasText(event.target.value)}
                      placeholder="Source spreadsheet heading"
                      maxLength={160}
                    />
                    <Button
                      variant="outline"
                      disabled={
                        Boolean(busy) || !aliasFieldCode || !aliasText.trim()
                      }
                      onClick={() => void createHeadingAlias()}
                    >
                      {busy === "alias-create" && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Add alias
                    </Button>
                  </div>
                )}
                <div className="max-h-64 space-y-2 overflow-auto">
                  {headingAliases.length === 0 && (
                    <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                      No organization-specific aliases have been configured.
                    </p>
                  )}
                  {headingAliases.map((alias) => {
                    const field = catalog?.fields.find(
                      (item) => item.code === alias.field_code,
                    );
                    return (
                      <div
                        key={alias.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="min-w-0">
                          <div className="font-medium">{alias.alias}</div>
                          <div className="text-xs text-muted-foreground">
                            {field?.label || alias.field_code} ·{" "}
                            {alias.field_code}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={alias.is_active ? "secondary" : "outline"}
                          >
                            {alias.is_active ? "Active" : "Disabled"}
                          </Badge>
                          {canManageImportSettings && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={Boolean(busy)}
                                onClick={() =>
                                  void setHeadingAliasActive(
                                    alias,
                                    !alias.is_active,
                                  )
                                }
                              >
                                {busy === `alias-${alias.id}` && (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                )}
                                {alias.is_active ? "Disable" : "Enable"}
                              </Button>
                              {!alias.is_active && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={Boolean(busy)}
                                  onClick={() => {
                                    setDeleteReason("");
                                    setDeleteConfirmation("");
                                    setDeleteTarget({
                                      kind: "alias",
                                      id: alias.id,
                                      label: alias.alias,
                                    });
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4 rounded-xl border p-4">
                <div>
                  <h3 className="font-semibold">Protected source retention</h3>
                  <p className="text-sm text-muted-foreground">
                    Cleanup removes only the original uploaded file after a job
                    is final. Staged outcomes, downloadable row results, and the
                    audit trail remain available.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="space-y-2">
                    <Label>Retain source files for days</Label>
                    <Input
                      type="number"
                      min="7"
                      max="3650"
                      value={retentionDays}
                      disabled={!canManageImportSettings}
                      onChange={(event) => setRetentionDays(event.target.value)}
                    />
                  </div>
                  <div className="flex items-end gap-3 rounded-lg border px-4 py-3">
                    <Switch
                      checked={importSettings.cleanupEnabled}
                      disabled={!canManageImportSettings}
                      onCheckedChange={(checked) =>
                        setImportSettings((current) =>
                          current
                            ? { ...current, cleanupEnabled: checked }
                            : current,
                        )
                      }
                    />
                    <div>
                      <div className="text-sm font-medium">
                        Automatic cleanup
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Runs at server startup and daily
                      </div>
                    </div>
                  </div>
                </div>
                {canManageImportSettings && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={Boolean(busy)}
                      onClick={() => void saveImportSettings()}
                    >
                      {busy === "settings-save" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Save retention settings
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={Boolean(busy) || !importSettings.cleanupEnabled}
                      onClick={() => void runSourceCleanup()}
                    >
                      {busy === "settings-cleanup" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="mr-2 h-4 w-4" />
                      )}
                      Run eligible cleanup now
                    </Button>
                  </div>
                )}
              </div>
            </div>
            {canManageImportSettings && (
              <div className="space-y-2">
                <Label>Reason for configuration change</Label>
                <Input
                  value={configurationReason}
                  onChange={(event) =>
                    setConfigurationReason(event.target.value)
                  }
                  placeholder="Required for settings and heading-alias changes"
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground">
                  The reason is recorded in the audit log with your account.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>1. Upload a source file</CardTitle>
              <CardDescription>
                Accepted in this increment: modern Excel .xlsx and UTF-8 CSV.
                The original is checksumed and stored in protected import
                storage.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                <Input
                  ref={fileInput}
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(event) =>
                    setUploadFile(event.target.files?.[0] || null)
                  }
                />
                <Button
                  disabled={!uploadFile || Boolean(busy)}
                  onClick={() => void upload()}
                >
                  {busy === "upload" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Upload securely
                </Button>
              </div>
              {catalog && (
                <p className="text-xs text-muted-foreground">
                  Maximum{" "}
                  {(catalog.limits.maxFileSizeBytes / 1024 / 1024).toFixed(0)}{" "}
                  MB, {catalog.limits.maxRows.toLocaleString()} rows, and{" "}
                  {catalog.limits.maxColumns} columns per sheet. Legacy .xls
                  must be saved as .xlsx or .csv.
                </p>
              )}
            </CardContent>
          </Card>

          {detail && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>2. Choose the data area</CardTitle>
                  <CardDescription>
                    Select the worksheet and the row containing column headings.
                    The preview is from the uploaded source and does not change
                    production data.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Import profile</Label>
                      <Select value={profile} onValueChange={setProfile}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {catalog?.profiles.map((item) => (
                            <SelectItem key={item.code} value={item.code}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Worksheet</Label>
                      <Select value={sheetName} onValueChange={setSheetName}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose sheet" />
                        </SelectTrigger>
                        <SelectContent>
                          {detail.job.source_metadata.sheets?.map((sheet) => (
                            <SelectItem key={sheet.name} value={sheet.name}>
                              {sheet.name} ({sheet.rowCount} rows)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Header row</Label>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={headerRow}
                        onChange={(event) => setHeaderRow(event.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    disabled={
                      !sheetName ||
                      Boolean(busy) ||
                      ![
                        "uploaded",
                        "staged",
                        "validated",
                        "validated_with_issues",
                        "failed",
                      ].includes(detail.job.status)
                    }
                    onClick={() => void stage()}
                  >
                    {busy === "stage" && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Stage selected rows
                  </Button>
                  {selectedSheet && (
                    <div className="overflow-auto rounded-lg border">
                      <Table>
                        <TableBody>
                          {selectedSheet.preview
                            .slice(0, 8)
                            .map((row, index) => (
                              <TableRow
                                key={index}
                                className={
                                  index + 1 === Number(headerRow)
                                    ? "bg-primary/10 font-medium"
                                    : ""
                                }
                              >
                                <TableCell className="w-14 text-xs text-muted-foreground">
                                  {index + 1}
                                </TableCell>
                                {row.slice(0, 10).map((cell, column) => (
                                  <TableCell
                                    key={column}
                                    className="min-w-28 max-w-56 truncate text-xs"
                                  >
                                    {cell}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {headers.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Saved mapping templates</CardTitle>
                    <CardDescription>
                      Reuse a reviewed mapping for recurring spreadsheets. Only
                      headings present in this file are applied.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Existing template</Label>
                        <Select
                          value={selectedTemplateId || "__none"}
                          onValueChange={(value) =>
                            applyTemplate(value === "__none" ? "" : value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose template" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">
                              No saved template
                            </SelectItem>
                            {matchingTemplates.map((template) => (
                              <SelectItem
                                key={template.id}
                                value={String(template.id)}
                              >
                                {template.name}
                                {template.is_active ? "" : " (archived)"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Template name</Label>
                        <Input
                          value={templateName}
                          onChange={(event) =>
                            setTemplateName(event.target.value)
                          }
                          placeholder="Example: Monthly authority roster"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Purpose or source</Label>
                      <Input
                        value={templateDescription}
                        onChange={(event) =>
                          setTemplateDescription(event.target.value)
                        }
                        placeholder="Optional note explaining when this mapping should be used"
                        maxLength={500}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={Boolean(busy) || !templateName.trim()}
                        onClick={() => void saveTemplate()}
                      >
                        {busy === "template" ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Save as new
                      </Button>
                      {selectedTemplateId &&
                        templates.find(
                          (template) =>
                            String(template.id) === selectedTemplateId,
                        )?.is_active && (
                          <>
                            <Button
                              variant="outline"
                              disabled={Boolean(busy) || !templateName.trim()}
                              onClick={() => void updateTemplate()}
                            >
                              Update selected
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={Boolean(busy)}
                              onClick={() => void setTemplateActive(false)}
                            >
                              Archive selected
                            </Button>
                          </>
                        )}
                      {selectedTemplateId &&
                        templates.find(
                          (template) =>
                            String(template.id) === selectedTemplateId,
                        )?.is_active === false && (
                          <>
                            <Button
                              variant="outline"
                              disabled={Boolean(busy)}
                              onClick={() => void setTemplateActive(true)}
                            >
                              Reactivate selected
                            </Button>
                            <Button
                              variant="destructive"
                              disabled={Boolean(busy)}
                              onClick={() => {
                                const template = templates.find(
                                  (item) =>
                                    String(item.id) === selectedTemplateId,
                                );
                                if (!template) return;
                                setDeleteReason("");
                                setDeleteConfirmation("");
                                setDeleteTarget({
                                  kind: "template",
                                  id: template.id,
                                  label: template.name,
                                  rowVersion: template.row_version,
                                });
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete selected
                            </Button>
                          </>
                        )}
                    </div>
                    <div className="rounded-xl border">
                      <div className="border-b bg-muted/30 px-4 py-3">
                        <div className="font-medium">
                          Current working mapping
                        </div>
                        <div className="text-xs text-muted-foreground">
                          This is the exact field-to-column mapping that will be
                          validated and saved.
                        </div>
                      </div>
                      {currentMappingRows.length === 0 ? (
                        <p className="p-4 text-sm text-muted-foreground">
                          No columns are currently mapped.
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>SCMS field</TableHead>
                              <TableHead>Source heading</TableHead>
                              <TableHead>Transforms</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {currentMappingRows.map((row) => (
                              <TableRow key={row.fieldCode}>
                                <TableCell>
                                  <div className="font-medium">{row.label}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {row.fieldCode}
                                  </div>
                                </TableCell>
                                <TableCell>{row.sourceHeading}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {row.transforms.length
                                    ? row.transforms.join(" → ")
                                    : "Automatic defaults"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {headers.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>3. Map columns and transform values</CardTitle>
                    <CardDescription>
                      Every destination field explicitly names its source.
                      “Automatic” trims text and normalizes identity numbers
                      where required.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="overflow-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>SCMS field</TableHead>
                            <TableHead>Source column</TableHead>
                            <TableHead>Transform</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleFields.map((field) => (
                            <TableRow key={field.code}>
                              <TableCell>
                                <div className="font-medium">{field.label}</div>
                                <div className="text-xs text-muted-foreground">
                                  {field.group} · {field.code}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={mapping[field.code] || "__unmapped"}
                                  onValueChange={(value) =>
                                    setMapping((current) => {
                                      const next = { ...current };
                                      if (value === "__unmapped")
                                        delete next[field.code];
                                      else next[field.code] = value;
                                      return next;
                                    })
                                  }
                                >
                                  <SelectTrigger className="min-w-56">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__unmapped">
                                      Not mapped
                                    </SelectItem>
                                    {headers.map((header) => (
                                      <SelectItem key={header} value={header}>
                                        {header}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={transformSelection(field.code)}
                                  onValueChange={(value) =>
                                    setTransform(field.code, value)
                                  }
                                >
                                  <SelectTrigger className="min-w-40">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="automatic">
                                      Automatic
                                    </SelectItem>
                                    <SelectItem value="uppercase">
                                      Uppercase
                                    </SelectItem>
                                    <SelectItem value="lowercase">
                                      Lowercase
                                    </SelectItem>
                                    <SelectItem value="digits_only">
                                      Digits only
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-muted-foreground">
                        Dry run checks every staged row, active configured
                        choices, identity matches, field differences, and your
                        authority scope.
                      </p>
                      <Button
                        disabled={Boolean(busy)}
                        onClick={() => void validate()}
                      >
                        {busy === "validate" ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        Run dry validation
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {detail.rows.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <CardTitle>4. Review and execute</CardTitle>
                        <CardDescription>
                          Only valid/warning rows and explicitly resolved
                          conflicts are applied. Invalid and deferred rows stay
                          in staging.
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => void downloadResult("xlsx")}
                          disabled={Boolean(busy)}
                        >
                          {busy === "download-xlsx" ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="mr-2 h-4 w-4" />
                          )}
                          Result Excel
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => void downloadResult("csv")}
                          disabled={Boolean(busy)}
                        >
                          {busy === "download-csv" ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Download className="mr-2 h-4 w-4" />
                          )}
                          CSV
                        </Button>
                      </div>
                      {hasPermission("imports.execute") &&
                        [
                          "validated",
                          "validated_with_issues",
                          "failed",
                        ].includes(detail.job.status) && (
                          <Button
                            onClick={() => void execute()}
                            disabled={Boolean(busy)}
                          >
                            <Play className="mr-2 h-4 w-4" />
                            Execute eligible rows
                          </Button>
                        )}
                      {canRollback && (
                        <Button
                          variant="destructive"
                          onClick={() => setRollbackOpen(true)}
                          disabled={Boolean(busy)}
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Guarded rollback
                        </Button>
                      )}
                      {detail.job.status === "executing" && (
                        <Badge variant="secondary">
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Executing{" "}
                          {Number(detail.job.progress_percent).toFixed(0)}%
                        </Badge>
                      )}
                      {detail.job.status === "rolling_back" && (
                        <Badge variant="secondary">
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Rolling back safely
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Tabs
                      defaultValue={
                        detail.conflicts.some(
                          (conflict) =>
                            !["resolved", "skipped"].includes(conflict.status),
                        )
                          ? "conflicts"
                          : "rows"
                      }
                    >
                      <TabsList>
                        <TabsTrigger value="rows">Rows</TabsTrigger>
                        <TabsTrigger value="conflicts">
                          Conflicts (
                          {
                            detail.conflicts.filter(
                              (conflict) =>
                                !["resolved", "skipped"].includes(
                                  conflict.status,
                                ),
                            ).length
                          }
                          )
                        </TabsTrigger>
                        <TabsTrigger value="log">Job log</TabsTrigger>
                      </TabsList>
                      <TabsContent value="rows">
                        <div className="overflow-auto rounded-lg border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Source row</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Proposed action</TableHead>
                                <TableHead>Rollback</TableHead>
                                <TableHead>Issues</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {detail.rows.map((row) => (
                                <TableRow key={row.id}>
                                  <TableCell>{row.source_row_number}</TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        row.status === "invalid" ||
                                        row.status === "conflict"
                                          ? "destructive"
                                          : row.status === "warning"
                                            ? "secondary"
                                            : "outline"
                                      }
                                    >
                                      {row.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {row.proposed_action?.replaceAll(
                                      "_",
                                      " ",
                                    ) || "Not validated"}
                                  </TableCell>
                                  <TableCell className="max-w-xs">
                                    <span className="text-xs">
                                      {row.rollback_status?.replaceAll(
                                        "_",
                                        " ",
                                      ) || "not started"}
                                    </span>
                                    {row.rollback_details?.blockers?.map(
                                      (blocker) => (
                                        <div
                                          key={blocker}
                                          className="mt-1 text-xs text-amber-700 dark:text-amber-300"
                                        >
                                          {blocker}
                                        </div>
                                      ),
                                    )}
                                  </TableCell>
                                  <TableCell className="max-w-xl">
                                    {row.issues?.length ? (
                                      <ul className="space-y-1 text-xs">
                                        {row.issues.map((issue, index) => (
                                          <li
                                            key={`${issue.code}-${index}`}
                                            className={
                                              row.status === "invalid" ||
                                              row.status === "conflict"
                                                ? "text-destructive"
                                                : "text-amber-700 dark:text-amber-300"
                                            }
                                          >
                                            {issue.message}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">
                                        No issues
                                      </span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TabsContent>
                      <TabsContent value="conflicts">
                        <div className="space-y-3">
                          {detail.conflicts.length === 0 && (
                            <p className="rounded-lg border p-5 text-sm text-muted-foreground">
                              No database conflicts were found.
                            </p>
                          )}
                          {detail.conflicts.map((conflict) => (
                            <div
                              key={conflict.id}
                              className="rounded-xl border p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant={
                                        ["resolved", "skipped"].includes(
                                          conflict.status,
                                        )
                                          ? "outline"
                                          : "destructive"
                                      }
                                    >
                                      {conflict.status}
                                    </Badge>
                                    <span className="font-medium">
                                      {conflict.conflict_type.replaceAll(
                                        "_",
                                        " ",
                                      )}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Staged row ID {conflict.import_row_id}
                                    {conflict.field_code
                                      ? ` · ${conflict.field_code}`
                                      : ""}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <div className="rounded-lg bg-muted/40 p-3">
                                  <div className="text-xs font-medium uppercase text-muted-foreground">
                                    Existing
                                  </div>
                                  <pre className="mt-1 whitespace-pre-wrap break-words text-xs">
                                    {JSON.stringify(
                                      conflict.existing_value,
                                      null,
                                      2,
                                    )}
                                  </pre>
                                </div>
                                <div className="rounded-lg bg-muted/40 p-3">
                                  <div className="text-xs font-medium uppercase text-muted-foreground">
                                    Incoming
                                  </div>
                                  <pre className="mt-1 whitespace-pre-wrap break-words text-xs">
                                    {JSON.stringify(
                                      conflict.incoming_value,
                                      null,
                                      2,
                                    )}
                                  </pre>
                                </div>
                              </div>
                              {!["resolved", "skipped"].includes(
                                conflict.status,
                              ) &&
                                hasPermission("imports.resolve") && (
                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                    {conflict.conflict_type ===
                                      "field_difference" && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={Boolean(busy)}
                                          onClick={() =>
                                            void resolveConflict(
                                              conflict,
                                              "keep_existing",
                                            )
                                          }
                                        >
                                          Keep existing
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={Boolean(busy)}
                                          onClick={() =>
                                            void resolveConflict(
                                              conflict,
                                              "use_incoming",
                                            )
                                          }
                                        >
                                          Use incoming
                                        </Button>
                                      </>
                                    )}
                                    <Input
                                      className="h-9 min-w-48 flex-1"
                                      placeholder={
                                        conflict.conflict_type ===
                                        "identity_collision"
                                          ? "Existing parent PN/O number"
                                          : "Manual value"
                                      }
                                      value={manualValues[conflict.id] || ""}
                                      onChange={(event) =>
                                        setManualValues((current) => ({
                                          ...current,
                                          [conflict.id]: event.target.value,
                                        }))
                                      }
                                    />
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={
                                        Boolean(busy) ||
                                        !manualValues[conflict.id]?.trim()
                                      }
                                      onClick={() =>
                                        void resolveConflict(conflict, "manual")
                                      }
                                    >
                                      Use manual
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      disabled={Boolean(busy)}
                                      onClick={() =>
                                        void resolveConflict(
                                          conflict,
                                          "skip_row",
                                        )
                                      }
                                    >
                                      Skip row
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={Boolean(busy)}
                                      onClick={() =>
                                        void resolveConflict(conflict, "defer")
                                      }
                                    >
                                      Defer
                                    </Button>
                                  </div>
                                )}
                            </div>
                          ))}
                        </div>
                      </TabsContent>
                      <TabsContent value="log">
                        <div className="max-h-96 space-y-2 overflow-auto rounded-lg border bg-slate-950 p-4 font-mono text-xs text-slate-200">
                          {detail.logs.map((log) => (
                            <div key={log.id}>
                              <span className="text-slate-500">
                                {new Date(log.created_at).toLocaleString()}
                              </span>{" "}
                              <span
                                className={
                                  log.level === "warning" ||
                                  log.level === "error"
                                    ? "text-amber-300"
                                    : "text-emerald-300"
                                }
                              >
                                {log.event_code}
                              </span>{" "}
                              {log.message}
                            </div>
                          ))}
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Import jobs</CardTitle>
              <CardDescription>
                Jobs and progress survive sign-out and browser refresh.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {jobs.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No imports have been uploaded.
                </p>
              )}
              {jobs.map((job) => (
                <button
                  key={job.id}
                  className={`w-full rounded-xl border p-3 text-left transition hover:border-primary ${detail?.job.id === job.id ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => void openJob(job.id)}
                >
                  <div className="flex items-start gap-3">
                    <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {job.original_file_name}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <Badge variant={statusBadge(job.status)}>
                          {job.status.replaceAll("_", " ")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          #{job.id}
                        </span>
                      </div>
                      <Progress
                        className="mt-3 h-1.5"
                        value={Number(job.progress_percent || 0)}
                      />
                      <div className="mt-2 text-xs text-muted-foreground">
                        {job.total_rows
                          ? `${job.total_rows.toLocaleString()} rows`
                          : "Awaiting staging"}{" "}
                        · {new Date(job.created_at).toLocaleDateString()}
                      </div>
                      {job.source_deleted_at && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Source file retired; results retained
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
          {detail && (
            <Card>
              <CardHeader>
                <CardTitle>Dry-run summary</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                {[
                  {
                    label: "Valid",
                    value: detail.job.valid_rows,
                    icon: CheckCircle2,
                    style: "text-emerald-600",
                  },
                  {
                    label: "Warnings",
                    value: detail.job.warning_rows,
                    icon: AlertTriangle,
                    style: "text-amber-600",
                  },
                  {
                    label: "Conflicts",
                    value: detail.job.conflict_rows,
                    icon: AlertTriangle,
                    style: "text-orange-600",
                  },
                  {
                    label: "Invalid",
                    value: detail.job.invalid_rows,
                    icon: XCircle,
                    style: "text-rose-600",
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border p-3">
                    <item.icon className={`h-4 w-4 ${item.style}`} />
                    <div className="mt-2 text-xl font-bold">
                      {item.value || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.label}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {detail?.job.rollback_summary && (
            <Card>
              <CardHeader>
                <CardTitle>Rollback outcome</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  {detail.job.rollback_summary.rolledBackRows} row(s) reversed.
                </p>
                <p>
                  {detail.job.rollback_summary.blockedRows} row(s) protected
                  because later edits or linked records were found.
                </p>
              </CardContent>
            </Card>
          )}
          {detail?.job.source_deleted_at && (
            <Card>
              <CardHeader>
                <CardTitle>Source file retired</CardTitle>
                <CardDescription>
                  Removed on{" "}
                  {new Date(detail.job.source_deleted_at).toLocaleString()}.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                The original upload completed its retention period. Staged row
                results, reports, job logs, and audit history remain available.
              </CardContent>
            </Card>
          )}
        </aside>
      </div>

      <AlertDialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Guarded rollback for import #{detail?.job.id}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Only unchanged records created or updated by this import are
              reversed. Later edits and linked operational records are protected
              and reported.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason for rollback</Label>
              <Input
                value={rollbackReason}
                onChange={(event) => setRollbackReason(event.target.value)}
                placeholder="Explain why this import must be reversed"
              />
            </div>
            <div className="space-y-2">
              <Label>Type job number {detail?.job.id} to confirm</Label>
              <Input
                value={rollbackConfirmation}
                onChange={(event) =>
                  setRollbackConfirmation(event.target.value)
                }
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "rollback"}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={
                busy === "rollback" ||
                rollbackReason.trim().length < 10 ||
                rollbackConfirmation !== String(detail?.job.id || "")
              }
              onClick={(event) => {
                event.preventDefault();
                void rollback();
              }}
            >
              {busy === "rollback" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Start guarded rollback
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && busy !== "configuration-delete") {
            setDeleteTarget(null);
            setDeleteReason("");
            setDeleteConfirmation("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently delete{" "}
              {deleteTarget?.kind === "template"
                ? "mapping template"
                : "heading alias"}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This configuration item cannot be restored. Existing import jobs
              keep their stored mappings, and the deletion remains in the audit
              log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason for deletion</Label>
              <Input
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                placeholder="Required audit reason"
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label>Type “{deleteTarget?.label}” to confirm</Label>
              <Input
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "configuration-delete"}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={
                busy === "configuration-delete" ||
                deleteReason.trim().length < 5 ||
                deleteConfirmation.trim() !== deleteTarget?.label
              }
              onClick={(event) => {
                event.preventDefault();
                void deleteConfigurationItem();
              }}
            >
              {busy === "configuration-delete" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Permanently delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
