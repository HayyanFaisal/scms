import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'

const Profile = () => {
  const { user, token } = useAuth()
  const { darkMode } = useTheme()
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

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="text-gray-500 dark:text-gray-400">Loading profile...</div>
    </div>
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">My Profile</h1>
        <p className="text-gray-600 dark:text-gray-400">View and manage your personal information</p>
      </div>
      
      {profile && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-8 border-b border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{profile.parent_name}</h2>
              <span 
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: profile.tagColor + '20', color: profile.tagColor, border: `1px solid ${profile.tagColor}` }}
              >
                {profile.tag}
              </span>
            </div>
          </div>

          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">P.No / O.No</label>
                <p className="text-gray-900 dark:text-gray-100 font-medium">{profile.p_no_o_no}</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</label>
                <p className="text-gray-900 dark:text-gray-100 font-medium">{profile.email}</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">CNIC</label>
                <p className="text-gray-900 dark:text-gray-100 font-medium">{profile.cnic}</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rank / Rate</label>
                <p className="text-gray-900 dark:text-gray-100 font-medium">{profile.rank_rate || 'N/A'}</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Unit</label>
                <p className="text-gray-900 dark:text-gray-100 font-medium">{profile.unit || 'N/A'}</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Service Status</label>
                <p className="text-gray-900 dark:text-gray-100 font-medium">{profile.service_status}</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contact No</label>
                <p className="text-gray-900 dark:text-gray-100 font-medium">{profile.contact_no || 'N/A'}</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Account Status</label>
                <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                  profile.status === 'approved' 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : profile.status === 'pending'
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {profile.status}
                </span>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Member Since</label>
                <p className="text-gray-900 dark:text-gray-100 font-medium">{new Date(profile.created_at).toLocaleDateString()}</p>
              </div>
              {profile.approved_at && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Approved On</label>
                  <p className="text-gray-900 dark:text-gray-100 font-medium">{new Date(profile.approved_at).toLocaleDateString()}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Profile