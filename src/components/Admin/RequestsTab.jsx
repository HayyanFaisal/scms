import { useState, useEffect } from 'react'
import { db } from '@/services/database'
import './RequestsTab.css'

const RequestsTab = () => {
    const [requests, setRequests] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('pending')
    const [selectedRequest, setSelectedRequest] = useState(null)
    const [adminNotes, setAdminNotes] = useState('')
    const [processing, setProcessing] = useState(false)

    const fetchRequests = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/admin/pending-approvals')
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

    const handleApprove = async (requestId) => {
        setProcessing(true)
        try {
            const res = await fetch('/api/admin/approve-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, action: 'approve', notes: adminNotes })
            })

            if (res.ok) {
                setSelectedRequest(null)
                setAdminNotes('')
                await db.refreshFromServer()
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
        if (!window.confirm('Reject this request?')) return
        setProcessing(true)
        try {
            await fetch('/api/admin/approve-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestId, action: 'reject', notes: adminNotes || 'Rejected by admin' })
            })
            setSelectedRequest(null)
            await db.refreshFromServer()
            fetchRequests()
        } catch (err) {
            alert('Network error')
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
                <div className="requests-list">
                    {requests.map(req => (
                        <div 
                            key={req.request_id} 
                            className={`request-card ${req.status}`}
                            onClick={() => setSelectedRequest(req)}
                        >
                            <div className="request-icon">{getRequestIcon(req.request_type)}</div>
                            <div className="request-info">
                                <h4>{req.parent_name}</h4>
                                <p className="request-meta">
                                    <span className="type">{req.request_type.replace(/_/g, ' ')}</span>
                                    <span className="date">{formatDate(req.requested_at)}</span>
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
                                                <div className="detail-item"><label>Category</label><span className={`category-${payload.disabilityCategory?.toLowerCase()}`}>{payload.disabilityCategory || 'N/A'}</span></div>
                                            </div>
                                        )
                                    })()}
                                </div>
                            )}

                            {selectedRequest.status === 'pending' && (
                                <div className="admin-action">
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
                                <button className="btn-reject" onClick={() => handleReject(selectedRequest.request_id)} disabled={processing}>Reject</button>
                                <button className="btn-approve" onClick={() => handleApprove(selectedRequest.request_id)} disabled={processing}>
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