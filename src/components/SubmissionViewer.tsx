import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, FileText, Loader2, X } from 'lucide-react';
import { apiFetch, readApiError } from '@/services/http';

type FormField = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  helpText?: string;
  options?: string[];
};

type FormSchema = {
  sections?: Array<{
    id?: string;
    title?: string;
    instructions?: string;
    fields?: FormField[];
  }>;
};

export type SubmissionViewerItem =
  | { kind: 'document'; id: number; title: string; fileName?: string; status?: string; version?: number }
  | { kind: 'form'; title: string; schema: FormSchema | string | null; response: Record<string, unknown> | string | null; status?: string; version?: number };

function parseObject<T>(value: T | string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not answered';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function FormFieldPreview({ field, value }: { field: FormField; value: unknown }) {
  const inputClass = 'w-full rounded-md border bg-muted/30 px-3 py-2 text-sm text-foreground disabled:cursor-default disabled:opacity-100';
  if (field.type === 'checkbox') {
    return <label className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm"><input type="checkbox" checked={value === true} disabled />{value === true ? 'Selected' : 'Not selected'}</label>;
  }
  if (field.type === 'radio') {
    return <div className="flex flex-wrap gap-2">{(field.options || []).map(option => <label key={option} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${value === option ? 'border-primary bg-primary/5' : 'bg-muted/20'}`}><input type="radio" checked={value === option} disabled />{option}</label>)}</div>;
  }
  if (field.type === 'select') {
    return <select className={inputClass} value={valueText(value)} disabled><option>{valueText(value)}</option></select>;
  }
  if (field.type === 'long_text') {
    return <textarea className={`${inputClass} min-h-20 resize-none`} value={valueText(value)} readOnly />;
  }
  return <input className={inputClass} value={valueText(value)} readOnly />;
}

function SubmissionViewerContent({ item, onClose }: { item: SubmissionViewerItem; onClose: () => void }) {
  const [documentUrl, setDocumentUrl] = useState('');
  const [mimeType, setMimeType] = useState('');
  const [loading, setLoading] = useState(item.kind === 'document');
  const [error, setError] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [item, onClose]);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    if (item.kind !== 'document') return () => undefined;
    void apiFetch(`/document-files/${item.id}/content`)
      .then(async response => {
        if (!response.ok) throw new Error(await readApiError(response, 'The saved file could not be opened.'));
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (active) {
          setDocumentUrl(objectUrl);
          setMimeType(blob.type || response.headers.get('content-type') || 'application/octet-stream');
        }
      })
      .catch(fetchError => { if (active) setError(fetchError instanceof Error ? fetchError.message : 'The saved file could not be opened.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item]);

  const formData = useMemo(() => {
    if (item.kind !== 'form') return null;
    return {
      schema: parseObject<FormSchema>(item.schema, { sections: [] }),
      response: parseObject<Record<string, unknown>>(item.response, {})
    };
  }, [item]);

  const imagePreviewable = /^image\/(jpeg|png|gif|webp)$/.test(mimeType);
  const pdfPreviewable = mimeType === 'application/pdf';

  return <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="submission-viewer-title" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
      <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><FileText className="h-5 w-5 shrink-0 text-primary" /><h2 id="submission-viewer-title" className="truncate text-lg font-semibold">{item.title}</h2></div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{item.kind === 'document' ? item.fileName || 'Uploaded file' : 'Submitted digital form'}{item.version ? ` · Version ${item.version}` : ''}{item.status ? ` · ${item.status.replaceAll('_', ' ')}` : ''}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {item.kind === 'document' && documentUrl && <>
            <a className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent" href={documentUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Open tab</a>
            <a className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium hover:bg-accent" href={documentUrl} download={item.fileName || 'document'}><Download className="h-4 w-4" />Download</a>
          </>}
          <button className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent" onClick={onClose} aria-label="Close preview"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4 md:p-6">
        {item.kind === 'document' && <>
          {loading && <div className="flex h-full items-center justify-center gap-3 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" />Loading the saved file…</div>}
          {error && <div className="mx-auto max-w-xl rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-center text-sm text-destructive">{error}</div>}
          {!loading && !error && documentUrl && pdfPreviewable && <iframe className="h-full min-h-[65vh] w-full rounded-xl border bg-white" src={documentUrl} title={item.fileName || item.title} />}
          {!loading && !error && documentUrl && imagePreviewable && <div className="flex min-h-full items-center justify-center"><img className="max-h-full max-w-full rounded-xl border bg-white object-contain shadow-sm" src={documentUrl} alt={item.fileName || item.title} /></div>}
          {!loading && !error && documentUrl && !pdfPreviewable && !imagePreviewable && <div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border bg-background p-10 text-center"><FileText className="mb-4 h-14 w-14 text-muted-foreground" /><h3 className="font-semibold">Preview is not available for this file type</h3><p className="mt-2 text-sm text-muted-foreground">The file is stored correctly. Use Open tab or Download to view it in a compatible application.</p></div>}
        </>}

        {item.kind === 'form' && formData && <div className="mx-auto max-w-4xl space-y-4">
          {(formData.schema.sections || []).map((section, sectionIndex) => <section key={section.id || sectionIndex} className="rounded-xl border bg-background p-5 shadow-sm">
            <div className="mb-4 border-b pb-3"><h3 className="font-semibold">{section.title || `Section ${sectionIndex + 1}`}</h3>{section.instructions && <p className="mt-1 text-sm text-muted-foreground">{section.instructions}</p>}</div>
            <div className="grid gap-4 md:grid-cols-2">{(section.fields || []).map(field => <div key={field.key} className={field.type === 'long_text' ? 'space-y-1.5 md:col-span-2' : 'space-y-1.5'}><label className="text-sm font-medium">{field.label}{field.required && <span className="text-destructive"> *</span>}</label><FormFieldPreview field={field} value={formData.response[field.key]} />{field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}</div>)}</div>
          </section>)}
          {(formData.schema.sections || []).length === 0 && <div className="rounded-xl border bg-background p-5"><h3 className="mb-3 font-semibold">Submitted values</h3><div className="grid gap-3 md:grid-cols-2">{Object.entries(formData.response).map(([key, value]) => <div key={key} className="rounded-lg border bg-muted/20 p-3"><div className="text-xs font-medium uppercase text-muted-foreground">{key}</div><div className="mt-1 text-sm">{valueText(value)}</div></div>)}</div></div>}
        </div>}
      </div>
    </div>
  </div>;
}

export function SubmissionViewer({ item, onClose }: { item: SubmissionViewerItem | null; onClose: () => void }) {
  if (!item) return null;
  const viewerKey = item.kind === 'document' ? `document-${item.id}` : `form-${item.title}-${item.version || 0}`;
  return <SubmissionViewerContent key={viewerKey} item={item} onClose={onClose} />;
}
