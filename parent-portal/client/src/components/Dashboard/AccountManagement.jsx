import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'

const AccountManagement = ({ forcePasswordChange = false }) => {
  const { token, logout } = useAuth()
  const { darkMode } = useTheme()
  const [activeTab, setActiveTab] = useState(forcePasswordChange ? 'security' : 'profile')
  const [profileData, setProfileData] = useState({
    parentName: '',
    cnic: '',
    rankRate: '',
    unit: '',
    adminAuthority: '',
    serviceStatus: '',
    email: '',
    contactNo: '',
    address: ''
  })
  const [profileConfiguration, setProfileConfiguration] = useState({ policies: [], references: {} })
  const [changeRequests, setChangeRequests] = useState([])
  const [parentMessage, setParentMessage] = useState('')
  const [recordState, setRecordState] = useState('complete')
  const [missingFields, setMissingFields] = useState([])
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // Load user profile data
  useEffect(() => {
    const loadProfile = async () => {
      try {
        if (!token) return

        const [res, configRes] = await Promise.all([
          fetch('/api/profile', { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch('/api/profile/configuration', { headers: { 'Authorization': `Bearer ${token}` } })
        ])
        
        if (res.ok) {
          const data = await res.json()
          setProfileData({
            parentName: data.parent_name || '',
            cnic: data.cnic || '',
            rankRate: data.rank_rate || '',
            unit: data.unit || '',
            adminAuthority: data.admin_authority || '',
            serviceStatus: data.service_status || '',
            email: data.email || '',
            contactNo: data.contactNo || data.contact_no || '',
            address: data.address || ''
          })
          setChangeRequests(data.change_requests || [])
          setRecordState(data.record_state || 'complete')
          setMissingFields(data.missing_fields || [])
        }
        if (configRes.ok) setProfileConfiguration(await configRes.json())
      } catch (error) {
        console.error('Failed to load profile:', error)
      }
    }

    loadProfile()
  }, [token])

  const handleProfileUpdate = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const res = await fetch('/api/profile/update', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...profileData, parentMessage })
      })

      const data = await res.json()
      if (res.ok) {
        setMessage(data.message || 'Profile updated successfully!')
        setParentMessage('')
        setTimeout(() => setMessage(''), 3000)
      } else {
        setMessage(data.error || 'Failed to update profile')
      }
    } catch (error) {
      setMessage('Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage('New passwords do not match')
      return
    }

    if (!passwordData.currentPassword || !passwordData.newPassword) {
      setMessage('All password fields are required')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        })
      })

      const data = await res.json()
      if (res.ok) {
        setMessage('Password changed. Please sign in again.')
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
        setTimeout(() => logout(), 1200)
      } else {
        setMessage(data.error || 'Failed to change password')
      }
    } catch (error) {
      setMessage('Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  const policyFor = (fieldCode) => profileConfiguration.policies.find(policy => policy.fieldCode === fieldCode)
  const policyLabel = (fieldCode) => {
    const mode = policyFor(fieldCode)?.updateMode
    return mode === 'approval' ? 'Requires staff approval' : mode === 'locked' ? 'Locked' : 'Updates immediately'
  }
  const referenceOptions = (type) => profileConfiguration.references?.[type] || []

  return (
    <div className="min-h-screen bg-surface-low dark:bg-dark-surface p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-primary dark:bg-dark-primary p-6">
            <h1 className="text-2xl font-bold text-white">Account Management</h1>
            <p className="text-primary-light dark:text-dark-primary-light text-sm mt-2">
              Manage your profile, security, and contact information
            </p>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-surface-high dark:border-dark-surface-high">
            {!forcePasswordChange && <button
              onClick={() => setActiveTab('profile')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'profile'
                  ? 'text-primary dark:text-dark-primary border-b-2 border-primary dark:border-dark-primary'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border-b-2 border-transparent'
              }`}
            >
              Profile
            </button>}
            <button
              onClick={() => setActiveTab('security')}
              className={`${forcePasswordChange ? 'w-full' : 'flex-1'} px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'security'
                  ? 'text-primary dark:text-dark-primary border-b-2 border-primary dark:border-dark-primary'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border-b-2 border-transparent'
              }`}
            >
              Security
            </button>
          </div>

          {/* Content */}
          <div className="p-8">
            {message && (
              <div className={`mb-6 p-4 rounded-lg ${
                message.startsWith('Password changed') || message.includes('successfully')
                  ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                  : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              }`}>
                {message}
              </div>
            )}

            {!forcePasswordChange && recordState !== 'complete' && (
              <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                <strong>Profile {recordState.replace('_', ' ')}</strong>
                {missingFields.length > 0 && <p className="mt-1 text-sm">Missing: {missingFields.join(', ')}</p>}
              </div>
            )}

          {!forcePasswordChange && activeTab === 'profile' && (
              <form onSubmit={handleProfileUpdate} className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Profile Information</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name <span className="text-xs font-normal text-gray-500">({policyLabel('parentName')})</span></label>
                      <input type="text" value={profileData.parentName} disabled={policyFor('parentName')?.updateMode === 'locked'} onChange={e => setProfileData({...profileData, parentName: e.target.value})} className="w-full px-4 py-2 border border-surface-high dark:border-dark-surface-high rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-gray-100 disabled:opacity-60" />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">CNIC <span className="text-xs font-normal text-gray-500">({policyLabel('cnic')})</span></label>
                      <input type="text" value={profileData.cnic} disabled={policyFor('cnic')?.updateMode === 'locked'} onChange={e => setProfileData({...profileData, cnic: e.target.value})} className="w-full px-4 py-2 border border-surface-high dark:border-dark-surface-high rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-gray-100 disabled:opacity-60" />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Rank / Rate <span className="text-xs font-normal text-gray-500">({policyLabel('rankRate')})</span></label>
                      <select value={profileData.rankRate} disabled={policyFor('rankRate')?.updateMode === 'locked'} onChange={e => setProfileData({...profileData, rankRate: e.target.value})} className="w-full px-4 py-2 border border-surface-high dark:border-dark-surface-high rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-gray-100 disabled:opacity-60"><option value="">Select rank/rate</option>{referenceOptions('rank').map(item => <option key={item.code} value={item.name}>{item.name}</option>)}</select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Unit <span className="text-xs font-normal text-gray-500">({policyLabel('unit')})</span></label>
                      <select value={profileData.unit} disabled={policyFor('unit')?.updateMode === 'locked'} onChange={e => setProfileData({...profileData, unit: e.target.value})} className="w-full px-4 py-2 border border-surface-high dark:border-dark-surface-high rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-gray-100 disabled:opacity-60"><option value="">Select unit</option>{referenceOptions('unit').map(item => <option key={item.code} value={item.name}>{item.name}</option>)}</select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Administrative Authority <span className="text-xs font-normal text-gray-500">({policyLabel('adminAuthority')})</span></label>
                      <select value={profileData.adminAuthority} disabled={policyFor('adminAuthority')?.updateMode === 'locked'} onChange={e => setProfileData({...profileData, adminAuthority: e.target.value})} className="w-full px-4 py-2 border border-surface-high dark:border-dark-surface-high rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-gray-100 disabled:opacity-60"><option value="">No authority</option>{referenceOptions('authority').map(item => <option key={item.code} value={item.name}>{item.name}</option>)}</select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Service Status <span className="text-xs font-normal text-gray-500">({policyLabel('serviceStatus')})</span></label>
                      <select value={profileData.serviceStatus} disabled={policyFor('serviceStatus')?.updateMode === 'locked'} onChange={e => setProfileData({...profileData, serviceStatus: e.target.value})} className="w-full px-4 py-2 border border-surface-high dark:border-dark-surface-high rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-gray-100 disabled:opacity-60"><option value="">Select status</option>{referenceOptions('service_status').map(item => <option key={item.code} value={item.name}>{item.name}</option>)}</select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={profileData.email}
                        onChange={(e) => setProfileData({...profileData, email: e.target.value})}
                        className="w-full px-4 py-2 border border-surface-high dark:border-dark-surface-high rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-dark-primary"
                        placeholder="your.email@example.com"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Contact Number
                      </label>
                      <input
                        type="tel"
                        value={profileData.contactNo}
                        onChange={(e) => setProfileData({...profileData, contactNo: e.target.value})}
                        className="w-full px-4 py-2 border border-surface-high dark:border-dark-surface-high rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-dark-primary"
                        placeholder="+92 300 1234567"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Residential Address
                    </label>
                    <textarea
                      value={profileData.address}
                      onChange={(e) => setProfileData({...profileData, address: e.target.value})}
                      rows={3}
                      className="w-full px-4 py-2 border border-surface-high dark:border-dark-surface-high rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-dark-primary"
                      placeholder="123 Main Street, Apt 4B, City, State 12345"
                    />
                  </div>

                  <div className="mt-6 space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Message for reviewing staff</label>
                    <textarea value={parentMessage} onChange={e => setParentMessage(e.target.value)} rows={2} maxLength={1000} className="w-full px-4 py-2 border border-surface-high dark:border-dark-surface-high rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-gray-100" placeholder="Explain a transfer, promotion, corrected CNIC, or other controlled change" />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-6 py-3 bg-primary dark:bg-dark-primary text-white font-semibold rounded-lg hover:bg-primary-dark dark:hover:bg-dark-primary-light disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Updating...' : 'Update Profile'}
                </button>
              </form>
            )}

            {!forcePasswordChange && activeTab === 'profile' && changeRequests.length > 0 && (
              <div className="mt-8 border-t border-surface-high pt-6 dark:border-dark-surface-high">
                <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">Recent change requests</h3>
                <div className="space-y-3">{changeRequests.map(request => <div key={request.id} className="rounded-lg border border-surface-high p-3 text-sm dark:border-dark-surface-high"><div className="flex justify-between gap-3"><span className="font-medium">Request #{request.id}</span><span className="capitalize">{request.status.replace('_', ' ')}</span></div>{request.reviewReason && <p className="mt-2 text-gray-600 dark:text-gray-400">{request.reviewReason}</p>}</div>)}</div>
              </div>
            )}

            {activeTab === 'security' && (
              <form onSubmit={handlePasswordChange} className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Change Password</h3>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Current Password
                      </label>
                      <input
                        type="password"
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                        className="w-full px-4 py-2 border border-surface-high dark:border-dark-surface-high rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-dark-primary"
                        placeholder="Enter current password"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        New Password
                      </label>
                      <input
                        type="password"
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                        className="w-full px-4 py-2 border border-surface-high dark:border-dark-surface-high rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-dark-primary"
                        placeholder="Enter new password"
                        minLength={8}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                        className="w-full px-4 py-2 border border-surface-high dark:border-dark-surface-high rounded-lg bg-white dark:bg-dark-surface text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary dark:focus:ring-dark-primary"
                        placeholder="Confirm new password"
                        minLength={8}
                      />
                    </div>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg mb-6">
                    <h4 className="font-semibold text-blue-700 dark:text-blue-400 mb-2">Password Requirements:</h4>
                    <ul className="text-sm text-blue-600 dark:text-blue-400 space-y-1">
                      <li>• At least 8 characters long</li>
                      <li>• Include uppercase and lowercase letters</li>
                      <li>• Include at least one number</li>
                      <li>• Include at least one special character</li>
                    </ul>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full px-6 py-3 bg-primary dark:bg-dark-primary text-white font-semibold rounded-lg hover:bg-primary-dark dark:hover:bg-dark-primary-light disabled:opacity-50 transition-colors"
                  >
                    {loading ? 'Changing Password...' : 'Change Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AccountManagement
