import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  FileSpreadsheet, 
  FileText, 
  Download, 
  History, 
  User,
  Calendar,
  ArrowRightLeft,
  Plus,
  Edit,
  Trash2,
  Filter
} from 'lucide-react';
import { useGrantsWithDetails, useAuditLogs, useUsers } from '@/hooks/useDatabase';
import { useAuth } from '@/hooks/useAuth';
import { formatChildDisplayName } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/validation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ReportsExportsProps {
  onNavigate: (page: string, params?: any) => void;
}

export function ReportsExports({ onNavigate }: ReportsExportsProps) {
  const [activeTab, setActiveTab] = useState('payroll');
  const { canRead } = useAuth();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Reports & Exports</h1>
          <p className="text-slate-500 dark:text-slate-400">Generate reports and export data</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="payroll" className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            Payroll Export
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Audit Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payroll" className="space-y-4">
          <PayrollExport />
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <AuditLogView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PayrollExport() {
  const { grants, refresh } = useGrantsWithDetails();
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expiring'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');

  const filteredGrants = grants.filter(grant => {
    const today = new Date();
    const approvedTo = new Date(grant.Approved_To);
    const isActive = approvedTo >= today;
    const isExpiring = approvedTo <= new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000) && isActive;

    if (statusFilter === 'active' && !isActive) return false;
    if (statusFilter === 'expiring' && !isExpiring) return false;
    if (categoryFilter !== 'all' && grant.child?.Disability_Category !== categoryFilter) return false;
    return true;
  });

  const totalAmount = filteredGrants.reduce((sum, g) => sum + g.Monthly_Amount, 0);
  const totalCFY = filteredGrants.reduce((sum, g) => sum + (g.Total_CFY_Amount || 0), 0);

  const exportToCSV = () => {
    const headers = ['P/No_O_No', 'Parent_Name', 'Child_Name', 'Disability_Category', 'Account_Title', 'IBAN', 'Bank_Name', 'Bank_Branch', 'Account_Number', 'Monthly_Amount', 'Total_CFY_Amount', 'Approved_To'];
    const rows = filteredGrants.map(g => [
      g.parent?.P_No_O_No,
      g.parent?.Parent_Name,
      g.child?.Child_Name,
      g.child?.Disability_Category,
      g.banking?.Account_Title,
      g.banking?.IBAN,
      g.banking?.Bank_Name || (g.banking?.Bank_Name_Branch && g.banking?.Bank_Name_Branch.split(',')[0]),
      g.banking?.Branch_Address || (g.banking?.Bank_Name_Branch && g.banking?.Bank_Name_Branch.split(',')[1]),
      g.banking?.Account_Number,
      g.Monthly_Amount,
      g.Total_CFY_Amount,
      g.Approved_To
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `payroll_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const exportToExcel = () => {
    // For demo, we'll use CSV as Excel substitute
    exportToCSV();
  };

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-[200px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Grants</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="expiring">Expiring Soon</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as any)}>
              <SelectTrigger className="w-[200px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="A">Category A</SelectItem>
                <SelectItem value="B">Category B</SelectItem>
                <SelectItem value="C">Category C</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={exportToCSV}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button onClick={exportToExcel}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Export Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500 dark:text-slate-400">Total Records</p>
            <p className="text-2xl font-bold dark:text-slate-100">{filteredGrants.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500 dark:text-slate-400">Monthly Amount</p>
            <p className="text-2xl font-bold dark:text-slate-100">{formatCurrency(totalAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500 dark:text-slate-400">Total CFY Amount</p>
            <p className="text-2xl font-bold dark:text-slate-100">{formatCurrency(totalCFY)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500 dark:text-slate-400">Export Date</p>
            <p className="text-2xl font-bold dark:text-slate-100">{new Date().toLocaleDateString()}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payroll Data Preview</CardTitle>
          <CardDescription>Active grants with banking details for disbursement</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>P/No O/No</TableHead>
                  <TableHead>Parent Name</TableHead>
                  <TableHead>Child Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Account Title</TableHead>
                  <TableHead>IBAN</TableHead>
                  <TableHead>Bank Name</TableHead>
                  <TableHead>Monthly</TableHead>
                  <TableHead>CFY Total</TableHead>
                  <TableHead>Valid Until</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGrants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-slate-500 dark:text-slate-400">
                      No grants found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredGrants.map((grant, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono">{grant.parent?.P_No_O_No}</TableCell>
                      <TableCell>{grant.parent?.Parent_Name}</TableCell>
                      <TableCell>
                        {grant.child
                          ? formatChildDisplayName(grant.child.Child_Name, grant.parent?.Parent_Name, grant.parent?.P_No_O_No)
                          : ''}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          grant.child?.Disability_Category === 'A' ? 'border-red-400 text-red-600' :
                          grant.child?.Disability_Category === 'B' ? 'border-amber-400 text-amber-600' :
                          'border-green-400 text-green-600'
                        }>
                          {grant.child?.Disability_Category || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell>{grant.banking?.Account_Title}</TableCell>
                      <TableCell className="font-mono text-xs">{grant.banking?.IBAN}</TableCell>
                      <TableCell>{grant.banking?.Bank_Name || (grant.banking?.Bank_Name_Branch && grant.banking?.Bank_Name_Branch.split(',')[0])}</TableCell>
                      <TableCell className="font-mono">{formatCurrency(grant.Monthly_Amount)}</TableCell>
                      <TableCell className="font-mono">{formatCurrency(grant.Total_CFY_Amount || 0)}</TableCell>
                      <TableCell>{formatDate(grant.Approved_To)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function AuditLogView() {
  const { logs } = useAuditLogs();
  const [actionFilter, setActionFilter] = useState<'all' | 'CREATE' | 'UPDATE' | 'DELETE'>('all');
  const [tableFilter, setTableFilter] = useState<string>('all');

  const filteredLogs = logs.filter(log => {
    const matchesAction = actionFilter === 'all' || log.Action === actionFilter;
    const matchesTable = tableFilter === 'all' || log.Table_Name === tableFilter;
    return matchesAction && matchesTable;
  });

  const tables = Array.from(new Set(logs.map(l => l.Table_Name)));

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'CREATE': return <Plus className="w-4 h-4 text-green-600 dark:text-green-400" />;
      case 'UPDATE': return <Edit className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
      case 'DELETE': return <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />;
      default: return null;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATE': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'UPDATE': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'DELETE': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-400';
    }
  };

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as any)}>
              <SelectTrigger className="w-[150px]">
                <ArrowRightLeft className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="CREATE">Create</SelectItem>
                <SelectItem value="UPDATE">Update</SelectItem>
                <SelectItem value="DELETE">Delete</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger className="w-[200px]">
                <FileText className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Table" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tables</SelectItem>
                {tables.map(table => (
                  <SelectItem key={table} value={table}>{table}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
          <CardDescription>Track all changes made to the system</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Record ID</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500 dark:text-slate-400">
                      No audit logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.Log_ID}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                          {formatDate(log.Timestamp)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                          {log.Username}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getActionIcon(log.Action)}
                          <Badge className={getActionColor(log.Action)}>
                            {log.Action}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>{log.Table_Name}</TableCell>
                      <TableCell className="font-mono">{log.Record_ID}</TableCell>
                      <TableCell>
                        {log.Old_Values && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate">
                            <span className="text-red-500 dark:text-red-400">- {log.Old_Values.substring(0, 50)}...</span>
                          </div>
                        )}
                        {log.New_Values && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate">
                            <span className="text-green-500 dark:text-green-400">+ {log.New_Values.substring(0, 50)}...</span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
