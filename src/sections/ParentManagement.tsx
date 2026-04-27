import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  Search, 
  Plus, 
  MoreVertical, 
  Edit, 
  Trash2, 
  Eye, 
  FileText,
  Image,
  Building2,
  User,
  Shield,
  ArrowRight
} from 'lucide-react';
import { useParents, useParentWithDetails, useScannedDocuments } from '@/hooks/useDatabase';
import { useAuth } from '@/hooks/useAuth';
import { formatChildDisplayName } from '@/lib/utils';
import type { ParentBeneficiary, ServiceStatus } from '@/types';

interface ParentManagementProps {
  onNavigate: (page: string, params?: any) => void;
}

const statusColors: Record<ServiceStatus, string> = {
  'Serving': 'bg-green-100 text-green-800 border-green-200',
  'Retired': 'bg-blue-100 text-blue-800 border-blue-200',
  'Expired': 'bg-gray-100 text-gray-800 border-gray-200'
};

export function ParentManagement({ onNavigate }: ParentManagementProps) {
  const { parents, remove } = useParents();
  const { canCreate, canUpdate, canDelete } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ServiceStatus | 'all'>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<ParentBeneficiary | null>(null);

  const filteredParents = parents.filter(parent => {
    const matchesSearch = 
      parent.P_No_O_No.toLowerCase().includes(searchQuery.toLowerCase()) ||
      parent.Parent_Name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      parent.Unit.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || parent.Service_Status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleDelete = () => {
    if (deleteConfirm) {
      remove(deleteConfirm.P_No_O_No);
      setDeleteConfirm(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Beneficiary Management</h1>
          <p className="text-slate-500 dark:text-slate-400">Manage parent beneficiaries and their records</p>
        </div>
        {canCreate('parents') && (
          <Button onClick={() => onNavigate('parent-new')}>
            <Plus className="w-4 h-4 mr-2" />
            Add Parent
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by name, P/No, or unit..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as ServiceStatus | 'all')}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="Serving">Serving</TabsTrigger>
                <TabsTrigger value="Retired">Retired</TabsTrigger>
                <TabsTrigger value="Expired">Expired</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {/* Parents Table */}
      <Card>
        <CardHeader>
          <CardTitle>Parent Beneficiaries ({filteredParents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>P/No O/No</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Rank/Rate</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>CNIC</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredParents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                      No parents found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredParents.map((parent) => (
                    <TableRow key={parent.P_No_O_No} className="cursor-pointer hover:bg-slate-50">
                      <TableCell className="font-medium">{parent.P_No_O_No}</TableCell>
                      <TableCell>{parent.Parent_Name}</TableCell>
                      <TableCell>{parent.Rank_Rate}</TableCell>
                      <TableCell>{parent.Unit}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[parent.Service_Status]}>
                          {parent.Service_Status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{parent.Parent_CNIC}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onNavigate('parent-detail', { pNo: parent.P_No_O_No })}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {canUpdate('parents') && (
                              <DropdownMenuItem onClick={() => onNavigate('parent-edit', { pNo: parent.P_No_O_No })}>
                                <Edit className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                            )}
                            {canDelete('parents') && (
                              <DropdownMenuItem 
                                className="text-red-600"
                                onClick={() => setDeleteConfirm(parent)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm?.Parent_Name}</strong>? 
              This will also delete all associated children, grants, and gadgets. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Parent Detail View Component
interface ParentDetailProps {
  pNo: string;
  onNavigate: (page: string, params?: any) => void;
  onBack: () => void;
}

export function ParentDetail({ pNo, onNavigate, onBack }: ParentDetailProps) {
  const { canUpdate } = useAuth();
  const { parent } = useParentWithDetails(pNo);
  const { documents: scannedDocuments, loading: scannedDocsLoading, getFileUrl } = useScannedDocuments(pNo);
  const [activeTab, setActiveTab] = useState('profile');
  const [previewDoc, setPreviewDoc] = useState<{ name: string; url: string } | null>(null);

  if (!parent) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Parent not found</p>
        <Button onClick={onBack} className="mt-4">Go Back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{parent.Parent_Name}</h1>
          <p className="text-slate-500">{parent.P_No_O_No} • {parent.Rank_Rate}</p>
        </div>
        {canUpdate('parents') && (
          <Button onClick={() => onNavigate('parent-edit', { pNo })}>
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="children">Children ({parent.children?.length || 0})</TabsTrigger>
          <TabsTrigger value="banking">Banking</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-medium text-slate-500">Full Name</label>
                <p className="text-lg">{parent.Parent_Name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-500">P/No or O/No</label>
                <p className="text-lg font-mono">{parent.P_No_O_No}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-500">Rank/Rate</label>
                <p className="text-lg">{parent.Rank_Rate}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-500">Unit</label>
                <p className="text-lg">{parent.Unit}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-500">Administrative Authority</label>
                <p className="text-lg">{parent.Admin_Authority}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-500">Service Status</label>
                <Badge className={statusColors[parent.Service_Status]}>
                  {parent.Service_Status}
                </Badge>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-500">CNIC</label>
                <p className="text-lg font-mono">{parent.Parent_CNIC}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="children" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Dependent Children
              </CardTitle>
              <Button onClick={() => onNavigate('child-new', { pNo })}>
                <Plus className="w-4 h-4 mr-2" />
                Add Child
              </Button>
            </CardHeader>
            <CardContent>
              {parent.children?.length === 0 ? (
                <p className="text-center py-8 text-slate-500">No children registered</p>
              ) : (
                <div className="space-y-4">
                  {parent.children?.map((child: any) => (
                    <div 
                      key={child.Child_ID} 
                      className="p-4 border rounded-lg hover:bg-slate-50 cursor-pointer"
                      onClick={() => onNavigate('child-detail', { childId: child.Child_ID, pNo })}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-lg">{formatChildDisplayName(child.Child_Name, parent.Parent_Name, child.P_No_O_No)}</p>
                          <p className="text-sm text-slate-500">
                            Age: {child.Age} years • CNIC/B-Form: {child.CNIC_BForm_No}
                          </p>
                          <p className="text-sm text-slate-500">
                            {child.Disease_Disability}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className={
                            child.Disability_Category === 'A' ? 'bg-red-100 text-red-800' :
                            child.Disability_Category === 'B' ? 'bg-amber-100 text-amber-800' :
                            'bg-green-100 text-green-800'
                          }>
                            Category {child.Disability_Category}
                          </Badge>
                          <ArrowRight className="w-4 h-4 text-slate-400" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="banking" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Banking Details
              </CardTitle>
              {canUpdate('banking') && (
                <Button variant="outline" size="sm">
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {parent.banking ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-sm font-medium text-slate-500">Account Title</label>
                    <p className="text-lg">{parent.banking.Account_Title}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-500">IBAN</label>
                    <p className="text-lg font-mono">{parent.banking.IBAN}</p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-slate-500">Bank & Branch</label>
                    <p className="text-lg">{parent.banking.Bank_Name_Branch}</p>
                  </div>
                </div>
              ) : (
                <p className="text-center py-8 text-slate-500">No banking details available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Document Tracking
              </CardTitle>
              {canUpdate('documents') && (
                <Button variant="outline" size="sm">
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {parent.documents ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-medium text-slate-500">Letter Reference</label>
                      <p className="text-lg">{parent.documents.Letter_Reference}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-500">Contact Number</label>
                      <p className="text-lg">{parent.documents.Contact_No}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-500">Almirah Number</label>
                      <p className="text-lg">{parent.documents.Almirah_No}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-500">File Number</label>
                      <p className="text-lg">{parent.documents.File_No}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-center py-8 text-slate-500">No document tracking available</p>
                )}

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Scanned Document Images</h3>

                  {scannedDocsLoading ? (
                    <p className="text-sm text-slate-500">Loading scanned images...</p>
                  ) : scannedDocuments.length === 0 ? (
                    <p className="text-sm text-slate-500">No scanned images uploaded yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {scannedDocuments.map((doc) => (
                        <button
                          key={doc.Document_File_ID}
                          type="button"
                          onClick={() => setPreviewDoc({ name: doc.Original_File_Name, url: getFileUrl(doc.Storage_Path) })}
                          className="rounded-md border p-3 hover:bg-slate-50 transition-colors text-left"
                        >
                          <div className="aspect-video w-full rounded-md bg-slate-100 overflow-hidden mb-2">
                            <img
                              src={getFileUrl(doc.Storage_Path)}
                              alt={doc.Original_File_Name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-700">
                            <Image className="w-4 h-4" />
                            <span className="truncate">{doc.Doc_Type || doc.Original_File_Name}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!previewDoc} onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}>
        <DialogContent className="max-w-5xl p-4">
<<<<<<< HEAD
          <DialogHeader>
            <DialogTitle>{previewDoc?.name || 'Document Preview'}</DialogTitle>
=======
          <DialogHeader className="flex flex-row items-center justify-between gap-3">
            <DialogTitle className="truncate">{previewDoc?.name || 'Document Preview'}</DialogTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => setPreviewDoc(null)}>
              Close
            </Button>
>>>>>>> upstream/master
          </DialogHeader>
          <div className="w-full rounded-md border bg-slate-50 p-2">
            {previewDoc && (
              <img
                src={previewDoc.url}
                alt={previewDoc.name}
                className="max-h-[72vh] w-full object-contain"
              />
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPreviewDoc(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
