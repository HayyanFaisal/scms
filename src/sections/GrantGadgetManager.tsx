import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Wallet, 
  Package, 
  Calculator, 
  TrendingUp, 
  AlertTriangle,
  Plus,
  Edit,
  Trash2,
  Search
} from 'lucide-react';
import { useGrants, useGadgets, useChildren, useParents, useExpiringGrants } from '@/hooks/useDatabase';
import { useAuth } from '@/hooks/useAuth';
import { formatChildDisplayName } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/validation';
import type { MonthlyGrants, ChildGadgets, DisabilityCategory, AcquisitionType } from '@/types';

interface GrantGadgetManagerProps {
  onNavigate: (page: string, params?: any) => void;
}

const categoryColors: Record<DisabilityCategory, string> = {
  'A': 'bg-red-100 text-red-800 border-red-200',
  'B': 'bg-amber-100 text-amber-800 border-amber-200',
  'C': 'bg-green-100 text-green-800 border-green-200'
};

const acquisitionColors: Record<AcquisitionType, string> = {
  'Off the Shelf': 'bg-blue-100 text-blue-800',
  'Customized': 'bg-purple-100 text-purple-800',
  'Reimbursed': 'bg-orange-100 text-orange-800'
};

export function GrantGadgetManager({ onNavigate }: GrantGadgetManagerProps) {
  const [activeTab, setActiveTab] = useState('grants');
  const { canCreate, canUpdate, canDelete } = useAuth();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Grant & Gadget Manager</h1>
          <p className="text-slate-500 dark:text-slate-400">Manage monthly grants and assistive devices</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="grants" className="flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            Monthly Grants
          </TabsTrigger>
          <TabsTrigger value="gadgets" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Gadgets
          </TabsTrigger>
          <TabsTrigger value="calculator" className="flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            Calculator
          </TabsTrigger>
        </TabsList>

        <TabsContent value="grants" className="space-y-4">
          <GrantsList 
            canCreate={canCreate('grants')} 
            canUpdate={canUpdate('grants')} 
            canDelete={canDelete('grants')}
          />
        </TabsContent>

        <TabsContent value="gadgets" className="space-y-4">
          <GadgetsList 
            canCreate={canCreate('gadgets')} 
            canUpdate={canUpdate('gadgets')} 
            canDelete={canDelete('gadgets')}
          />
        </TabsContent>

        <TabsContent value="calculator" className="space-y-4">
          <CalculatorPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GrantsList({ canCreate, canUpdate, canDelete }: { canCreate: boolean; canUpdate: boolean; canDelete: boolean }) {
  const { grants, create, update, remove } = useGrants();
  const { children } = useChildren();
  const { parents } = useParents();
  const { grants: expiringGrants } = useExpiringGrants(30);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<DisabilityCategory | 'all'>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGrant, setEditingGrant] = useState<MonthlyGrants | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<MonthlyGrants | null>(null);

  const [formData, setFormData] = useState({
    Child_ID: '',
    Monthly_Amount: '',
    Approved_From: '',
    Approved_To: ''
  });

  const filteredGrants = grants.filter(grant => {
    const child = children.find(c => c.Child_ID === grant.Child_ID);
    const matchesSearch = 
      child?.Child_Name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      child?.P_No_O_No.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || child?.Disability_Category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleSubmit = () => {
    const data = {
      Child_ID: parseInt(formData.Child_ID),
      Monthly_Amount: parseFloat(formData.Monthly_Amount),
      Total_CFY_Amount: parseFloat(formData.Monthly_Amount) * 12,
      Approved_From: formData.Approved_From,
      Approved_To: formData.Approved_To
    };

    if (editingGrant) {
      update(editingGrant.Grant_ID, data);
    } else {
      create(data);
    }
    setIsDialogOpen(false);
    setEditingGrant(null);
    setFormData({ Child_ID: '', Monthly_Amount: '', Approved_From: '', Approved_To: '' });
  };

  const handleEdit = (grant: MonthlyGrants) => {
    setEditingGrant(grant);
    setFormData({
      Child_ID: grant.Child_ID.toString(),
      Monthly_Amount: grant.Monthly_Amount.toString(),
      Approved_From: grant.Approved_From,
      Approved_To: grant.Approved_To
    });
    setIsDialogOpen(true);
  };

  const handleDelete = () => {
    if (deleteConfirm) {
      remove(deleteConfirm.Grant_ID);
      setDeleteConfirm(null);
    }
  };

  const totalMonthly = filteredGrants.reduce((sum, g) => sum + g.Monthly_Amount, 0);

  return (
    <>
      {/* Expiring Grants Alert */}
      {expiringGrants.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-amber-900">Expiring Grants Alert</h4>
                <p className="text-sm text-amber-700">
                  {expiringGrants.length} grant(s) will expire within the next 30 days. Please review and renew if necessary.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by child name or parent P/No..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as DisabilityCategory | 'all')}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="A">Category A</SelectItem>
                <SelectItem value="B">Category B</SelectItem>
                <SelectItem value="C">Category C</SelectItem>
              </SelectContent>
            </Select>
            {canCreate && (
              <Button onClick={() => {
                setEditingGrant(null);
                setFormData({ Child_ID: '', Monthly_Amount: '', Approved_From: '', Approved_To: '' });
                setIsDialogOpen(true);
              }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Grant
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Total Grants</p>
            <p className="text-2xl font-bold">{filteredGrants.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Monthly Disbursement</p>
            <p className="text-2xl font-bold">{formatCurrency(totalMonthly)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Annual Projection</p>
            <p className="text-2xl font-bold">{formatCurrency(totalMonthly * 12)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Grants Table */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Grants</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Child</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Monthly Amount</TableHead>
                  <TableHead>Approved From</TableHead>
                  <TableHead>Approved To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGrants.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                      No grants found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredGrants.map((grant) => {
                    const child = children.find(c => c.Child_ID === grant.Child_ID);
                    const parent = parents.find((p: any) => p.P_No_O_No === child?.P_No_O_No);
                    const isExpiring = new Date(grant.Approved_To) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                    const isExpired = new Date(grant.Approved_To) < new Date();
                    
                    return (
                      <TableRow key={grant.Grant_ID}>
                        <TableCell>
                          <p className="font-medium">{formatChildDisplayName(child?.Child_Name || 'Unknown Child', parent?.Parent_Name, child?.P_No_O_No)}</p>
                          <p className="text-sm text-slate-500">{child?.P_No_O_No}</p>
                        </TableCell>
                        <TableCell>
                          <Badge className={categoryColors[child?.Disability_Category || 'A']}>
                            {child?.Disability_Category}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">{formatCurrency(grant.Monthly_Amount)}</TableCell>
                        <TableCell>{formatDate(grant.Approved_From)}</TableCell>
                        <TableCell>{formatDate(grant.Approved_To)}</TableCell>
                        <TableCell>
                          {isExpired ? (
                            <Badge variant="destructive">Expired</Badge>
                          ) : isExpiring ? (
                            <Badge className="bg-amber-100 text-amber-800">Expiring Soon</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-800">Active</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {canUpdate && (
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(grant)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(grant)}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGrant ? 'Edit Grant' : 'Add New Grant'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Child</Label>
              <Select 
                value={formData.Child_ID} 
                onValueChange={(v) => setFormData({ ...formData, Child_ID: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select child" />
                </SelectTrigger>
                <SelectContent>
                  {children.map(child => (
                    <SelectItem key={child.Child_ID} value={child.Child_ID.toString()}>
                      {formatChildDisplayName(child.Child_Name, parents.find((p: any) => p.P_No_O_No === child.P_No_O_No)?.Parent_Name, child.P_No_O_No)} (Cat {child.Disability_Category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Monthly Amount (PKR)</Label>
              <Input
                type="number"
                value={formData.Monthly_Amount}
                onChange={(e) => setFormData({ ...formData, Monthly_Amount: e.target.value })}
                placeholder="Enter amount"
              />
            </div>
            <div>
              <Label>Approved From</Label>
              <Input
                type="date"
                value={formData.Approved_From}
                onChange={(e) => setFormData({ ...formData, Approved_From: e.target.value })}
              />
            </div>
            <div>
              <Label>Approved To</Label>
              <Input
                type="date"
                value={formData.Approved_To}
                onChange={(e) => setFormData({ ...formData, Approved_To: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>{editingGrant ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this grant? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GadgetsList({ canCreate, canUpdate, canDelete }: { canCreate: boolean; canUpdate: boolean; canDelete: boolean }) {
  const { gadgets, create, update, remove } = useGadgets();
  const { children } = useChildren();
  const { parents } = useParents();
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGadget, setEditingGadget] = useState<ChildGadgets | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ChildGadgets | null>(null);

  const [formData, setFormData] = useState({
    Child_ID: '',
    Detail_of_Gadgets: '',
    Base_Cost: '',
    Acquisition_Type: 'Off the Shelf' as AcquisitionType
  });

  const filteredGadgets = gadgets.filter(gadget => {
    const child = children.find(c => c.Child_ID === gadget.Child_ID);
    return (
      !!child?.Child_Name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      gadget.Detail_of_Gadgets.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const handleSubmit = () => {
    const data = {
      Child_ID: parseInt(formData.Child_ID),
      Detail_of_Gadgets: formData.Detail_of_Gadgets,
      Base_Cost: parseFloat(formData.Base_Cost),
      Acquisition_Type: formData.Acquisition_Type
    };

    if (editingGadget) {
      update(editingGadget.Gadget_ID, data);
    } else {
      create(data);
    }
    setIsDialogOpen(false);
    setEditingGadget(null);
    setFormData({ Child_ID: '', Detail_of_Gadgets: '', Base_Cost: '', Acquisition_Type: 'Off the Shelf' });
  };

  const handleEdit = (gadget: ChildGadgets) => {
    setEditingGadget(gadget);
    setFormData({
      Child_ID: gadget.Child_ID.toString(),
      Detail_of_Gadgets: gadget.Detail_of_Gadgets,
      Base_Cost: gadget.Base_Cost.toString(),
      Acquisition_Type: gadget.Acquisition_Type
    });
    setIsDialogOpen(true);
  };

  const handleDelete = () => {
    if (deleteConfirm) {
      remove(deleteConfirm.Gadget_ID);
      setDeleteConfirm(null);
    }
  };

  const totalBaseCost = filteredGadgets.reduce((sum, g) => sum + g.Base_Cost, 0);
  const totalTax = filteredGadgets.reduce((sum, g) => sum + g.Tax_18_Percent, 0);
  const totalCost = filteredGadgets.reduce((sum, g) => sum + g.Total_Cost, 0);

  return (
    <>
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by child name or gadget..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            {canCreate && (
              <Button onClick={() => {
                setEditingGadget(null);
                setFormData({ Child_ID: '', Detail_of_Gadgets: '', Base_Cost: '', Acquisition_Type: 'Off the Shelf' });
                setIsDialogOpen(true);
              }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Gadget
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Total Gadgets</p>
            <p className="text-2xl font-bold">{filteredGadgets.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Base Cost + Tax (18%)</p>
            <p className="text-2xl font-bold">{formatCurrency(totalBaseCost)} + {formatCurrency(totalTax)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Total Cost</p>
            <p className="text-2xl font-bold">{formatCurrency(totalCost)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Gadgets Table */}
      <Card>
        <CardHeader>
          <CardTitle>Assistive Devices & Gadgets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Child</TableHead>
                  <TableHead>Gadget Details</TableHead>
                  <TableHead>Base Cost</TableHead>
                  <TableHead>Tax (18%)</TableHead>
                  <TableHead>Total Cost</TableHead>
                  <TableHead>Acquisition</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGadgets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                      No gadgets found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredGadgets.map((gadget) => {
                    const child = children.find(c => c.Child_ID === gadget.Child_ID);
                    const parent = parents.find((p: any) => p.P_No_O_No === child?.P_No_O_No);
                    
                    return (
                      <TableRow key={gadget.Gadget_ID}>
                        <TableCell>
                          <p className="font-medium">{formatChildDisplayName(child?.Child_Name || 'Unknown Child', parent?.Parent_Name, child?.P_No_O_No)}</p>
                          <p className="text-sm text-slate-500">{child?.P_No_O_No}</p>
                        </TableCell>
                        <TableCell>{gadget.Detail_of_Gadgets}</TableCell>
                        <TableCell className="font-mono">{formatCurrency(gadget.Base_Cost)}</TableCell>
                        <TableCell className="font-mono">{formatCurrency(gadget.Tax_18_Percent)}</TableCell>
                        <TableCell className="font-mono font-medium">{formatCurrency(gadget.Total_Cost)}</TableCell>
                        <TableCell>
                          <Badge className={acquisitionColors[gadget.Acquisition_Type]}>
                            {gadget.Acquisition_Type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {canUpdate && (
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(gadget)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(gadget)}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGadget ? 'Edit Gadget' : 'Add New Gadget'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Child</Label>
              <Select 
                value={formData.Child_ID} 
                onValueChange={(v) => setFormData({ ...formData, Child_ID: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select child" />
                </SelectTrigger>
                <SelectContent>
                  {children.map(child => (
                    <SelectItem key={child.Child_ID} value={child.Child_ID.toString()}>
                      {formatChildDisplayName(child.Child_Name, parents.find((p: any) => p.P_No_O_No === child.P_No_O_No)?.Parent_Name, child.P_No_O_No)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gadget Details</Label>
              <Input
                value={formData.Detail_of_Gadgets}
                onChange={(e) => setFormData({ ...formData, Detail_of_Gadgets: e.target.value })}
                placeholder="e.g., Communication Tablet"
              />
            </div>
            <div>
              <Label>Base Cost (PKR)</Label>
              <Input
                type="number"
                value={formData.Base_Cost}
                onChange={(e) => setFormData({ ...formData, Base_Cost: e.target.value })}
                placeholder="Enter base cost"
              />
            </div>
            <div>
              <Label>Acquisition Type</Label>
              <Select 
                value={formData.Acquisition_Type} 
                onValueChange={(v) => setFormData({ ...formData, Acquisition_Type: v as AcquisitionType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Off the Shelf">Off the Shelf</SelectItem>
                  <SelectItem value="Customized">Customized</SelectItem>
                  <SelectItem value="Reimbursed">Reimbursed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.Base_Cost && (
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-500">Calculated Total (with 18% tax)</p>
                <p className="text-lg font-bold">
                  {formatCurrency(parseFloat(formData.Base_Cost || '0') * 1.18)}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit}>{editingGadget ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this gadget record? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CalculatorPanel() {
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [baseCost, setBaseCost] = useState('');
  const [quarters, setQuarters] = useState(1);

  const quarterlyAmount = parseFloat(monthlyAmount || '0') * 3;
  const annualAmount = parseFloat(monthlyAmount || '0') * 12;
  const taxAmount = parseFloat(baseCost || '0') * 0.18;
  const totalGadgetCost = parseFloat(baseCost || '0') * 1.18;
  const multiQuarterAmount = quarterlyAmount * quarters;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Grant Calculator
          </CardTitle>
          <CardDescription>Calculate quarterly and annual grant amounts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Monthly Amount (PKR)</Label>
            <Input
              type="number"
              value={monthlyAmount}
              onChange={(e) => setMonthlyAmount(e.target.value)}
              placeholder="Enter monthly amount"
            />
          </div>
          <div>
            <Label>Number of Quarters</Label>
            <Input
              type="number"
              min={1}
              max={4}
              value={quarters}
              onChange={(e) => setQuarters(parseInt(e.target.value) || 1)}
            />
          </div>
          
          <div className="space-y-3 pt-4">
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-600">Quarterly Amount (3 months)</span>
              <span className="font-bold text-lg">{formatCurrency(quarterlyAmount)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-600">Multi-Quarter Amount ({quarters}Q)</span>
              <span className="font-bold text-lg">{formatCurrency(multiQuarterAmount)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-lg">
              <span className="text-emerald-700">Annual Amount (12 months)</span>
              <span className="font-bold text-lg text-emerald-700">{formatCurrency(annualAmount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Gadget Tax Calculator
          </CardTitle>
          <CardDescription>Calculate 18% tax on assistive devices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Base Cost (PKR)</Label>
            <Input
              type="number"
              value={baseCost}
              onChange={(e) => setBaseCost(e.target.value)}
              placeholder="Enter base cost"
            />
          </div>
          
          <div className="space-y-3 pt-4">
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-600">Base Cost</span>
              <span className="font-mono">{formatCurrency(parseFloat(baseCost || '0'))}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-600">Tax (18%)</span>
              <span className="font-mono">{formatCurrency(taxAmount)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
              <span className="text-blue-700 font-medium">Total Cost (with tax)</span>
              <span className="font-bold text-lg text-blue-700">{formatCurrency(totalGadgetCost)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
