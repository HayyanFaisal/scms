import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import './Dashboard.css'

const ChildrenList = () => {
  const { token } = useAuth()
  const [children, setChildren] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchChildren()
  }, [])

  const fetchChildren = async () => {
    try {
      const res = await fetch('/api/children', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      setChildren(data)
    } catch (err) {
      console.error('Failed to fetch children:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="loading">Loading children...</div>

  return (
    <div className="page">
      <h1>My Children</h1>
      
      {children.length === 0 ? (
        <div className="empty-state">
          <p>No children added yet.</p>
          <a href="/dashboard/add-child" className="btn-primary">Add Your First Child</a>
        </div>
      ) : (
        <div className="children-grid">
          {children.map(child => (
            <div key={child.child_id} className="child-card">
              <h3>{child.child_name}</h3>
              <div className="child-details">
                <p><strong>Age:</strong> {child.age}</p>
                <p><strong>CNIC/B-Form:</strong> {child.cnic_bform_no}</p>
                <p><strong>School:</strong> {child.school || 'N/A'}</p>
                <p><strong>Assessment Performa:</strong> {child.assessment_performa || 'N/A'}</p>
                <p><strong>Application Form:</strong> {child.application_form || 'N/A'}</p>
                <p><strong>Disability Certificate:</strong> {child.disability_certificate || 'N/A'}</p>
                <p><strong>CNIC/B-Form Pic:</strong> {child.cnic_bform_no_pic}</p>
                <p><strong>Disease/Disability:</strong> {child.disease_disability || 'None'}</p>
                <p>
                  <strong>Category:</strong>{' '}
                  <span className={`category-${child.disability_category?.toLowerCase()}`}>
                    {child.disability_category || 'N/A'}
                  </span>
                </p>
                <p>
                  <strong>Status:</strong>{' '}
                  <span className={`sync-status ${child.sync_status}`}>
                    {child.sync_status === 'synced' ? '✅ Approved' : '⏳ Pending Approval'}
                  </span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ChildrenList