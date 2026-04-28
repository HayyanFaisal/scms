import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTheme } from '../../context/ThemeContext'
import { formatCNIC, handleCNICChange, getCleanCNIC, validateCNIC } from '../../utils/cnicValidator'

const SignupForm = () => {
  const { darkMode, toggleDarkMode } = useTheme()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    parentName: '',
    pNoONo: '',
    rankRate: '',
    unit: '',
    adminAuthority: '',
    contactNo: '',
    cnic: '',
    serviceStatus: 'Serving'
  })
  const [submitted, setSubmitted] = useState(false)
  const [loginId, setLoginId] = useState(null)
  const [cnicError, setCnicError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (formData.password !== formData.confirmPassword) {
      alert('Passwords do not match')
      return
    }

    // Validate CNIC
    if (!validateCNIC(formData.cnic)) {
      setCnicError('Please enter a valid 13-digit CNIC number')
      return
    }

    try {
      const submissionData = {
        ...formData,
        cnic: getCleanCNIC(formData.cnic) // Send clean CNIC to API
      }
      
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionData)
      })

      const data = await res.json()
      if (res.ok) {
        setSubmitted(true)
        setLoginId(data.loginId)
      } else {
        alert(data.error)
      }
    } catch (err) {
      alert('Registration failed')
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-surface-low dark:bg-dark-surface flex items-center justify-center p-4">
        <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">✅</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Registration Submitted</h2>
            <p className="text-gray-600 dark:text-gray-400">Your account is pending admin approval.</p>
          </div>
          
          <div className="bg-blue-50 dark:bg-blue-900/30 border-2 border-dashed border-blue-200 dark:border-blue-700 rounded-xl p-6 mb-6">
            <label className="block text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2">Your Login ID (save this!)</label>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-300 font-mono mb-2">{loginId}</div>
            <p className="text-xs text-blue-600 dark:text-blue-400">Use this P.No/O.No to login once approved</p>
          </div>

          <Link 
            to="/login" 
            className="inline-block w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-low dark:bg-dark-surface flex items-center justify-center p-4">
      <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-xl p-8 w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">📝 Parent Registration</h2>
          <p className="bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 p-3 rounded-lg text-sm">
            Your <strong>P.No / O.No</strong> will be your permanent Login ID
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                P.No / O.No * <span className="text-blue-600 dark:text-blue-400 font-normal">(Login ID)</span>
              </label>
              <input
                type="text"
                value={formData.pNoONo}
                onChange={e => setFormData({...formData, pNoONo: e.target.value.toUpperCase()})}
                placeholder="e.g., PN-12345"
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">CNIC *</label>
              <input
                type="text"
                value={formData.cnic}
                onChange={e => handleCNICChange(e, (value) => setFormData({...formData, cnic: value}), setCnicError)}
                placeholder="xxxxx-xxxxxxx-x"
                maxLength={15} // XXXXX-XXXXXXX-X
                required
                className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  cnicError ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                }`}
              />
              {cnicError && (
                <p className="text-red-600 dark:text-red-400 text-sm">{cnicError}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Full Name *</label>
            <input
              type="text"
              value={formData.parentName}
              onChange={e => setFormData({...formData, parentName: e.target.value})}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Rank / Rate</label>
              <input
                type="text"
                value={formData.rankRate}
                onChange={e => setFormData({...formData, rankRate: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Unit</label>
              <input
                type="text"
                value={formData.unit}
                onChange={e => setFormData({...formData, unit: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Email *</label>
            <input
              type="email"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Contact No</label>
            <input
              type="tel"
              value={formData.contactNo}
              onChange={e => setFormData({...formData, contactNo: e.target.value})}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Service Status</label>
              <select
                value={formData.serviceStatus}
                onChange={e => setFormData({...formData, serviceStatus: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="Serving">Serving</option>
                <option value="Retired">Retired</option>
                <option value="Expired">Expired</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Admin Authority</label>
              <select
                value={formData.adminAuthority}
                onChange={e => setFormData({...formData, adminAuthority: e.target.value})}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="HQ COMNOR">HQ COMNOR</option>
                <option value="HQ COMKAR">HQ COMKAR</option>
                <option value="HQ COMCEP">HQ COMCEP</option>
                <option value="HQ PMSA">HQ COMLOG</option>
                <option value="HQ COMPAK">HQ COMPAK</option>
                <option value="HQ COMCOAST">HQ COMCOAST</option>
                <option value="HQ FOST">HQ FOST</option>
                <option value="HQ NSFC">HQ NSFC</option>
                <option value="HQ PMSA">HQ PMSA</option>
              </select>  
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Password *</label>
              <input
                type="password"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                required
                minLength={8}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Confirm Password *</label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            Submit for Approval
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-gray-600 dark:text-gray-400">
          Already registered? <Link to="/login" className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">Login here</Link>
        </div>
      </div>
    </div>
  )
}

export default SignupForm