import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Save, User, FileText, CreditCard, Upload, Image, Trash2 } from 'lucide-react';
import { useParents, useDocuments, useBanking, useScannedDocuments } from '@/hooks/useDatabase';
import { useReferenceData } from '@/hooks/useReferenceData';
import { getCNICError, getIBANError, getPhoneError, getPNoError } from '@/lib/validation';
import type { ServiceStatus } from '@/types';

interface ParentFormProps {
  pNo?: string | null;
  onSave: () => void;
  onCancel: () => void;
}

export function ParentForm({ pNo, onSave, onCancel }: ParentFormProps) {
  const { parents, create, update } = useParents();
  const { documents, create: createDoc, update: updateDoc } = useDocuments();
  const { banking, create: createBank, update: updateBank } = useBanking();
  const isEditing = !!pNo;
  const { items: referenceItems, loading: referenceLoading, error: referenceError } = useReferenceData();
  const {
    documents: scannedDocuments,
    loading: scannedDocsLoading,
    error: scannedDocsError,
    upload: uploadScannedDocument,
    remove: removeScannedDocument,
    getFileUrl
  } = useScannedDocuments(isEditing ? pNo || null : null);

  const existingParent = isEditing ? parents.find(p => p.P_No_O_No === pNo) : null;
  const existingDoc = isEditing ? documents.find(d => d.P_No_O_No === pNo) : null;
  const existingBank = isEditing ? banking.find(b => b.P_No_O_No === pNo) : null;

  const [activeTab, setActiveTab] = useState('profile');
  const [errors, setErrors] = useState<string[]>([]);

  // Parent form state
  const [parentData, setParentData] = useState({
    P_No_O_No: '',
    Parent_Name: '',
    Rank_Rate: '',
    Unit: '',
    Admin_Authority: '',
    Service_Status: 'Serving' as ServiceStatus,
    Parent_CNIC: '',
    Address: '',
    Email: '',
    Contact_No: '',
    No_of_Disabled_Children: 0
  });

  // Document form state
  const [docData, setDocData] = useState({
    Letter_Reference: '',
    Contact_No: '',
    Almirah_No: '',
    File_No: ''
  });

  // Banking form state
  const [bankData, setBankData] = useState({
    Bank_Name: '',
    Account_Title: '',
    Account_Number: '',
    Branch_Code: '',
    Branch_Address: '',
    IBAN: '',
    Routing_Number: '',
    CNIC_of_Account_Holder: '',
    Bank_Name_Branch: ''
  });
  const [selectedScanFile, setSelectedScanFile] = useState<File | null>(null);
  const [scanDocType, setScanDocType] = useState('');
  const [scanActionError, setScanActionError] = useState<string | null>(null);
  const [isUploadingScan, setIsUploadingScan] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ name: string; url: string } | null>(null);

  useEffect(() => {
    if (existingParent) {
      setParentData({
        P_No_O_No: existingParent.P_No_O_No,
        Parent_Name: existingParent.Parent_Name,
        Rank_Rate: existingParent.Rank_Rate,
        Unit: existingParent.Unit,
        Admin_Authority: existingParent.Admin_Authority,
        Service_Status: existingParent.Service_Status,
        Parent_CNIC: existingParent.Parent_CNIC,
        Address: existingParent.Address || '',
        Email: existingParent.Email || '',
        Contact_No: existingParent.Contact_No || '',
        No_of_Disabled_Children: existingParent.No_of_Disabled_Children || 0
      });
    }
    if (existingDoc) {
      setDocData({
        Letter_Reference: existingDoc.Letter_Reference,
        Contact_No: existingDoc.Contact_No,
        Almirah_No: existingDoc.Almirah_No,
        File_No: existingDoc.File_No
      });
    }
    if (existingBank) {
      setBankData({
        Bank_Name: existingBank.Bank_Name || '',
        Account_Title: existingBank.Account_Title,
        Account_Number: existingBank.Account_Number || '',
        Branch_Code: existingBank.Branch_Code || '',
        Branch_Address: existingBank.Branch_Address || '',
        IBAN: existingBank.IBAN,
        Routing_Number: existingBank.Routing_Number || '',
        CNIC_of_Account_Holder: existingBank.CNIC_of_Account_Holder || '',
        Bank_Name_Branch: existingBank.Bank_Name_Branch
      });
    }
  }, [existingParent, existingDoc, existingBank]);

  const validate = (): boolean => {
    const newErrors: string[] = [];

    const pNoError = getPNoError(parentData.P_No_O_No);
    if (pNoError) newErrors.push(pNoError);

    if (!parentData.Parent_Name.trim()) newErrors.push('Parent name is required');
    if (!parentData.Rank_Rate.trim()) newErrors.push('Rank/Rate is required');
    if (!parentData.Unit.trim()) newErrors.push('Unit is required');

    const cnicError = getCNICError(parentData.Parent_CNIC);
    if (cnicError) newErrors.push(cnicError);

    if (docData.Contact_No) {
      const phoneError = getPhoneError(docData.Contact_No);
      if (phoneError) newErrors.push(phoneError);
    }
    if (parentData.Contact_No) {
      const phoneError = getPhoneError(parentData.Contact_No);
      if (phoneError) newErrors.push(phoneError);
    }

    if (bankData.IBAN) {
      const ibanError = getIBANError(bankData.IBAN);
      if (ibanError) newErrors.push(ibanError);

      const normalizedIban = bankData.IBAN.trim().toUpperCase();
      const duplicateBankRecord = banking.find(b => {
        const existingIban = (b.IBAN || '').trim().toUpperCase();
        if (existingIban !== normalizedIban) return false;
        if (isEditing && existingBank && b.Account_ID === existingBank.Account_ID) return false;
        return true;
      });

      if (duplicateBankRecord) {
        newErrors.push('IBAN already exists for another beneficiary');
      }
    }

    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleSubmit = () => {
    if (referenceLoading || referenceError) return;
    if (!validate()) return;

    if (isEditing) {
      update(pNo!, parentData);
      if (existingDoc) {
        updateDoc(existingDoc.Doc_ID, { ...docData, P_No_O_No: pNo! });
      } else if (docData.Letter_Reference) {
        createDoc({ ...docData, P_No_O_No: pNo! });
      }
      if (existingBank) {
        updateBank(existingBank.Account_ID, { ...bankData, P_No_O_No: pNo! });
      } else if (bankData.IBAN) {
        createBank({ ...bankData, P_No_O_No: pNo! });
      }
    } else {
      create(parentData);
      if (docData.Letter_Reference) {
        createDoc({ ...docData, P_No_O_No: parentData.P_No_O_No });
      }
      if (bankData.IBAN) {
        createBank({ ...bankData, P_No_O_No: parentData.P_No_O_No });
      }
    }

    onSave();
  };

  const handleScannedDocumentUpload = async () => {
    if (!selectedScanFile || !pNo) {
      return;
    }

    setIsUploadingScan(true);
    setScanActionError(null);

    try {
      await uploadScannedDocument(selectedScanFile, scanDocType.trim() || undefined);
      setSelectedScanFile(null);
      setScanDocType('');
    } catch (uploadError) {
      setScanActionError(uploadError instanceof Error ? uploadError.message : 'Failed to upload scanned document');
    } finally {
      setIsUploadingScan(false);
    }
  };

  const handleScannedDocumentDelete = async (documentFileId: number) => {
    setScanActionError(null);
    try {
      await removeScannedDocument(documentFileId);
    } catch (deleteError) {
      setScanActionError(deleteError instanceof Error ? deleteError.message : 'Failed to delete scanned document');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onCancel}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">
            {isEditing ? 'Edit Parent' : 'Add New Parent'}
          </h1>
        </div>
        <Button onClick={handleSubmit} disabled={referenceLoading || !!referenceError}>
          <Save className="w-4 h-4 mr-2" />
          Save
        </Button>
      </div>

      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <ul className="list-disc list-inside">
              {errors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {referenceError && <Alert variant="destructive"><AlertDescription>{referenceError} Configuration must be available before this record can be saved.</AlertDescription></Alert>}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="banking" className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Banking
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pNo">P/No or O/No <span className="text-red-500">*</span></Label>
                  <Input
                    id="pNo"
                    value={parentData.P_No_O_No}
                    onChange={(e) => setParentData({ ...parentData, P_No_O_No: e.target.value })}
                    placeholder="e.g., P-12345"
                    disabled={isEditing}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name <span className="text-red-500">*</span></Label>
                  <Input
                    id="name"
                    value={parentData.Parent_Name}
                    onChange={(e) => setParentData({ ...parentData, Parent_Name: e.target.value })}
                    placeholder="Enter full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rank">Rank/Rate <span className="text-red-500">*</span></Label>
                  <Select value={parentData.Rank_Rate} onValueChange={(value) => setParentData({ ...parentData, Rank_Rate: value })} disabled={referenceLoading}>
                    <SelectTrigger id="rank"><SelectValue placeholder="Select rank/rate" /></SelectTrigger>
                    <SelectContent>
                      {parentData.Rank_Rate && !referenceItems.rank.some(item => item.name === parentData.Rank_Rate) && <SelectItem value={parentData.Rank_Rate}>{parentData.Rank_Rate} (archived)</SelectItem>}
                      {referenceItems.rank.map(item => <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">Unit <span className="text-red-500">*</span></Label>
                  <Select value={parentData.Unit} onValueChange={(value) => setParentData({ ...parentData, Unit: value })} disabled={referenceLoading}>
                    <SelectTrigger id="unit"><SelectValue placeholder="Select unit" /></SelectTrigger>
                    <SelectContent>
                      {parentData.Unit && !referenceItems.unit.some(item => item.name === parentData.Unit) && <SelectItem value={parentData.Unit}>{parentData.Unit} (archived)</SelectItem>}
                      {referenceItems.unit.map(item => <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin">Administrative Authority</Label>
                  <Select value={parentData.Admin_Authority || '__none__'} onValueChange={(value) => setParentData({ ...parentData, Admin_Authority: value === '__none__' ? '' : value })} disabled={referenceLoading}>
                    <SelectTrigger id="admin"><SelectValue placeholder="Select authority" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No authority assigned</SelectItem>
                      {parentData.Admin_Authority && !referenceItems.authority.some(item => item.name === parentData.Admin_Authority) && <SelectItem value={parentData.Admin_Authority}>{parentData.Admin_Authority} (archived)</SelectItem>}
                      {referenceItems.authority.map(item => <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Service Status</Label>
                  <Select 
                    value={parentData.Service_Status} 
                    onValueChange={(v) => setParentData({ ...parentData, Service_Status: v as ServiceStatus })}
                    disabled={referenceLoading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {parentData.Service_Status && !referenceItems.service_status.some(item => item.name === parentData.Service_Status) && <SelectItem value={parentData.Service_Status}>{parentData.Service_Status} (archived)</SelectItem>}
                      {referenceItems.service_status.map(item => <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="cnic">CNIC <span className="text-red-500">*</span></Label>
                  <Input
                    id="cnic"
                    value={parentData.Parent_CNIC}
                    onChange={(e) => setParentData({ ...parentData, Parent_CNIC: e.target.value })}
                    placeholder="00000-0000000-0"
                  />
                  <p className="text-xs text-slate-500">Format: 00000-0000000-0</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={parentData.Address}
                    onChange={(e) => setParentData({ ...parentData, Address: e.target.value })}
                    placeholder="Residential address"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={parentData.Email}
                    onChange={(e) => setParentData({ ...parentData, Email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactNo">Contact Number</Label>
                  <Input
                    id="contactNo"
                    value={parentData.Contact_No}
                    onChange={(e) => setParentData({ ...parentData, Contact_No: e.target.value })}
                    placeholder="03XX-XXXXXXX"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="disabledChildren">Registered Children</Label>
                  <Input
                    id="disabledChildren"
                    type="number"
                    value={parentData.No_of_Disabled_Children}
                    onChange={(e) => setParentData({ ...parentData, No_of_Disabled_Children: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="border rounded-lg p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Scanned Document Images</h3>
                  <p className="text-xs text-slate-500">Upload scanned image files linked to this parent profile.</p>
                </div>

                {!isEditing ? (
                  <Alert>
                    <AlertDescription>
                      Save this parent first, then you can upload scanned document images.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-2 md:col-span-1">
                        <Label htmlFor="scanDocType">Document Type</Label>
                        <Input
                          id="scanDocType"
                          value={scanDocType}
                          onChange={(e) => setScanDocType(e.target.value)}
                          placeholder="e.g., Disability Certificate"
                        />
                      </div>

                      <div className="space-y-2 md:col-span-1">
                        <Label htmlFor="scanFile">Scanned Image</Label>
                        <Input
                          id="scanFile"
                          type="file"
                          accept="image/*"
                          onChange={(e) => setSelectedScanFile(e.target.files?.[0] || null)}
                        />
                      </div>

                      <div className="flex items-end">
                        <Button
                          type="button"
                          onClick={() => void handleScannedDocumentUpload()}
                          disabled={!selectedScanFile || isUploadingScan}
                          className="w-full"
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          {isUploadingScan ? 'Uploading...' : 'Upload Image'}
                        </Button>
                      </div>
                    </div>

                    {(scanActionError || scannedDocsError) && (
                      <Alert variant="destructive">
                        <AlertDescription>{scanActionError || scannedDocsError}</AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-3">
                      {scannedDocsLoading ? (
                        <p className="text-sm text-slate-500">Loading scanned documents...</p>
                      ) : scannedDocuments.length === 0 ? (
                        <p className="text-sm text-slate-500">No scanned images uploaded yet.</p>
                      ) : (
                        scannedDocuments.map((doc) => (
                          <div
                            key={doc.Document_File_ID}
                            className="flex items-center justify-between gap-3 rounded-md border p-3"
                          >
                            <div className="min-w-0 flex items-center gap-3">
                              <Image className="w-4 h-4 text-slate-500" />
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => setPreviewDoc({ name: doc.Original_File_Name, url: getFileUrl(doc.Storage_Path) })}
                                  className="font-medium text-slate-900 hover:underline truncate block text-left"
                                >
                                  {doc.Original_File_Name}
                                </button>
                                <p className="text-xs text-slate-500">
                                  {doc.Doc_Type || 'General'} • {formatBytes(doc.File_Size_Bytes)}
                                </p>
                              </div>
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void handleScannedDocumentDelete(doc.Document_File_ID)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Tracking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="letterRef">Letter Reference</Label>
                  <Input
                    id="letterRef"
                    value={docData.Letter_Reference}
                    onChange={(e) => setDocData({ ...docData, Letter_Reference: e.target.value })}
                    placeholder="e.g., GHQ/2024/1234"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact">Contact Number</Label>
                  <Input
                    id="contact"
                    value={docData.Contact_No}
                    onChange={(e) => setDocData({ ...docData, Contact_No: e.target.value })}
                    placeholder="03XX-XXXXXXX"
                  />
                  <p className="text-xs text-slate-500">Format: 03XX-XXXXXXX</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="almirah">Almirah Number</Label>
                  <Input
                    id="almirah"
                    value={docData.Almirah_No}
                    onChange={(e) => setDocData({ ...docData, Almirah_No: e.target.value })}
                    placeholder="e.g., A-01"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fileNo">File Number</Label>
                  <Input
                    id="fileNo"
                    value={docData.File_No}
                    onChange={(e) => setDocData({ ...docData, File_No: e.target.value })}
                    placeholder="e.g., F-1001"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="banking" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Banking Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="accountTitle">Account Title</Label>
                  <Input
                    id="accountTitle"
                    value={bankData.Account_Title}
                    onChange={(e) => setBankData({ ...bankData, Account_Title: e.target.value })}
                    placeholder="Enter account title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankName">Bank Name</Label>
                  <Input
                    id="bankName"
                    value={bankData.Bank_Name}
                    onChange={(e) => setBankData({ ...bankData, Bank_Name: e.target.value })}
                    placeholder="e.g., Standard Chartered Bank"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branchCode">Branch Code</Label>
                  <Input
                    id="branchCode"
                    value={bankData.Branch_Code}
                    onChange={(e) => setBankData({ ...bankData, Branch_Code: e.target.value })}
                    placeholder="Branch code"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="branchAddress">Branch Address</Label>
                  <Input
                    id="branchAddress"
                    value={bankData.Branch_Address}
                    onChange={(e) => setBankData({ ...bankData, Branch_Address: e.target.value })}
                    placeholder="Branch address"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="iban">IBAN</Label>
                  <Input
                    id="iban"
                    value={bankData.IBAN}
                    onChange={(e) => setBankData({ ...bankData, IBAN: e.target.value.toUpperCase() })}
                    placeholder="PK36SCBL0000001123456701"
                  />
                  <p className="text-xs text-slate-500">24 characters starting with PK</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="routingNumber">Routing Number</Label>
                  <Input
                    id="routingNumber"
                    value={bankData.Routing_Number}
                    onChange={(e) => setBankData({ ...bankData, Routing_Number: e.target.value })}
                    placeholder="Routing number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cnicAccountHolder">CNIC of Account Holder</Label>
                  <Input
                    id="cnicAccountHolder"
                    value={bankData.CNIC_of_Account_Holder}
                    onChange={(e) => setBankData({ ...bankData, CNIC_of_Account_Holder: e.target.value })}
                    placeholder="00000-0000000-0"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="bank">Bank Name & Branch (Legacy)</Label>
                  <Input
                    id="bank"
                    value={bankData.Bank_Name_Branch}
                    onChange={(e) => setBankData({ ...bankData, Bank_Name_Branch: e.target.value })}
                    placeholder="e.g., Standard Chartered Bank, Lahore"
                  />
                  <p className="text-xs text-slate-500">Legacy field - will be auto-generated from Bank Name and Branch Address</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!previewDoc} onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}>
        <DialogContent className="max-w-5xl p-4">
          <DialogHeader>
            <DialogTitle>{previewDoc?.name || 'Document Preview'}</DialogTitle>
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
