import { useCallback, useEffect, useState } from 'react';
import { Download, FileCheck2, FilePlus2, Pencil, Plus, Save, Send, Trash2, Upload } from 'lucide-react';
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

type Scope = 'parent' | 'child' | 'application' | 'banking' | 'gadget';
type FieldType = 'text' | 'long_text' | 'number' | 'date' | 'checkbox' | 'radio' | 'select';
type DefinitionKind = 'document' | 'form';

interface DocumentDefinition {
  instructions?: string;
  allowedMimeTypes?: string[];
  maximumBytes?: number;
  maximumFiles?: number;
  requiresExpiry?: boolean;
  requiresReupload?: boolean;
}

interface DocumentType {
  id: number;
  code: string;
  name: string;
  description: string | null;
  entity_scope: Scope;
  fulfillment_mode: 'upload' | 'form' | 'either';
  status: string;
  current_version_number: number;
  row_version: number;
  draft_definition: DocumentDefinition;
}

interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
  helpText: string;
  validation: { minimumLength?: number; maximumLength?: number };
}

interface FormSection {
  id: string;
  title: string;
  instructions: string;
  fields: FormField[];
}

interface FormTemplate {
  id: number;
  code: string;
  name: string;
  description: string | null;
  entity_scope: Scope;
  status: string;
  current_version_number: number;
  row_version: number;
  draft_schema: { title?: string; sections?: FormSection[] };
}

interface DocumentDraft {
  id: number | null;
  rowVersion: number;
  name: string;
  code: string;
  description: string;
  entityScope: Scope;
  fulfillmentMode: 'upload' | 'form' | 'either';
  instructions: string;
  maximumMegabytes: number;
  maximumFiles: number;
  allowedMimeTypes: string[];
  requiresExpiry: boolean;
  requiresReupload: boolean;
}

interface FormDraft {
  id: number | null;
  rowVersion: number;
  name: string;
  code: string;
  description: string;
  entityScope: Scope;
  sections: FormSection[];
}

const scopes: Scope[] = ['parent', 'child', 'application', 'banking', 'gadget'];
const fieldTypes: FieldType[] = ['text', 'long_text', 'number', 'date', 'checkbox', 'radio', 'select'];
const mimeChoices = [
  ['application/pdf', 'PDF'],
  ['image/jpeg', 'JPEG'],
  ['image/png', 'PNG'],
  ['image/gif', 'GIF'],
  ['image/webp', 'WebP'],
  ['image/tiff', 'TIFF']
] as const;

