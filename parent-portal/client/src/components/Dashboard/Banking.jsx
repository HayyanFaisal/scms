import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import './Banking.css'

const Banking = () => {
  const { user, token } = useAuth()
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
      <div className="banking-loading">
        <div className="spinner"></div>
        <p>Loading banking details...</p>
      </div>
    )
  }

  return (
    <div className="banking-container">
      <div className="banking-header">
        <h1>Banking Details</h1>
        <p>Manage your banking information for grant payments</p>
      </div>

      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message">{error}</div>}

      {!bankingDetails && !isEditing && (
        <div className="no-banking">
          <div className="no-banking-icon">🏦</div>
          <h3>No Banking Details</h3>
          <p>You haven't added your banking details yet. Add them to receive grant payments directly to your bank account.</p>
          <button onClick={() => setIsEditing(true)} className="btn-primary">
            Add Banking Details
          </button>
        </div>
      )}

      {(bankingDetails || isEditing) && (
        <div className="banking-form-container">
          <div className="form-header">
            <h2>{bankingDetails ? 'Banking Information' : 'Add Banking Details'}</h2>
            {!isEditing && bankingDetails && (
              <div className="form-actions">
                <button onClick={handleEdit} className="btn-secondary">Edit</button>
                <button onClick={handleDelete} className="btn-danger">Delete</button>
              </div>
            )}
          </div>

          {isEditing ? (
            <form onSubmit={handleSubmit} className="banking-form">
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="bank_name">Bank Name *</label>
                  <input
                    type="text"
                    id="bank_name"
                    name="bank_name"
                    value={formData.bank_name}
                    onChange={handleInputChange}
                    required
                    placeholder="e.g., Habib Bank Limited"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="account_title">Account Title *</label>
                  <input
                    type="text"
                    id="account_title"
                    name="account_title"
                    value={formData.account_title}
                    onChange={handleInputChange}
                    required
                    placeholder="Account holder name"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="account_number">Account Number *</label>
                  <input
                    type="text"
                    id="account_number"
                    name="account_number"
                    value={formData.account_number}
                    onChange={handleInputChange}
                    required
                    placeholder="Your bank account number"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="branch_code">Branch Code</label>
                  <input
                    type="text"
                    id="branch_code"
                    name="branch_code"
                    value={formData.branch_code}
                    onChange={handleInputChange}
                    placeholder="Bank branch code"
                  />
                </div>

                <div className="form-group full-width">
                  <label htmlFor="branch_address">Branch Address</label>
                  <textarea
                    id="branch_address"
                    name="branch_address"
                    value={formData.branch_address}
                    onChange={handleInputChange}
                    placeholder="Complete branch address"
                    rows={3}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="iban">IBAN (Optional)</label>
                  <input
                    type="text"
                    id="iban"
                    name="iban"
                    value={formData.iban}
                    onChange={handleInputChange}
                    placeholder="International Bank Account Number"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="routing_number">Routing Number (Optional)</label>
                  <input
                    type="text"
                    id="routing_number"
                    name="routing_number"
                    value={formData.routing_number}
                    onChange={handleInputChange}
                    placeholder="Bank routing number"
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="button" onClick={handleCancel} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : (bankingDetails ? 'Update' : 'Save')}
                </button>
              </div>
            </form>
          ) : (
            <div className="banking-details-view">
              <div className="details-grid">
                <div className="detail-item">
                  <label>Bank Name</label>
                  <span>{bankingDetails.bank_name}</span>
                </div>
                <div className="detail-item">
                  <label>Account Title</label>
                  <span>{bankingDetails.account_title}</span>
                </div>
                <div className="detail-item">
                  <label>Account Number</label>
                  <span>{bankingDetails.account_number}</span>
                </div>
                <div className="detail-item">
                  <label>Branch Code</label>
                  <span>{bankingDetails.branch_code || 'N/A'}</span>
                </div>
                <div className="detail-item full-width">
                  <label>Branch Address</label>
                  <span>{bankingDetails.branch_address || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <label>IBAN</label>
                  <span>{bankingDetails.iban || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <label>Routing Number</label>
                  <span>{bankingDetails.routing_number || 'N/A'}</span>
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
