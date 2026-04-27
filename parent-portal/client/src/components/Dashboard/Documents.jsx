import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import './Dashboard.css'

const DEFAULT_ADMIN_API_BASE = 'http://127.0.0.1:3001/api'

const normalizeApiBase = (value) => value.replace(/\/+$/, '')

const Documents = () => {
  const { user } = useAuth()
  const [docType, setDocType] = useState('')
  const [file, setFile] = useState(null)
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [previewDoc, setPreviewDoc] = useState(null)

  const parentNo = user?.pNoONo

  const adminApiBase = useMemo(() => {
    const configured = import.meta.env.VITE_ADMIN_API_URL || DEFAULT_ADMIN_API_BASE
    return normalizeApiBase(configured)
  }, [])

  const uploadsBase = useMemo(
    () => adminApiBase.replace(/\/api\/?$/, ''),
    [adminApiBase]
  )

  const loadDocuments = async () => {
    if (!parentNo) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${adminApiBase}/parents/${encodeURIComponent(parentNo)}/scanned-documents`)
      if (!res.ok) {
        throw new Error('Failed to load uploaded documents')
      }

      const data = await res.json()
      setDocuments(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load uploaded documents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDocuments()
  }, [parentNo])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!parentNo) {
      setError('Parent identity is missing. Please login again.')
      return
    }

    if (!file) {
      setError('Please choose a document image first.')
      return
    }

    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (docType.trim()) {
        formData.append('docType', docType.trim())
      }

      const res = await fetch(`${adminApiBase}/parents/${encodeURIComponent(parentNo)}/scanned-documents`, {
        method: 'POST',
        body: formData
      })

      if (!res.ok) {
        const message = await res.text()
        throw new Error(message || 'Document upload failed')
      }

      setSuccess('Document uploaded successfully and linked to your profile.')
      setFile(null)
      setDocType('')

      const fileInput = document.getElementById('portal-document-file-input')
      if (fileInput) {
        fileInput.value = ''
      }

      await loadDocuments()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Document upload failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <h1>My Documents</h1>

      <div className="form-card">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Document Type (Optional)</label>
            <input
              type="text"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              placeholder="e.g., CNIC Front, Disability Certificate"
              maxLength={120}
            />
          </div>

          <div className="form-group">
            <label>Upload Image</label>
            <input
              id="portal-document-file-input"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              required
            />
            <small className="help-text">Allowed: jpg, png, webp, gif, tiff. Max size: 8MB.</small>
          </div>

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Uploading...' : 'Upload Document'}
          </button>
        </form>

        {error && <div className="error-alert">{error}</div>}
        {success && <div className="success-alert">{success}</div>}
      </div>

      <div className="documents-panel">
        <div className="documents-panel-header">
          <h3>Uploaded Documents</h3>
          <button className="btn-secondary" onClick={loadDocuments} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <div className="loading">Loading documents...</div>
        ) : documents.length === 0 ? (
          <div className="empty-state">
            <p>No documents uploaded yet.</p>
          </div>
        ) : (
          <div className="documents-grid">
            {documents.map((doc) => (
              <button
                className="document-card"
                key={doc.Document_File_ID}
                type="button"
                onClick={() =>
                  setPreviewDoc({
                    name: doc.Original_File_Name,
                    url: `${uploadsBase}${doc.Storage_Path}`,
                    type: doc.Doc_Type || 'Uploaded Document'
                  })
                }
              >
                <div className="document-title">{doc.Doc_Type || 'Uploaded Document'}</div>
                <div className="document-name">{doc.Original_File_Name}</div>
                <div className="document-meta">
                  <span>{Math.round((doc.File_Size_Bytes || 0) / 1024)} KB</span>
                  <span>{new Date(doc.Uploaded_At).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {previewDoc && (
        <div className="document-preview-overlay" onClick={() => setPreviewDoc(null)}>
          <div className="document-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="document-preview-header">
              <div>
                <p className="document-preview-type">{previewDoc.type}</p>
                <h3>{previewDoc.name}</h3>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setPreviewDoc(null)}>
                Close
              </button>
            </div>

            <div className="document-preview-body">
              <img src={previewDoc.url} alt={previewDoc.name} className="document-preview-image" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Documents
