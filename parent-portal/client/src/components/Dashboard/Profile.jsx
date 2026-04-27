import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import './Dashboard.css'

const Profile = () => {
  const { user, token } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      setProfile(data)
    } catch (err) {
      console.error('Failed to fetch profile:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="loading">Loading profile...</div>

  return (
    <div className="page">
      <h1>My Profile</h1>
      
      {profile && (
        <div className="profile-card">
          <div className="profile-header">
            <h2>{profile.parent_name}</h2>
            <span 
              className="origin-tag"
              style={{ backgroundColor: profile.tagColor + '20', color: profile.tagColor, border: `1px solid ${profile.tagColor}` }}
            >
              {profile.tag}
            </span>
          </div>

          <div className="detail-grid">
            <div className="detail-item">
              <label>P.No / O.No</label>
              <span>{profile.p_no_o_no}</span>
            </div>
            <div className="detail-item">
              <label>Email</label>
              <span>{profile.email}</span>
            </div>
            <div className="detail-item">
              <label>CNIC</label>
              <span>{profile.cnic}</span>
            </div>
            <div className="detail-item">
              <label>Rank / Rate</label>
              <span>{profile.rank_rate || 'N/A'}</span>
            </div>
            <div className="detail-item">
              <label>Unit</label>
              <span>{profile.unit || 'N/A'}</span>
            </div>
            <div className="detail-item">
              <label>Service Status</label>
              <span>{profile.service_status}</span>
            </div>
            <div className="detail-item">
              <label>Contact No</label>
              <span>{profile.contact_no || 'N/A'}</span>
            </div>
            <div className="detail-item">
              <label>Account Status</label>
              <span className={`status-badge ${profile.status}`}>{profile.status}</span>
            </div>
            <div className="detail-item">
              <label>Member Since</label>
              <span>{new Date(profile.created_at).toLocaleDateString()}</span>
            </div>
            {profile.approved_at && (
              <div className="detail-item">
                <label>Approved On</label>
                <span>{new Date(profile.approved_at).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Profile