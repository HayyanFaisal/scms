import { useCallback, useEffect, useMemo, useState } from 'react'
import PortalToast from '../PortalToast'

const RecordRequirements = ({
  token,
  childId,
  childName,
  identifier,
  ownerType = 'child',
  ownerId,
  recordName,
  validAfter,
  readOnly = false,
  onBack,
  onFinish,
  finishLabel = 'Finish registration',
  showNavigation = true
}) => {
  const effectiveOwnerId = ownerId ?? childId
  const effectiveRecordName = recordName ?? childName ?? 'this record'
  const [workspace, setWorkspace] = useState(null)
  const [threads, setThreads] = useState([])
  const [message, setMessage] = useState('')
  const [responses, setResponses] = useState({})
  const [expiryByType, setExpiryByType] = useState({})
  const [busy, setBusy] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [previewFile, setPreviewFile] = useState(null)
  const dismissError = useCallback(() => setError(''), [])
  const dismissNotice = useCallback(() => setNotice(''), [])

  const load = useCallback(async () => {
    setError('')
    try {
      const query = `ownerType=${encodeURIComponent(ownerType)}&ownerId=${encodeURIComponent(effectiveOwnerId)}`
      const [response, threadResponse] = await Promise.all([
        fetch(`/api/document-workspace?${query}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/message-threads?${query}`, { headers: { Authorization: `Bearer ${token}` } })
      ])
      const body = await response.json()
      const threadBody = await threadResponse.json()
      if (!response.ok) throw new Error(body.error || 'Unable to load requirements.')
      if (!threadResponse.ok) throw new Error(threadBody.error || 'Unable to load messages.')
      setWorkspace(body)
      setThreads(threadBody)
      const initial = {}
      for (const form of body.forms || []) initial[form.template_version_id] = form.response_json || {}
      setResponses(initial)
    } catch (loadError) {
      setError(loadError.message || 'Unable to load requirements.')
    }
  }, [effectiveOwnerId, ownerType, token])

  useEffect(() => { void load() }, [load])
  useEffect(() => () => { if (previewFile?.url) URL.revokeObjectURL(previewFile.url) }, [previewFile])

  const filesByType = useMemo(() => {
    const map = new Map()
    for (const file of workspace?.files || []) {
      const isCurrent = !validAfter || new Date(file.uploaded_at).getTime() >= new Date(validAfter).getTime()
      if (isCurrent && file.status !== 'superseded' && !map.has(file.document_type_id)) map.set(file.document_type_id, file)
    }
    return map
  }, [validAfter, workspace])

  const upload = async (requirement, file) => {
    if (!file) return
    const key = `doc-${requirement.document_type_id}`
    setBusy(current => ({ ...current, [key]: true })); setError(''); setNotice('')
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('documentTypeId', requirement.document_type_id)
      body.append('ownerType', ownerType)
      body.append('ownerId', effectiveOwnerId)
      if (expiryByType[requirement.document_type_id]) body.append('expiresOn', expiryByType[requirement.document_type_id])
      const response = await fetch('/api/document-files', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Upload failed.')
      setNotice(`${requirement.name} is securely saved and awaiting review.`)
      await load()
    } catch (uploadError) {
      setError(uploadError.message || 'Upload failed.')
    } finally {
      setBusy(current => ({ ...current, [key]: false }))
    }
  }

  const preview = async file => {
    setError('')
    try {
      const response = await fetch(`/api/document-files/${file.id}/content`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error('Preview unavailable.')
      const blob = await response.blob()
      setPreviewFile({ url: URL.createObjectURL(blob), mime: blob.type, name: file.original_file_name })
    } catch (previewError) {
      setError(previewError.message || 'Preview unavailable.')
    }
  }

  const submitForm = async form => {
    const key = `form-${form.template_version_id}`
    setBusy(current => ({ ...current, [key]: true })); setError(''); setNotice('')
    try {
      const response = await fetch('/api/form-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ownerType, ownerId: effectiveOwnerId, templateVersionId: form.template_version_id, response: responses[form.template_version_id] || {} })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Form submission failed.')
      setNotice(`${form.name} is saved and awaiting review.`)
      await load()
    } catch (submitError) {
      setError(submitError.message || 'Form submission failed.')
    } finally {
      setBusy(current => ({ ...current, [key]: false }))
    }
  }

  const setField = (versionId, fieldKey, value) => setResponses(current => ({
    ...current, [versionId]: { ...(current[versionId] || {}), [fieldKey]: value }
  }))

  const sendMessage = async () => {
    if (!message.trim()) return
    const currentThread = threads[0]
    setBusy(current => ({ ...current, message: true })); setError('')
    try {
      const path = currentThread ? `/api/message-threads/${currentThread.id}/messages` : '/api/message-threads'
      const payload = currentThread
        ? { body: message.trim() }
        : { ownerType, ownerId: effectiveOwnerId, subject: `Documents for ${effectiveRecordName}`, body: message.trim() }
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Unable to send message.') }
      setMessage('')
      setNotice('Message sent to staff.')
      await load()
    } catch (messageError) {
      setError(messageError.message || 'Unable to send message.')
    } finally {
      setBusy(current => ({ ...current, message: false }))
    }
  }

  const renderField = (form, field) => {
    const value = responses[form.template_version_id]?.[field.key] ?? (field.type === 'checkbox' ? false : '')
    const common = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white'
    if (field.type === 'long_text') return <textarea rows="3" className={common} value={value} onChange={event => setField(form.template_version_id, field.key, event.target.value)} />
    if (field.type === 'checkbox') return <input type="checkbox" checked={Boolean(value)} onChange={event => setField(form.template_version_id, field.key, event.target.checked)} />
    if (field.type === 'radio') return <div className="flex flex-wrap gap-3">{field.options.map(option => <label key={option} className="flex items-center gap-2 rounded-lg border px-3 py-2"><input type="radio" name={`${form.template_version_id}-${field.key}`} checked={value === option} onChange={() => setField(form.template_version_id, field.key, option)} />{option}</label>)}</div>
    if (field.type === 'select') return <select className={common} value={value} onChange={event => setField(form.template_version_id, field.key, event.target.value)}><option value="">Choose an option</option>{field.options.map(option => <option key={option}>{option}</option>)}</select>
    return <input className={common} type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} value={value} onChange={event => setField(form.template_version_id, field.key, event.target.value)} />
  }

  if (!workspace) return <div className="p-8 text-slate-500">Loading configured requirements…{error && <p className="mt-3 text-rose-600">{error}</p>}</div>

  const requiredDocuments = workspace.requirements.filter(item => item.is_required && ['upload', 'either'].includes(item.fulfillment_mode))
  const satisfiedDocuments = requiredDocuments.filter(item => filesByType.has(item.document_type_id)).length

  return <div className="w-full max-w-7xl space-y-6">
    <PortalToast message={error} type="error" onClose={dismissError} duration={8000} />
    <PortalToast message={notice} type="success" onClose={dismissNotice} />
    <div><h1 className="text-2xl font-bold text-slate-800 dark:text-white">Documents & Digital Forms</h1><p className="text-slate-500 dark:text-slate-400">Complete the configured requirements for {effectiveRecordName}{identifier ? ` (${identifier})` : ''}.</p></div>
    {readOnly && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">This submission is locked while it is under review or already finalized. You can still preview evidence and message staff. Edit the record or wait for a correction request before replacing evidence.</div>}
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100"><strong>How saving works:</strong> a document is saved as soon as its upload completes, so refreshing will not remove it. A replacement creates a new version and keeps the older version in history. Digital-form answers are saved only when you press <strong>Submit form</strong>.</div>
    <div className="rounded-xl border bg-white p-4 dark:bg-slate-800"><div className="flex justify-between text-sm"><span>Required uploads saved</span><strong>{satisfiedDocuments}/{requiredDocuments.length}</strong></div></div>

    <div className="grid gap-4 md:grid-cols-2">{workspace.requirements.map(requirement => {
      const file = filesByType.get(requirement.document_type_id)
      const definition = requirement.definition || {}
      const replacementAllowed = !readOnly && (!file || definition.requiresReupload)
      const expiryMissing = definition.requiresExpiry && !expiryByType[requirement.document_type_id]
      return <div key={requirement.requirement_id} className="space-y-3 rounded-2xl border bg-white p-5 dark:bg-slate-800">
        <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{requirement.name}</h3><p className="text-sm text-slate-500 dark:text-slate-400">{definition.instructions || requirement.description}</p></div>{requirement.is_required && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-100">Required</span>}</div>
        {file ? <div className="space-y-2"><div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-700"><div className="font-medium">{file.original_file_name}</div><div className="text-xs text-slate-500 dark:text-slate-300">Saved · Version {file.version_number} · {file.status.replace('_', ' ')}</div>{file.review_reason && <div className="mt-1 text-rose-600 dark:text-rose-300">{file.review_reason}</div>}</div><button className="text-sm font-medium text-blue-700 hover:underline dark:text-blue-300" onClick={() => void preview(file)}>Preview saved version</button></div> : <p className="text-sm text-slate-500">No file submitted.</p>}
        {definition.requiresExpiry && replacementAllowed && <label className="block space-y-1 text-sm"><span>Expiry date</span><input type="date" required className="w-full rounded-lg border px-3 py-2 dark:bg-slate-700" value={expiryByType[requirement.document_type_id] || ''} onChange={event => setExpiryByType(current => ({ ...current, [requirement.document_type_id]: event.target.value }))} /></label>}
        {['upload', 'either'].includes(requirement.fulfillment_mode) && replacementAllowed && <label className={`block rounded-xl border-2 border-dashed p-4 text-center text-sm ${expiryMissing ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer text-blue-700 dark:text-blue-300'}`}><input hidden type="file" accept={(definition.allowedMimeTypes || []).join(',')} disabled={busy[`doc-${requirement.document_type_id}`] || expiryMissing} onChange={event => void upload(requirement, event.target.files?.[0])} />{busy[`doc-${requirement.document_type_id}`] ? 'Uploading…' : file ? 'Upload replacement version' : 'Choose file'}</label>}
        {file && !definition.requiresReupload && <p className="text-xs text-slate-500">This requirement permits one submission only. Contact staff if it must be reopened.</p>}
      </div>
    })}</div>

    {workspace.forms.map(form => {
      const canSubmit = !readOnly && (!form.submission_id || form.submission_status === 'changes_required')
      const buttonText = !form.submission_id ? 'Submit form' : form.submission_status === 'changes_required' ? 'Submit corrected version' : form.submission_status === 'verified' ? 'Verified' : 'Awaiting staff review'
      return <div key={form.template_version_id} className="space-y-5 rounded-2xl border bg-white p-6 dark:bg-slate-800"><div><h2 className="text-lg font-semibold">{form.name}</h2><p className="text-sm text-slate-500">Version {form.version_number}{form.submission_status ? ` · ${form.submission_status.replace('_', ' ')}` : ''}</p>{form.review_reason && <p className="text-sm text-rose-600 dark:text-rose-300">{form.review_reason}</p>}</div>{form.schema_json.sections?.map(section => <div key={section.id} className="space-y-4"><div><h3 className="font-medium">{section.title}</h3>{section.instructions && <p className="text-sm text-slate-500">{section.instructions}</p>}</div>{section.fields.map(field => <div key={field.key} className="space-y-1.5 text-sm"><label className="block">{field.label}{field.required && <span className="text-rose-500"> *</span>}</label>{renderField(form, field)}{field.helpText && <span className="block text-xs text-slate-500">{field.helpText}</span>}</div>)}</div>)}<button disabled={!canSubmit || busy[`form-${form.template_version_id}`]} onClick={() => void submitForm(form)} className="rounded-xl bg-blue-600 px-5 py-2.5 text-white disabled:cursor-not-allowed disabled:bg-slate-400 disabled:opacity-80">{buttonText}</button></div>
    })}

    <div className="space-y-4 rounded-2xl border bg-white p-6 dark:bg-slate-800"><div><h2 className="text-lg font-semibold">Messages</h2><p className="text-sm text-slate-500">Ask staff about a requirement or respond to a correction request.</p></div><div className="max-h-64 space-y-2 overflow-y-auto">{threads.flatMap(thread => thread.messages || []).map(item => <div key={item.id} className={`rounded-xl p-3 text-sm ${item.sender_type === 'parent' ? 'ml-8 bg-blue-50 dark:bg-blue-900/20' : 'mr-8 bg-slate-100 dark:bg-slate-700'}`}><div>{item.body}</div><div className="mt-1 text-xs text-slate-500">{item.sender_type} · {new Date(item.created_at).toLocaleString()}</div></div>)}{threads.length === 0 && <p className="text-sm text-slate-500">No messages yet.</p>}</div><div className="flex gap-2"><textarea rows="2" className="flex-1 rounded-xl border p-3 dark:bg-slate-700" value={message} onChange={event => setMessage(event.target.value)} placeholder="Write a message" /><button disabled={busy.message || !message.trim()} onClick={() => void sendMessage()} className="rounded-xl bg-blue-600 px-5 text-white disabled:opacity-50">Send</button></div></div>
    {workspace.requirements.length === 0 && workspace.forms.length === 0 && <div className="rounded-xl border p-8 text-center text-slate-500">No document or digital-form requirements are currently configured for this record type.</div>}
    {showNavigation && <div className="flex justify-between">{onBack ? <button onClick={onBack} className="rounded-xl bg-slate-100 px-5 py-3 text-slate-800 dark:bg-slate-700 dark:text-white">Back</button> : <span />}{onFinish && <button disabled={satisfiedDocuments < requiredDocuments.length} onClick={onFinish} className="rounded-xl bg-emerald-600 px-6 py-3 text-white disabled:cursor-not-allowed disabled:opacity-50">{finishLabel}</button>}</div>}

    {previewFile && <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/75 p-4" role="dialog" aria-modal="true" aria-label={previewFile.name} onMouseDown={event => { if (event.target === event.currentTarget) setPreviewFile(null) }}><div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"><div className="flex items-center justify-between gap-3 border-b p-4"><div className="min-w-0 truncate font-semibold">{previewFile.name}</div><div className="flex shrink-0 gap-2"><a href={previewFile.url} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">Open tab</a><a href={previewFile.url} download={previewFile.name} className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">Download</a><button onClick={() => setPreviewFile(null)} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">Close</button></div></div><div className="min-h-0 flex-1 bg-slate-100 p-3 dark:bg-slate-950">{previewFile.mime === 'application/pdf' ? <iframe className="h-full w-full rounded-lg bg-white" src={previewFile.url} title={previewFile.name} /> : /^image\/(jpeg|png|gif|webp)$/.test(previewFile.mime) ? <img className="h-full w-full object-contain" src={previewFile.url} alt={previewFile.name} /> : <div className="flex h-full items-center justify-center"><div className="max-w-md rounded-2xl bg-white p-8 text-center shadow dark:bg-slate-800"><span className="material-symbols-outlined text-5xl text-slate-400">draft</span><h3 className="mt-3 font-semibold">Preview unavailable for this file type</h3><p className="mt-2 text-sm text-slate-500">The file is safely stored. Use Open tab or Download to view it in a compatible application.</p></div></div>}</div></div></div>}
  </div>
}

export default RecordRequirements