const defaultField = (): FormField => ({
  key: '', label: '', type: 'text', required: false, options: [], helpText: '', validation: {}
});
const defaultSection = (): FormSection => ({ id: 'details', title: 'Details', instructions: '', fields: [defaultField()] });
const emptyDocumentDraft = (): DocumentDraft => ({
  id: null, rowVersion: 0, name: '', code: '', description: '', entityScope: 'child', fulfillmentMode: 'upload',
  instructions: '', maximumMegabytes: 5, maximumFiles: 1,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'application/pdf'], requiresExpiry: false, requiresReupload: true
});
const emptyFormDraft = (): FormDraft => ({
  id: null, rowVersion: 0, name: '', code: '', description: '', entityScope: 'child', sections: [defaultSection()]
});

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) throw new Error(await readApiError(response, 'Configuration request failed.'));
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function downloadJson(value: unknown, fileName: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function DocumentFormConfiguration() {
  const { hasPermission } = useAuth();
  const canReadDocuments = hasPermission('settings.read');
  const canManageDocuments = hasPermission('settings.manage');
  const canReadForms = hasPermission('forms.read');
  const canManageForms = hasPermission('forms.manage');
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [forms, setForms] = useState<FormTemplate[]>([]);
  const [documentDraft, setDocumentDraft] = useState<DocumentDraft>(emptyDocumentDraft);
  const [formDraft, setFormDraft] = useState<FormDraft>(emptyFormDraft);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [importState, setImportState] = useState<{ kind: DefinitionKind; json: string } | null>(null);
  const [publishTarget, setPublishTarget] = useState<{ kind: DefinitionKind; id: number } | null>(null);
  const [publish, setPublish] = useState({ reason: '', effectiveFrom: new Date().toISOString().slice(0, 10), isRequired: true, displayOrder: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [documentRows, formRows] = await Promise.all([
        canReadDocuments ? request<DocumentType[]>('/config/document-types') : Promise.resolve([]),
        canReadForms ? request<FormTemplate[]>('/config/form-templates') : Promise.resolve([])
      ]);
      setDocuments(documentRows);
      setForms(formRows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load document configuration.');
    }
  }, [canReadDocuments, canReadForms]);

  useEffect(() => { void load(); }, [load]);

  const openNewDocument = () => { setDocumentDraft(emptyDocumentDraft()); setDocumentOpen(true); setError(''); };
  const openDocument = (item: DocumentType) => {
    const definition = item.draft_definition || {};
    setDocumentDraft({
      id: item.id, rowVersion: item.row_version, name: item.name, code: item.code, description: item.description || '',
      entityScope: item.entity_scope, fulfillmentMode: item.fulfillment_mode, instructions: definition.instructions || '',
      maximumMegabytes: Math.max(1, Math.round(Number(definition.maximumBytes || 5 * 1024 * 1024) / 1024 / 1024)),
      maximumFiles: Number(definition.maximumFiles || 1),
      allowedMimeTypes: definition.allowedMimeTypes || ['image/jpeg', 'image/png', 'application/pdf'],
      requiresExpiry: Boolean(definition.requiresExpiry), requiresReupload: Boolean(definition.requiresReupload)
    });
    setDocumentOpen(true);
    setError('');
  };

  const openNewForm = () => { setFormDraft(emptyFormDraft()); setFormOpen(true); setError(''); };
  const openForm = (item: FormTemplate) => {
    const sections = (item.draft_schema.sections || []).map(section => ({
      id: section.id, title: section.title, instructions: section.instructions || '',
      fields: section.fields.map(field => ({ ...defaultField(), ...field, options: field.options || [], validation: field.validation || {} }))
    }));
    setFormDraft({
      id: item.id, rowVersion: item.row_version, name: item.name, code: item.code, description: item.description || '',
      entityScope: item.entity_scope, sections: sections.length ? sections : [defaultSection()]
    });
    setFormOpen(true);
    setError('');
  };

  const saveDocument = async () => {
    if (!documentDraft.name.trim()) return setError('Document name is required.');
    if (documentDraft.allowedMimeTypes.length === 0) return setError('Choose at least one allowed file type.');
    setBusy(true); setError(''); setNotice('');
    try {
      const body = {
        rowVersion: documentDraft.rowVersion, name: documentDraft.name, code: documentDraft.code,
        description: documentDraft.description, entityScope: documentDraft.entityScope,
        fulfillmentMode: documentDraft.fulfillmentMode,
        definition: {
          instructions: documentDraft.instructions, allowedMimeTypes: documentDraft.allowedMimeTypes,
          maximumBytes: documentDraft.maximumMegabytes * 1024 * 1024, maximumFiles: documentDraft.maximumFiles,
          requiresExpiry: documentDraft.requiresExpiry, requiresReupload: documentDraft.requiresReupload
        }
      };
      await request(documentDraft.id ? `/config/document-types/${documentDraft.id}` : '/config/document-types', {
        method: documentDraft.id ? 'PATCH' : 'POST', body: JSON.stringify(body)
      });
      setDocumentOpen(false);
      setNotice(documentDraft.id ? 'Document draft updated. Published versions were not changed.' : 'Document definition saved as a draft.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save document definition.');
    } finally { setBusy(false); }
  };

  const saveForm = async () => {
    const fields = formDraft.sections.flatMap(section => section.fields);
    if (!formDraft.name.trim() || formDraft.sections.some(section => !section.title.trim()) || fields.some(field => !field.label.trim() || !field.key.trim())) {
      return setError('Form name, section titles, field labels, and field keys are required.');
    }
    if (fields.some(field => ['radio', 'select'].includes(field.type) && field.options.every(option => !option.trim()))) {
      return setError('Every radio or select field needs at least one choice.');
    }
    const normalizedSections = formDraft.sections.map(section => ({
      ...section,
      fields: section.fields.map(field => ({ ...field, options: field.options.map(option => option.trim()).filter(Boolean) }))
    }));
    setBusy(true); setError(''); setNotice('');
    try {
      await request(formDraft.id ? `/config/form-templates/${formDraft.id}` : '/config/form-templates', {
        method: formDraft.id ? 'PATCH' : 'POST',
        body: JSON.stringify({
          rowVersion: formDraft.rowVersion, name: formDraft.name, code: formDraft.code,
          description: formDraft.description, entityScope: formDraft.entityScope,
          schema: { title: formDraft.name, sections: normalizedSections }
        })
      });
      setFormOpen(false);
      setNotice(formDraft.id ? 'Form draft updated. Published versions were not changed.' : 'Structured form saved as a draft.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save form template.');
    } finally { setBusy(false); }
  };

  const exportDefinition = async (kind: DefinitionKind, id: number, code: string) => {
    setBusy(true); setError('');
    try {
      const path = kind === 'document' ? `/config/document-types/${id}/export` : `/config/form-templates/${id}/export`;
      downloadJson(await request<unknown>(path), `${code}.${kind}.json`);
      setNotice('Configuration package exported. It contains no records or uploaded files.');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Unable to export this definition.');
    } finally { setBusy(false); }
  };

  const importDefinition = async () => {
    if (!importState) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const configurationPackage = JSON.parse(importState.json) as unknown;
      const path = importState.kind === 'document' ? '/config/document-types/import' : '/config/form-templates/import';
      await request(path, { method: 'POST', body: JSON.stringify({ package: configurationPackage }) });
      setImportState(null);
      setNotice('Configuration imported as a draft. Review it before publishing.');
      await load();
    } catch (importError) {
      setError(importError instanceof SyntaxError ? 'The selected file is not valid JSON.' : importError instanceof Error ? importError.message : 'Unable to import this definition.');
    } finally { setBusy(false); }
  };

  const publishVersion = async () => {
    if (!publishTarget || publish.reason.trim().length < 5) return setError('A publication reason of at least 5 characters is required.');
    setBusy(true); setError(''); setNotice('');
    try {
      const path = publishTarget.kind === 'document' ? `/config/document-types/${publishTarget.id}/publish` : `/config/form-templates/${publishTarget.id}/publish`;
      await request(path, { method: 'POST', body: JSON.stringify(publish) });
      setPublishTarget(null);
      setPublish(current => ({ ...current, reason: '' }));
      setNotice('A new immutable version was published.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to publish this version.');
    } finally { setBusy(false); }
  };

  const updateField = (sectionIndex: number, fieldIndex: number, update: Partial<FormField>) => {
    const sections = formDraft.sections.map((section, currentSection) => currentSection !== sectionIndex ? section : {
      ...section,
      fields: section.fields.map((field, currentField) => currentField === fieldIndex ? { ...field, ...update } : field)
    });
    setFormDraft({ ...formDraft, sections });
  };

  const changeFieldType = (sectionIndex: number, fieldIndex: number, type: FieldType) => {
    const current = formDraft.sections[sectionIndex].fields[fieldIndex];
    updateField(sectionIndex, fieldIndex, {
      type,
      options: ['radio', 'select'].includes(type) ? (current.options.length ? current.options : ['']) : []
    });
  };

  const downloadImportExample = (kind: DefinitionKind) => {
    if (kind === 'document') {
      downloadJson({
        format: 'scms-configuration', formatVersion: 1, kind: 'document_type',
        definition: {
          code: 'example_document', name: 'Example document', description: 'Replace this example before importing.',
          entityScope: 'child', fulfillmentMode: 'upload',
          settings: { instructions: 'Upload a clear copy.', allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'], maximumBytes: 5242880, maximumFiles: 1, requiresExpiry: false, requiresReupload: true }
        }
      }, 'scms-document-example.json');
      return;
    }
    downloadJson({
      format: 'scms-configuration', formatVersion: 1, kind: 'form_template',
      definition: {
        code: 'example_form', name: 'Example form', description: 'Replace this example before importing.', entityScope: 'child',
        schema: { title: 'Example form', sections: [{ id: 'details', title: 'Details', instructions: '', fields: [{ key: 'example_answer', label: 'Example answer', type: 'text', required: true, options: [], helpText: '', validation: {} }] }] }
      }
    }, 'scms-form-example.json');
  };

  const readImportFile = async (file?: File) => {
    if (!file || !importState) return;
    if (!file.name.toLowerCase().endsWith('.json')) return setError('Only .json SCMS configuration packages can be imported.');
    if (file.size > 2 * 1024 * 1024) return setError('The configuration package cannot exceed 2 MB.');
    setError('');
    setImportState({ ...importState, json: await file.text() });
  };

  return <div className="space-y-4">
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {notice && <Alert><AlertDescription>{notice}</AlertDescription></Alert>}
    <Tabs defaultValue={canReadDocuments ? 'documents' : 'forms'}>
      <TabsList>
        {canReadDocuments && <TabsTrigger value="documents">Document Requirements</TabsTrigger>}
        {canReadForms && <TabsTrigger value="forms">Digital Forms</TabsTrigger>}
      </TabsList>
      {canReadDocuments && <TabsContent value="documents">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><CardTitle>Document definitions</CardTitle><CardDescription>Edit drafts safely; publishing creates an immutable version used by records.</CardDescription></div>
              {canManageDocuments && <div className="flex gap-2">
                <Button variant="outline" onClick={() => setImportState({ kind: 'document', json: '' })}><Upload className="mr-2 h-4 w-4" />Import</Button>
                <Button onClick={openNewDocument}><FilePlus2 className="mr-2 h-4 w-4" />New document</Button>
              </div>}
            </div>
          </CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Scope</TableHead><TableHead>Mode</TableHead><TableHead>Status</TableHead><TableHead>Limits</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>{documents.map(item => <TableRow key={item.id}>
                <TableCell><div className="font-medium">{item.name}</div><div className="font-mono text-xs text-muted-foreground">{item.code}</div></TableCell>
                <TableCell>{item.entity_scope}</TableCell><TableCell>{item.fulfillment_mode}</TableCell>
                <TableCell><Badge variant={item.status === 'published' ? 'default' : 'secondary'}>{item.status} v{item.current_version_number}</Badge></TableCell>
                <TableCell>{Math.round((item.draft_definition.maximumBytes || 0) / 1024 / 1024)} MB / {item.draft_definition.maximumFiles || 1} file(s)</TableCell>
                <TableCell><div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" title="Export configuration" onClick={() => void exportDefinition('document', item.id, item.code)}><Download className="h-4 w-4" /></Button>
                  {canManageDocuments && <><Button size="icon" variant="ghost" title="Edit draft" onClick={() => openDocument(item)}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => { setPublishTarget({ kind: 'document', id: item.id }); setPublish(value => ({ ...value, isRequired: true })); }}><Send className="mr-1 h-4 w-4" />Publish</Button></>}
                </div></TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>}
      {canReadForms && <TabsContent value="forms">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><CardTitle>Structured form templates</CardTitle><CardDescription>Build digitized forms with sections, validation, and exact published versions.</CardDescription></div>
              {canManageForms && <div className="flex gap-2">
                <Button variant="outline" onClick={() => setImportState({ kind: 'form', json: '' })}><Upload className="mr-2 h-4 w-4" />Import</Button>
                <Button onClick={openNewForm}><Plus className="mr-2 h-4 w-4" />New form</Button>
              </div>}
            </div>
          </CardHeader>
          <CardContent>
            <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Scope</TableHead><TableHead>Fields</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>{forms.map(item => <TableRow key={item.id}>
                <TableCell><div className="font-medium">{item.name}</div><div className="font-mono text-xs text-muted-foreground">{item.code}</div></TableCell>
                <TableCell>{item.entity_scope}</TableCell><TableCell>{item.draft_schema.sections?.reduce((total, section) => total + section.fields.length, 0) || 0}</TableCell>
                <TableCell><Badge variant={item.status === 'published' ? 'default' : 'secondary'}>{item.status} v{item.current_version_number}</Badge></TableCell>
                <TableCell><div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" title="Export configuration" onClick={() => void exportDefinition('form', item.id, item.code)}><Download className="h-4 w-4" /></Button>
                  {canManageForms && <><Button size="icon" variant="ghost" title="Edit draft" onClick={() => openForm(item)}><Pencil className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => setPublishTarget({ kind: 'form', id: item.id })}><Send className="mr-1 h-4 w-4" />Publish</Button></>}
                </div></TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>}
    </Tabs>

    <Dialog open={documentOpen} onOpenChange={setDocumentOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>{documentDraft.id ? 'Edit document draft' : 'New document requirement'}</DialogTitle></DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label>Name</Label><Input value={documentDraft.name} onChange={event => setDocumentDraft({ ...documentDraft, name: event.target.value })} /></div>
          <div className="space-y-2"><Label>Stable code {documentDraft.id ? '' : '(optional)'}</Label><Input disabled={Boolean(documentDraft.id)} value={documentDraft.code} onChange={event => setDocumentDraft({ ...documentDraft, code: event.target.value })} /></div>
          <div className="space-y-2 md:col-span-2"><Label>Description</Label><Textarea value={documentDraft.description} onChange={event => setDocumentDraft({ ...documentDraft, description: event.target.value })} /></div>
          <div className="space-y-2"><Label>Record scope</Label><Select value={documentDraft.entityScope} onValueChange={value => setDocumentDraft({ ...documentDraft, entityScope: value as Scope })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{scopes.map(scope => <SelectItem key={scope} value={scope}>{scope}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>Completion mode</Label><Select value={documentDraft.fulfillmentMode} onValueChange={value => setDocumentDraft({ ...documentDraft, fulfillmentMode: value as DocumentDraft['fulfillmentMode'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="upload">File upload</SelectItem><SelectItem value="form">Digital form</SelectItem><SelectItem value="either">Either</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label>Maximum MB</Label><Input type="number" min="1" max="50" value={documentDraft.maximumMegabytes} onChange={event => setDocumentDraft({ ...documentDraft, maximumMegabytes: Number(event.target.value) })} /></div>
          <div className="space-y-2"><Label>Maximum files</Label><Input type="number" min="1" max="20" value={documentDraft.maximumFiles} onChange={event => setDocumentDraft({ ...documentDraft, maximumFiles: Number(event.target.value) })} /></div>
          <div className="space-y-2 md:col-span-2"><Label>Allowed file types</Label><div className="flex flex-wrap gap-4 rounded-md border p-3">{mimeChoices.map(([mime, label]) => <label key={mime} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={documentDraft.allowedMimeTypes.includes(mime)} onChange={event => setDocumentDraft({ ...documentDraft, allowedMimeTypes: event.target.checked ? [...documentDraft.allowedMimeTypes, mime] : documentDraft.allowedMimeTypes.filter(item => item !== mime) })} />{label}</label>)}</div></div>
          <div className="space-y-2 md:col-span-2"><Label>Parent instructions</Label><Textarea value={documentDraft.instructions} onChange={event => setDocumentDraft({ ...documentDraft, instructions: event.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={documentDraft.requiresExpiry} onChange={event => setDocumentDraft({ ...documentDraft, requiresExpiry: event.target.checked })} />Expiry date required</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={documentDraft.requiresReupload} onChange={event => setDocumentDraft({ ...documentDraft, requiresReupload: event.target.checked })} />Allow version replacement</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setDocumentOpen(false)}>Cancel</Button><Button disabled={busy} onClick={() => void saveDocument()}><Save className="mr-2 h-4 w-4" />Save draft</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={formOpen} onOpenChange={setFormOpen}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader><DialogTitle>{formDraft.id ? 'Edit digital form draft' : 'New digital form'}</DialogTitle></DialogHeader>
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-w-0 space-y-2"><Label>Name</Label><Input value={formDraft.name} onChange={event => setFormDraft({ ...formDraft, name: event.target.value })} /></div>
            <div className="min-w-0 space-y-2"><Label>Stable code {formDraft.id ? '' : '(optional)'}</Label><Input disabled={Boolean(formDraft.id)} value={formDraft.code} onChange={event => setFormDraft({ ...formDraft, code: event.target.value })} /></div>
            <div className="min-w-0 space-y-2"><Label>Record scope</Label><Select value={formDraft.entityScope} onValueChange={value => setFormDraft({ ...formDraft, entityScope: value as Scope })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{scopes.map(scope => <SelectItem key={scope} value={scope}>{scope}</SelectItem>)}</SelectContent></Select></div>
            <div className="min-w-0 space-y-2"><Label>Description</Label><Input value={formDraft.description} onChange={event => setFormDraft({ ...formDraft, description: event.target.value })} /></div>
          </div>
        <div className="min-w-0 space-y-4">
          <div className="flex items-center justify-between"><Label>Sections and fields</Label><Button size="sm" variant="outline" onClick={() => setFormDraft({ ...formDraft, sections: [...formDraft.sections, { ...defaultSection(), id: `section_${formDraft.sections.length + 1}`, title: `Section ${formDraft.sections.length + 1}` }] })}><Plus className="mr-1 h-4 w-4" />Add section</Button></div>
          {formDraft.sections.map((section, sectionIndex) => <Card key={`${section.id}-${sectionIndex}`}>
            <CardHeader className="pb-3"><div className="flex gap-2"><Input placeholder="Section title" value={section.title} onChange={event => { const sections = formDraft.sections.map((item, index) => index === sectionIndex ? { ...item, title: event.target.value } : item); setFormDraft({ ...formDraft, sections }); }} /><Button size="icon" variant="ghost" disabled={formDraft.sections.length === 1} onClick={() => setFormDraft({ ...formDraft, sections: formDraft.sections.filter((_, index) => index !== sectionIndex) })}><Trash2 className="h-4 w-4" /></Button></div><Input placeholder="Section instructions (optional)" value={section.instructions} onChange={event => { const sections = formDraft.sections.map((item, index) => index === sectionIndex ? { ...item, instructions: event.target.value } : item); setFormDraft({ ...formDraft, sections }); }} /></CardHeader>
            <CardContent className="space-y-3">
              {section.fields.map((field, fieldIndex) => <div key={fieldIndex} className="grid min-w-0 gap-3 rounded-lg border p-4 md:grid-cols-2 xl:grid-cols-12">
                <Input className="min-w-0 xl:col-span-3" placeholder="Question label" value={field.label} onChange={event => updateField(sectionIndex, fieldIndex, { label: event.target.value })} />
                <Input className="min-w-0 font-mono xl:col-span-2" placeholder="field_key" value={field.key} onChange={event => updateField(sectionIndex, fieldIndex, { key: event.target.value })} />
                <Select value={field.type} onValueChange={value => changeFieldType(sectionIndex, fieldIndex, value as FieldType)}><SelectTrigger className="w-full min-w-0 xl:col-span-2"><SelectValue /></SelectTrigger><SelectContent>{fieldTypes.map(type => <SelectItem key={type} value={type}>{type.replace('_', ' ')}</SelectItem>)}</SelectContent></Select>
                <Input className="min-w-0 xl:col-span-3" placeholder="Help shown below the field" value={field.helpText} onChange={event => updateField(sectionIndex, fieldIndex, { helpText: event.target.value })} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={field.required} onChange={event => updateField(sectionIndex, fieldIndex, { required: event.target.checked })} />Required</label>
                <Button size="icon" variant="ghost" disabled={section.fields.length === 1} onClick={() => { const sections = formDraft.sections.map((item, index) => index === sectionIndex ? { ...item, fields: item.fields.filter((_, current) => current !== fieldIndex) } : item); setFormDraft({ ...formDraft, sections }); }}><Trash2 className="h-4 w-4" /></Button>
                {['radio', 'select'].includes(field.type) && <div className="space-y-2 md:col-span-2 xl:col-span-12"><Label className="text-xs">Choices shown to the parent</Label>{field.options.map((option, optionIndex) => <div key={optionIndex} className="flex gap-2"><Input placeholder={`Choice ${optionIndex + 1}`} value={option} onChange={event => updateField(sectionIndex, fieldIndex, { options: field.options.map((item, index) => index === optionIndex ? event.target.value : item) })} /><Button type="button" size="icon" variant="ghost" disabled={field.options.length === 1} onClick={() => updateField(sectionIndex, fieldIndex, { options: field.options.filter((_, index) => index !== optionIndex) })}><Trash2 className="h-4 w-4" /></Button></div>)}<Button type="button" size="sm" variant="outline" onClick={() => updateField(sectionIndex, fieldIndex, { options: [...field.options, ''] })}><Plus className="mr-1 h-4 w-4" />Add choice</Button></div>}
                {['text', 'long_text'].includes(field.type) && <><div className="space-y-1 md:col-span-1 xl:col-span-3"><Label className="text-xs">Minimum characters</Label><Input type="number" min="0" value={field.validation.minimumLength ?? ''} onChange={event => updateField(sectionIndex, fieldIndex, { validation: { ...field.validation, minimumLength: event.target.value ? Number(event.target.value) : undefined } })} /></div><div className="space-y-1 md:col-span-1 xl:col-span-3"><Label className="text-xs">Maximum characters</Label><Input type="number" min="1" value={field.validation.maximumLength ?? ''} onChange={event => updateField(sectionIndex, fieldIndex, { validation: { ...field.validation, maximumLength: event.target.value ? Number(event.target.value) : undefined } })} /></div></>}
              </div>)}
              <Button size="sm" variant="outline" onClick={() => { const sections = formDraft.sections.map((item, index) => index === sectionIndex ? { ...item, fields: [...item.fields, defaultField()] } : item); setFormDraft({ ...formDraft, sections }); }}><Plus className="mr-1 h-4 w-4" />Add field</Button>
            </CardContent>
          </Card>)}
        </div>
        </div>
        <aside className="h-fit space-y-4 rounded-xl border bg-muted/30 p-4 text-sm lg:sticky lg:top-0">
          <div><h3 className="font-semibold">Form builder guide</h3><p className="mt-1 text-muted-foreground">This creates an on-screen form. It does not upload a scanned document.</p></div>
          <dl className="space-y-3 text-xs">
            <div><dt className="font-semibold">Section</dt><dd className="text-muted-foreground">Groups related questions under one heading.</dd></div>
            <div><dt className="font-semibold">Question label</dt><dd className="text-muted-foreground">The wording a parent sees, such as “Current school year”.</dd></div>
            <div><dt className="font-semibold">Field key</dt><dd className="text-muted-foreground">A permanent internal name such as <code>school_year</code>. Use letters, numbers, and underscores; do not change it after publishing.</dd></div>
            <div><dt className="font-semibold">Field type</dt><dd className="text-muted-foreground">Text is one line, long text is a paragraph, radio shows choices, and select shows a drop-down.</dd></div>
            <div><dt className="font-semibold">Required</dt><dd className="text-muted-foreground">Prevents submission until the parent answers the question.</dd></div>
            <div><dt className="font-semibold">Help text</dt><dd className="text-muted-foreground">A short instruction shown below the question.</dd></div>
            <div><dt className="font-semibold">Draft and publish</dt><dd className="text-muted-foreground">Saving changes only updates the draft. Parents see it after you publish a version with a reason.</dd></div>
          </dl>
        </aside>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button><Button disabled={busy} onClick={() => void saveForm()}><FileCheck2 className="mr-2 h-4 w-4" />Save draft</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(importState)} onOpenChange={open => { if (!open) setImportState(null); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Import {importState?.kind === 'document' ? 'document definition' : 'digital form'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-4 text-sm"><p className="font-medium">Accepted file: SCMS configuration package (.json), maximum 2 MB</p><p className="mt-1 text-muted-foreground">Use Export on an existing definition to create one. Excel, Word, PDF, and ordinary JSON forms are not accepted here. The imported item is validated and saved as an inactive draft; it cannot affect parents until separately published.</p><Button className="mt-3" type="button" size="sm" variant="outline" onClick={() => importState && downloadImportExample(importState.kind)}><Download className="mr-2 h-4 w-4" />Download example</Button></div>
          <Input type="file" accept="application/json,.json" onChange={event => void readImportFile(event.target.files?.[0])} />
          <Textarea className="min-h-48 font-mono text-xs" placeholder="Or paste configuration JSON here" value={importState?.json || ''} onChange={event => setImportState(current => current ? { ...current, json: event.target.value } : current)} />
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setImportState(null)}>Cancel</Button><Button disabled={busy || !importState?.json.trim()} onClick={() => void importDefinition()}><Upload className="mr-2 h-4 w-4" />Import as draft</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(publishTarget)} onOpenChange={open => { if (!open) setPublishTarget(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Publish immutable version</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Effective from</Label><Input type="date" value={publish.effectiveFrom} onChange={event => setPublish({ ...publish, effectiveFrom: event.target.value })} /></div>
          {publishTarget?.kind === 'document' && <><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={publish.isRequired} onChange={event => setPublish({ ...publish, isRequired: event.target.checked })} />Required for the record</label><div className="space-y-2"><Label>Display order</Label><Input type="number" value={publish.displayOrder} onChange={event => setPublish({ ...publish, displayOrder: Number(event.target.value) })} /></div></>}
          <div className="space-y-2"><Label>Publication reason</Label><Textarea value={publish.reason} onChange={event => setPublish({ ...publish, reason: event.target.value })} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setPublishTarget(null)}>Cancel</Button><Button disabled={busy || publish.reason.trim().length < 5} onClick={() => void publishVersion()}><Send className="mr-2 h-4 w-4" />Publish</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
