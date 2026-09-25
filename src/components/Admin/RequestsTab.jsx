import { useState, useEffect } from 'react'
import './RequestsTab.css'
import { apiFetch } from '../../services/http'
import { useAuth } from '../../hooks/useAuth'

const RequestsTab = () => {
    const { hasPermission } = useAuth()
    const [requests, setRequests] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('pending')
    const [selectedRequest, setSelectedRequest] = useState(null)
    const [adminNotes, setAdminNotes] = useState('')
    const [processing, setProcessing] = useState(false)
    const [childWorkspaces, setChildWorkspaces] = useState({})
    const [parentBanking, setParentBanking] = useState(null)
    const [categories, setCategories] = useState([])
    const [approvedCategory, setApprovedCategory] = useState('')

    const fetchRequests = async () => {
        setLoading(true)
        try {
            const res = await apiFetch('/admin/pending-approvals')
            const data = await res.json()
            const filtered = filter === 'all' ? data : data.filter(r => r.status === filter)
            setRequests(filtered)
        } catch (err) {
            console.error('Failed to load requests:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchRequests()
        const interval = setInterval(fetchRequests, 30000)
        return () => clearInterval(interval)
    }, [filter])

    useEffect(() => {
        apiFetch('/config/reference-data')
            .then(response => response.ok ? response.json() : Promise.reject(new Error('Configuration unavailable')))
            .then(data => setCategories(data.items?.category || []))
            .catch(error => console.error('Failed to load categories:', error))
    }, [])

    const handleApprove = async (requestId) => {
        setProcessing(true)
        try {
            const res = await apiFetch('/admin/approve-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, requestType: selectedRequest?.request_type, action: 'approve', notes: adminNotes, approvedCategory })
            })

            if (res.ok) {
                setSelectedRequest(null)
                setAdminNotes('')
                fetchRequests()
            } else {
                const data = await res.json()
                alert(data.message || 'Approval failed')
            }
        } catch (err) {
            alert('Network error')
        } finally {
            setProcessing(false)
        }
    }

    const handleReject = async (requestId) => {
        if (!adminNotes.trim()) {
            alert('Enter a parent-facing reason before rejecting this request.')
            return
        }
        if (!window.confirm('Reject this request?')) return
        setProcessing(true)
        try {
            await apiFetch('/admin/approve-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, requestType: selectedRequest?.request_type, action: 'reject', notes: adminNotes })
            })
            setSelectedRequest(null)
            fetchRequests()
        } catch (err) {
            alert('Network error')
        } finally {
            setProcessing(false)
        }
    }

    const handleRestrictedDecision = async (requestId, action) => {
        if (!adminNotes.trim()) {
            alert('Enter a parent-facing reason for this decision.')
            return
        }
        if (action === 'block' && !window.confirm('Block this parent from further online submissions?')) return
        setProcessing(true)
        try {
            const res = await apiFetch('/admin/approve-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, requestType: selectedRequest?.request_type, action, notes: adminNotes })
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.message || data.error?.message || 'Review failed')
            setSelectedRequest(null)
            setAdminNotes('')
            fetchRequests()
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Review failed')
        } finally {
            setProcessing(false)
        }
    }

    const getRequestIcon = (type) => {
        switch(type) {
            case 'parent_registration': return '👤'
            case 'child_addition': return '👶'
            default: return '📋'
        }
    }

    const formatDate = (dateStr) => new Date(dateStr).toLocaleString()

    const requestPayload = request => typeof request?.payload === 'string' ? JSON.parse(request.payload) : request?.payload || {}

    // Load the same dynamic, versioned workspace used by the parent portal.
    const fetchChildWorkspace = async (childId) => {
        try {
            const query = new URLSearchParams({ ownerType: 'child', ownerId: String(childId) })
            const res = await apiFetch(`/document-workspace?${query.toString()}`)
            const data = await res.json()
            if (!res.ok) throw new Error(data.error?.message || 'Unable to load document workspace')
            setChildWorkspaces(prev => ({ ...prev, [childId]: data }))
        } catch (err) {
            console.error('Failed to fetch child workspace:', err)
            setChildWorkspaces(prev => ({ ...prev, [childId]: { error: 'Unable to load configured documents and forms.' } }))
        }
    }

    // Fetch parent banking details
    const fetchParentBanking = async (pNoONo) => {
        try {
            const res = await apiFetch(`/banking/parent/${pNoONo}`)
            if (res.ok) {
                const data = await res.json()
                setParentBanking(data)
            } else {
                setParentBanking(null)
            }
        } catch (err) {
            console.error('Failed to fetch banking details:', err)
            setParentBanking(null)
        }
    }

    return (
        <div className="requests-tab">
            <div className="requests-header">
                <h2>Parent Portal Requests</h2>
                <div className="filter-tabs">
                    {['pending', 'approved', 'rejected', 'all'].map(f => (
                        <button
                            key={f}
                            className={filter === f ? 'active' : ''}
                            onClick={() => setFilter(f)}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                            {f === 'pending' && requests.filter(r => r.status === 'pending').length > 0 && (
                                <span className="badge">{requests.filter(r => r.status === 'pending').length}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="loading">Loading requests...</div>
            ) : requests.length === 0 ? (
                <div className="empty-state">No {filter} requests found.</div>
            ) : (
                <div className={`requests-container ${filter}`}>
                    {requests.map(req => (
                        <div 
                            key={`${req.request_type}-${req.id || req.request_id}`} 
                            className={`request-item ${req.status} ${filter}`}
                            onClick={() => {
                                 setSelectedRequest(req)
                                 const payload = requestPayload(req)
                                 setApprovedCategory(req.request_type === 'child_addition' ? (payload?.approvedCategory || payload?.disabilityCategory || '') : '')
                                 fetchParentBanking(req.p_no_o_no)
                                 if (req.request_type === 'child_addition' && payload.childId) fetchChildWorkspace(payload.childId)
                            }}
                        >
                            <div className="request-icon">{getRequestIcon(req.request_type)}</div>
                            <div className="request-info">
                                <h4>
                                    {req.parent_name || 'Unknown Parent'}
                                    {req.request_type === 'child_addition' && (
                                        <span className="child-name">
                                            → {(() => {
                                                const payload = typeof req.payload === 'string' 
                                                    ? JSON.parse(req.payload) 
                                                    : req.payload;
                                                return payload?.childName || 'Unknown Child';
                                            })()}
                                        </span>
                                    )}
                                </h4>
                                <p className="request-meta">
                                    <span className="type">{req.request_type.replace(/_/g, ' ')}</span>
                                    <span className="date">{formatDate(req.created_at || req.requested_at)}</span>
                                </p>
                                <p className="request-id">P.No: {req.p_no_o_no} | CNIC: {req.cnic}</p>
                                <span className={`origin-tag ${req.origin}`}>
                                    {req.origin === 'admin_created' ? '👤 Admin Created' : '✨ New User'}
                                </span>
                            </div>
                            <div className={`status-badge ${req.status}`}>{req.status}</div>
                        </div>
                    ))}
                </div>
            )}

            {selectedRequest && (
                <div className="modal-overlay" onClick={() => setSelectedRequest(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{getRequestIcon(selectedRequest.request_type)} {selectedRequest.request_type.replace(/_/g, ' ')}</h3>
                            <button className="close-btn" onClick={() => setSelectedRequest(null)}>×</button>
                        </div>

                        <div className="modal-body">
                            <div className="detail-grid">
                                <div className="detail-item"><label>Parent Name</label><span>{selectedRequest.parent_name}</span></div>
                                <div className="detail-item"><label>Email</label><span>{selectedRequest.email}</span></div>
                                <div className="detail-item"><label>P.No / O.No</label><span>{selectedRequest.p_no_o_no}</span></div>
                                <div className="detail-item"><label>CNIC</label><span>{selectedRequest.cnic}</span></div>
                                <div className="detail-item"><label>Rank / Rate</label><span>{selectedRequest.rank_rate || 'N/A'}</span></div>
                                <div className="detail-item"><label>Unit</label><span>{selectedRequest.unit || 'N/A'}</span></div>
                                <div className="detail-item"><label>Service Status</label><span>{selectedRequest.service_status}</span></div>
                                <div className="detail-item"><label>Origin</label>
                                    <span className={`origin-badge ${selectedRequest.origin}`}>
                                        {selectedRequest.origin === 'admin_created' ? 'Admin Created' : 'Self Registered'}
                                    </span>
                                </div>
                            </div>

                            {/* BANKING DETAILS SECTION */}
                            {parentBanking && (
                                <div className="banking-details">
                                    <h4>🏦 Banking Details</h4>
                                    <div className="detail-grid">
                                        <div className="detail-item">
                                            <label>Bank Name</label>
                                            <span>{parentBanking.Bank_Name || (parentBanking.Bank_Name_Branch && parentBanking.Bank_Name_Branch.split(',')[0]) || 'N/A'}</span>
                                        </div>
                                        <div className="detail-item">
                                            <label>Account Title</label>
                                            <span>{parentBanking.Account_Title || 'N/A'}</span>
                                        </div>
                                        <div className="detail-item">
                                            <label>Account Number</label>
                                            <span>{parentBanking.Account_Number || 'N/A'}</span>
                                        </div>
                                        <div className="detail-item">
                                            <label>Branch Code</label>
                                            <span>{parentBanking.Branch_Code || 'N/A'}</span>
                                        </div>
                                        <div className="detail-item full-width">
                                            <label>Branch Address</label>
                                            <span>{parentBanking.Branch_Address || (parentBanking.Bank_Name_Branch && parentBanking.Bank_Name_Branch.split(',')[1]) || 'N/A'}</span>
                                        </div>
                                        <div className="detail-item">
                                            <label>IBAN</label>
                                            <span>{parentBanking.IBAN || 'N/A'}</span>
                                        </div>
                                        <div className="detail-item">
                                            <label>Routing Number</label>
                                            <span>{parentBanking.Routing_Number || 'N/A'}</span>
                                        </div>
                                        <div className="detail-item">
                                            <label>CNIC of Account Holder</label>
                                            <span>{parentBanking.CNIC_of_Account_Holder || 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {selectedRequest.request_type === 'child_addition' && (
                              <div className="child-details">
                                  <h4>Child Information</h4>
                                  {(() => {
                                      const payload = typeof selectedRequest.payload === 'string' 
                                          ? JSON.parse(selectedRequest.payload) 
                                          : selectedRequest.payload
                                      
                                      return (
                                            <div className="detail-grid">
                                                <div className="detail-item"><label>Child Name</label><span>{payload.childName}</span></div>
                                                <div className="detail-item"><label>Age</label><span>{payload.age}</span></div>
                                                <div className="detail-item"><label>CNIC / B-Form</label><span>{payload.cnicBformNo}</span></div>
                                                <div className="detail-item"><label>School</label><span>{payload.school || 'N/A'}</span></div>
                                                <div className="detail-item full-width"><label>Disease / Disability</label><span>{payload.diseaseDisability || 'None'}</span></div>
                                                <div className="detail-item"><label>Parent-selected category</label><span className={`category-${payload.disabilityCategory?.toLowerCase()}`}>{payload.disabilityCategory || 'N/A'}</span></div>
                                            </div>
                                        )
                                    })()}

                                {/* DOCUMENTS SECTION */}
                                <div className="documents-section">
                                    <h4>📎 Uploaded Documents</h4>
                                    {(() => {
                                        const payload = requestPayload(selectedRequest)
                                        const workspace = childWorkspaces[payload.childId]
                                        if (!workspace) return <div className="loading">Loading configured requirements...</div>
                                        if (workspace.error) return <div className="empty-state">{workspace.error}</div>
                                        const currentFiles = new Map()
                                        for (const file of workspace.files || []) if (file.status !== 'superseded' && !currentFiles.has(file.document_type_id)) currentFiles.set(file.document_type_id, file)
                                        if ((workspace.requirements || []).length === 0 && (workspace.forms || []).length === 0) return <div className="empty-state">No document or digital-form requirements are configured for child records.</div>
                                        return <div className="admin-docs-grid">
                                            {(workspace.requirements || []).map(requirement => {
                                                const file = currentFiles.get(requirement.document_type_id)
                                                return <div key={requirement.requirement_id} className={`admin-doc-item ${file ? 'has-doc' : 'missing'}`}>
                                                    <span className="doc-label">{requirement.name}{requirement.is_required ? ' · Required' : ''}</span>
                                                    {file ? <><span className="no-doc">{file.original_file_name}</span><span className="no-doc">Version {file.version_number} · {file.status.replace('_', ' ')}</span><button className="btn-view" onClick={() => window.open(`/api/document-files/${file.id}/content`, '_blank', 'noopener,noreferrer')}>Open saved file</button></> : <span className="no-doc">Not uploaded</span>}
                                                </div>
                                            })}
                                            {(workspace.forms || []).map(form => <div key={form.template_version_id} className={`admin-doc-item ${form.submission_id ? 'has-doc' : 'missing'}`}><span className="doc-label">Digital form · {form.name}</span><span className="no-doc">{form.submission_status ? form.submission_status.replace('_', ' ') : 'Not submitted'}</span>{form.submission_id && <pre className="no-doc">{JSON.stringify(form.response_json, null, 2)}</pre>}</div>)}
                                        </div>
                                    })()}
                                </div>
                                </div>
                            )}

                            {selectedRequest.request_type === 'parent_field_change' && (() => {
                                const payload = typeof selectedRequest.payload === 'string' ? JSON.parse(selectedRequest.payload) : selectedRequest.payload
                                const currentValues = payload?.currentValues || {}
                                const proposedValues = payload?.proposedValues || {}
                                return <div className="child-details"><h4>Requested profile changes</h4><div className="detail-grid">{Object.entries(proposedValues).map(([field, value]) => <div className="detail-item" key={field}><label>{field.replace(/([A-Z])/g, ' $1')}</label><span>{String(currentValues[field] ?? 'Not set')} → <strong>{String(value ?? 'Not set')}</strong></span></div>)}</div>{payload?.parentMessage && <p className="admin-response">Parent message: {payload.parentMessage}</p>}</div>
                            })()}

                            {selectedRequest.status === 'pending' && (
                                <div className="admin-action">
                                    {selectedRequest.request_type === 'child_addition' && (
                                        <div className="detail-item">
                                            <label>Approved Category</label>
                                            <select value={approvedCategory} onChange={event => setApprovedCategory(event.target.value)}>
                                                <option value="">Choose category</option>
                                                {categories.map(category => <option key={category.id} value={category.name}>{category.name}</option>)}
                                            </select>
                                            <small>The parent choice is retained separately even when staff approves a different category.</small>
                                        </div>
                                    )}
                                    <label>Admin Notes (optional)</label>
                                    <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Add notes..." rows={3} />
                                </div>
                            )}

                            {selectedRequest.admin_response && (
                                <div className="admin-response">
                                    <label>Admin Response</label>
                                    <p>{selectedRequest.admin_response}</p>
                                </div>
                            )}
                        </div>

                        {selectedRequest.status === 'pending' && (
                            <div className="modal-footer">
                                <button className="btn-reject" onClick={() => handleReject(selectedRequest.id || selectedRequest.request_id)} disabled={processing}>Reject</button>
                                <button className="btn-reject" onClick={() => handleRestrictedDecision(selectedRequest.id || selectedRequest.request_id, 'changes_required')} disabled={processing}>Request Changes</button>
                                {hasPermission('applications.block') && <button className="btn-reject" onClick={() => handleRestrictedDecision(selectedRequest.id || selectedRequest.request_id, 'block')} disabled={processing}>Block Online Access</button>}
                                <button className="btn-approve" onClick={() => handleApprove(selectedRequest.id || selectedRequest.request_id)} disabled={processing || (selectedRequest.request_type === 'child_addition' && !approvedCategory)}>
                                    {processing ? 'Processing...' : 'Approve & Add to DB'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
        </div>
    )
}

export default RequestsTab
