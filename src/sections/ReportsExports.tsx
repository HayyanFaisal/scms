import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, History, Search, Users, Baby, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AuditLog as ServerAuditLog } from "@/sections/AuditLog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useChildren, useGrantsWithDetails, useParents } from "@/hooks/useDatabase";
import { formatCurrency, formatDate } from "@/lib/validation";

type ReportValue = string | number | null | undefined;
type ReportRow = Record<string, ReportValue>;

function safeSpreadsheetValue(value: ReportValue) {
  const text = value == null ? "" : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function downloadBlob(content: BlobPart, mime: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportCsv(rows: ReportRow[], filename: string) {
  if (!rows.length) return toast.error("There are no rows to export.");
  const headers = Object.keys(rows[0]);
  const quote = (value: ReportValue) => `"${safeSpreadsheetValue(value).replaceAll('"', '""')}"`;
  const csv = [headers.map(quote).join(","), ...rows.map(row => headers.map(key => quote(row[key])).join(","))].join("\r\n");
  downloadBlob(`\uFEFF${csv}`, "text/csv;charset=utf-8", filename);
}

async function exportXlsx(rows: ReportRow[], filename: string, sheetName: string) {
  if (!rows.length) return toast.error("There are no rows to export.");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SCMS";
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  const headers = Object.keys(rows[0]);
  sheet.columns = headers.map(header => ({ header, key: header, width: Math.min(36, Math.max(14, header.length + 2)) }));
  rows.forEach(row => sheet.addRow(Object.fromEntries(headers.map(key => [key, safeSpreadsheetValue(row[key])]))));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: `${sheet.getColumn(headers.length).letter}1` };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173B63" } };
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename);
}

function ExportButtons({ rows, baseName, sheetName }: { rows: ReportRow[]; baseName: string; sheetName: string }) {
  const { hasPermission } = useAuth();
  if (!hasPermission("reports.export_sensitive")) return null;
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => exportCsv(rows, `${baseName}_${stamp}.csv`)}>
        <Download className="mr-2 h-4 w-4" />CSV
      </Button>
      <Button onClick={() => void exportXlsx(rows, `${baseName}_${stamp}.xlsx`, sheetName)}>
        <FileSpreadsheet className="mr-2 h-4 w-4" />Excel (.xlsx)
      </Button>
    </div>
  );
}

