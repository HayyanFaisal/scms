import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'

const Banking = () => {
  const { user, token } = useAuth()
  const { darkMode } = useTheme()
  const [bankingDetails, setBankingDetails] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    bank_name: '',
    account_title: '',
    account_number: '',
    branch_code: '',
    branch_address: '',
    iban: '',
    routing_number: ''
  })

  useEffect(() => {
    fetchBankingDetails()
  }, [])

  const fetchBankingDetails = async () => {
    try {
      const response = await fetch('/api/parent/banking', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      
      if (response.ok) {
        if (data && data.length > 0) {
          const bankingData = data[0]
          setBankingDetails(bankingData)
          setFormData({
            bank_name: bankingData.bank_name || '',
            account_title: bankingData.account_title || '',
            account_number: bankingData.account_number || '',
            branch_code: bankingData.branch_code || '',
            branch_address: bankingData.branch_address || '',
            iban: bankingData.iban || '',
            routing_number: bankingData.routing_number || ''
          })
        }
      } else {
        setError('Failed to fetch banking details')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    try {
      const url = bankingDetails ? '/api/parent/banking/update' : '/api/parent/banking/add'
      const method = bankingDetails ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (response.ok) {
        setMessage(bankingDetails ? 'Banking details updated successfully!' : 'Banking details added successfully!')
        setBankingDetails(data)
        setFormData({
          bank_name: data.bank_name || '',
          account_title: data.account_title || '',
          account_number: data.account_number || '',
          branch_code: data.branch_code || '',
          branch_address: data.branch_address || '',
          iban: data.iban || '',
          routing_number: data.routing_number || ''
        })
        setIsEditing(false)
      } else {
        setError(data.message || 'Failed to save banking details')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = () => {
    setIsEditing(true)
    setError('')
    setMessage('')
  }

  const handleCancel = () => {
    if (bankingDetails) {
      setFormData(bankingDetails)
    } else {
      setFormData({
        bank_name: '',
        account_title: '',
        account_number: '',
        branch_code: '',
        branch_address: '',
        iban: '',
        routing_number: ''
      })
    }
    setIsEditing(false)
    setError('')
    setMessage('')
  }

  const handleDelete = async () => {
    if (!bankingDetails) return
    
    if (!confirm('Are you sure you want to delete your banking details?')) {
      return
    }

    try {
      const response = await fetch('/api/parent/banking/delete', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        setBankingDetails(null)
        setFormData({
          bank_name: '',
          account_title: '',
          account_number: '',
          branch_code: '',
          branch_address: '',
          iban: '',
          routing_number: ''
        })
        setMessage('Banking details deleted successfully!')
      } else {
        setError('Failed to delete banking details')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 dark:text-gray-400">Loading banking details...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Banking Details</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage your banking information for grant payments</p>
      </div>

      {message && (
        <div className="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 font-medium">
          {message}
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 font-medium">
          {error}
        </div>
      )}

      {!bankingDetails && !isEditing && (
        <div className="text-center p-12 bg-gray-50 dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600">
          <div className="text-6xl mb-4 opacity-50">🏦</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Banking Details</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            You haven't added your banking details yet. Add them to receive grant payments directly to your bank account.
          </p>
          <button 
            onClick={() => setIsEditing(true)} 
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Add Banking Details
          </button>
        </div>
      )}

      {(bankingDetails || isEditing) && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                {bankingDetails ? 'Banking Information' : 'Add Banking Details'}
              </h2>
              {!isEditing && bankingDetails && (
                <div className="flex gap-2">
                  <button onClick={handleEdit} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors">
                    Edit
                  </button>
                  <button onClick={handleDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors">
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>

          {isEditing ? (
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="bank_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Bank Name *
                  </label>
                  <input
                    type="text"
                    id="bank_name"
                    name="bank_name"
                    value={formData.bank_name}
                    onChange={handleInputChange}
                    required
                    placeholder="e.g., Habib Bank Limited"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="account_title" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Account Title *
                  </label>
                  <input
                    type="text"
                    id="account_title"
                    name="account_title"
                    value={formData.account_title}
                    onChange={handleInputChange}
                    required
                    placeholder="Account holder name"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="account_number" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Account Number *
                  </label>
                  <input
                    type="text"
                    id="account_number"
                    name="account_number"
                    value={formData.account_number}
                    onChange={handleInputChange}
                    required
                    placeholder="Your bank account number"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="branch_code" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Branch Code
                  </label>
                  <input
                    type="text"
                    id="branch_code"
                    name="branch_code"
                    value={formData.branch_code}
                    onChange={handleInputChange}
                    placeholder="Bank branch code"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label htmlFor="branch_address" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Branch Address
                  </label>
                  <textarea
                    id="branch_address"
                    name="branch_address"
                    value={formData.branch_address}
                    onChange={handleInputChange}
                    placeholder="Complete branch address"
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="iban" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    IBAN (Optional)
                  </label>
                  <input
                    type="text"
                    id="iban"
                    name="iban"
                    value={formData.iban}
                    onChange={handleInputChange}
                    placeholder="International Bank Account Number"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="routing_number" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Routing Number (Optional)
                  </label>
                  <input
                    type="text"
                    id="routing_number"
                    name="routing_number"
                    value={formData.routing_number}
                    onChange={handleInputChange}
                    placeholder="Bank routing number"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex justify-between gap-4 mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button 
                  type="button" 
                  onClick={handleCancel} 
                  className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={saving} 
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : (bankingDetails ? 'Update' : 'Save')}
                </button>
              </div>
            </form>
          ) : (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Bank Name</label>
                  <p className="text-gray-900 dark:text-gray-100 font-medium">{bankingDetails.bank_name}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Account Title</label>
                  <p className="text-gray-900 dark:text-gray-100 font-medium">{bankingDetails.account_title}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Account Number</label>
                  <p className="text-gray-900 dark:text-gray-100 font-medium">{bankingDetails.account_number}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Branch Code</label>
                  <p className="text-gray-900 dark:text-gray-100 font-medium">{bankingDetails.branch_code || 'N/A'}</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Branch Address</label>
                  <p className="text-gray-900 dark:text-gray-100 font-medium">{bankingDetails.branch_address || 'N/A'}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">IBAN</label>
                  <p className="text-gray-900 dark:text-gray-100 font-medium">{bankingDetails.iban || 'N/A'}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Routing Number</label>
                  <p className="text-gray-900 dark:text-gray-100 font-medium">{bankingDetails.routing_number || 'N/A'}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Banking