export function ReportsExports() {
  const { parents } = useParents();
  const { children } = useChildren();
  const { grants } = useGrantsWithDetails();
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState("");
  const needle = search.trim().toLocaleLowerCase();

  const parentRows = useMemo<ReportRow[]>(() => parents
    .filter(parent => !needle || [parent.P_No_O_No, parent.Parent_Name, parent.Parent_CNIC, parent.Admin_Authority, parent.Unit]
      .some(value => String(value ?? "").toLocaleLowerCase().includes(needle)))
    .map(parent => ({
      "PN/O Number": parent.P_No_O_No,
      "Parent Name": parent.Parent_Name,
      CNIC: parent.Parent_CNIC,
      "Rank / Rate": parent.Rank_Rate,
      Unit: parent.Unit,
      Authority: parent.Admin_Authority || "No authority",
      "Service Status": parent.Service_Status,
      Contact: parent.Contact_No,
      Email: parent.Email,
      Address: parent.Address,
    })), [parents, needle]);

  const childRows = useMemo<ReportRow[]>(() => children
    .filter(child => !needle || [child.Child_Name, child.CNIC_BForm_No, child.P_No_O_No, child.School]
      .some(value => String(value ?? "").toLocaleLowerCase().includes(needle)))
    .map(child => ({
      "Child ID": child.Child_ID,
      "Child Name": child.Child_Name,
      "CNIC / B-Form": child.CNIC_BForm_No,
      "Parent PN/O": child.P_No_O_No,
      Age: child.Age,
      School: child.School,
      "Claimed Category": child.Parent_Selected_Category,
      "Approved Category": child.Approved_Category,
    })), [children, needle]);

  const grantRows = useMemo<ReportRow[]>(() => grants
    .filter(grant => !needle || [grant.child?.Child_Name, grant.parent?.Parent_Name, grant.parent?.P_No_O_No]
      .some(value => String(value ?? "").toLocaleLowerCase().includes(needle)))
    .map(grant => ({
      "Grant ID": grant.Grant_ID,
      "Parent PN/O": grant.parent?.P_No_O_No,
      "Parent Name": grant.parent?.Parent_Name,
      "Child Name": grant.child?.Child_Name,
      Category: grant.Category || grant.child?.Disability_Category,
      "Monthly Rate": grant.Monthly_Amount,
      "Period Total": grant.Total_CFY_Amount,
      "Approved From": String(grant.Approved_From).slice(0, 10),
      "Approved To": String(grant.Approved_To).slice(0, 10),
      IBAN: grant.banking?.IBAN,
      "Bank Name": grant.banking?.Bank_Name,
    })), [grants, needle]);

  const activeGrants = grants.filter(grant => grant.Status !== "cancelled" && new Date(grant.Approved_From) <= new Date() && new Date(grant.Approved_To) >= new Date());
  const monthlyCommitment = activeGrants.reduce((sum, grant) => sum + Number(grant.Monthly_Amount || 0), 0);
  const canViewAudit = hasPermission("audit.read");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Reports & Exports</h1>
        <p className="text-slate-500 dark:text-slate-400">Scope-aware operational reports from current SCMS records</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Beneficiaries", parents.length, Users],
          ["Children", children.length, Baby],
          ["Active grants", activeGrants.length, Wallet],
          ["Monthly commitment", formatCurrency(monthlyCommitment), FileSpreadsheet],
        ].map(([label, value, Icon]) => (
          <Card key={String(label)}><CardContent className="flex items-center justify-between pt-6">
            <div><p className="text-sm text-muted-foreground">{String(label)}</p><p className="text-2xl font-bold">{String(value)}</p></div>
            {/* @ts-expect-error tuple icon is a Lucide component */}
            <Icon className="h-6 w-6 text-primary" />
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="beneficiaries">
        <TabsList className={`grid h-auto w-full ${canViewAudit ? "grid-cols-5" : "grid-cols-4"}`}>
          <TabsTrigger value="beneficiaries">Beneficiaries</TabsTrigger>
          <TabsTrigger value="children">Children</TabsTrigger>
          <TabsTrigger value="grants">Grants</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          {canViewAudit && <TabsTrigger value="audit"><History className="mr-2 h-4 w-4" />Audit</TabsTrigger>}
        </TabsList>
        <div className="relative mt-4 max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search the selected operational reports…" />
        </div>

        <TabsContent value="beneficiaries"><ReportTable title="Beneficiary register" description="Parent demographics and organizational assignments." rows={parentRows} baseName="scms_beneficiaries" /></TabsContent>
        <TabsContent value="children"><ReportTable title="Children register" description="Children, schools, identifiers, and approved support categories." rows={childRows} baseName="scms_children" /></TabsContent>
        <TabsContent value="grants"><ReportTable title="Grant register" description="Category-rate snapshots, approved periods, and disbursement details." rows={grantRows} baseName="scms_grants" currencyColumns={new Set(["Monthly Rate", "Period Total"])} /></TabsContent>
        <TabsContent value="summary">
          <Card><CardHeader><CardTitle>Operational summary</CardTitle><CardDescription>Live counts within your assigned authority scope.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(["A", "B", "C"] as const).map(category => <div key={category} className="rounded-lg border p-4"><Badge>Category {category}</Badge><p className="mt-2 text-2xl font-bold">{children.filter(child => child.Approved_Category === category).length}</p><p className="text-xs text-muted-foreground">children</p></div>)}
              <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Serving beneficiaries</p><p className="text-2xl font-bold">{parents.filter(parent => parent.Service_Status === "Serving").length}</p></div>
              <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Without authority</p><p className="text-2xl font-bold">{parents.filter(parent => !parent.Admin_Authority).length}</p></div>
              <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Children without grants</p><p className="text-2xl font-bold">{children.filter(child => !grants.some(grant => grant.Child_ID === child.Child_ID)).length}</p></div>
            </CardContent>
          </Card>
        </TabsContent>
        {canViewAudit && <TabsContent value="audit"><ServerAuditLog /></TabsContent>}
      </Tabs>
    </div>
  );
}

function ReportTable({ title, description, rows, baseName, currencyColumns = new Set<string>() }: { title: string; description: string; rows: ReportRow[]; baseName: string; currencyColumns?: Set<string> }) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div><CardTitle>{title}</CardTitle><CardDescription>{description} {rows.length.toLocaleString()} row(s).</CardDescription></div>
        <ExportButtons rows={rows} baseName={baseName} sheetName={title} />
      </CardHeader>
      <CardContent><div className="max-h-[560px] overflow-auto rounded-lg border"><Table>
        <TableHeader>{headers.length > 0 && <TableRow>{headers.map(header => <TableHead key={header} className="whitespace-nowrap">{header}</TableHead>)}</TableRow>}</TableHeader>
        <TableBody>{rows.length === 0 ? <TableRow><TableCell colSpan={Math.max(1, headers.length)} className="py-10 text-center text-muted-foreground">No matching records.</TableCell></TableRow> : rows.slice(0, 500).map((row, index) => <TableRow key={index}>{headers.map(header => <TableCell key={header} className="whitespace-nowrap">{currencyColumns.has(header) ? formatCurrency(Number(row[header] || 0)) : header.includes("Approved") && String(row[header] || "").match(/^\d{4}-\d{2}-\d{2}/) ? formatDate(String(row[header])) : String(row[header] ?? "—")}</TableCell>)}</TableRow>)}</TableBody>
      </Table></div>{rows.length > 500 && <p className="mt-2 text-xs text-muted-foreground">Preview limited to 500 rows; exports contain all filtered rows.</p>}</CardContent>
    </Card>
  );
}
