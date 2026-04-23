import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import './Dashboard.css'

const AddChildForm = () => {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    childName: '',
    age: '',
    cnicBformNo: '',
    diseaseDisability: '',
    disabilityCategory: '',
    school: ''
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/children', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      })

      const data = await res.json()

      if (res.ok) {
        alert('Child added! Pending admin approval.')
        navigate('/dashboard/children')
      } else {
        alert(data.error || 'Failed to add child')
      }
    } catch (err) {
      alert('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <h1>Add Child</h1>
      
      <form onSubmit={handleSubmit} className="form-card">
        <div className="form-group">
          <label>Child Name *</label>
          <input
            type="text"
            value={formData.childName}
            onChange={e => setFormData({...formData, childName: e.target.value})}
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Age</label>
            <input
              type="number"
              step="0.1"
              value={formData.age}
              onChange={e => setFormData({...formData, age: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>CNIC / B-Form No *</label>
            <input
              type="text"
              value={formData.cnicBformNo}
              onChange={e => setFormData({...formData, cnicBformNo: e.target.value})}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label>Disability Category</label>
          <select
            value={formData.disabilityCategory}
            onChange={e => setFormData({...formData, disabilityCategory: e.target.value})}
          >
            <option value="">Select Category</option>
            <option value="A">A (Severe)</option>
            <option value="B">B (Moderate)</option>
            <option value="C">C (Mild)</option>
          </select>
        </div>

        <div className="form-group">
          <label>Disease / Disability</label>
          <textarea
            value={formData.diseaseDisability}
            onChange={e => setFormData({...formData, diseaseDisability: e.target.value})}
            rows={3}
            placeholder="Describe any disease or disability"
          />
        </div>

        <div className="form-group">
          <label>School</label>
          <input
            type="text"
            value={formData.school}
            onChange={e => setFormData({...formData, school: e.target.value})}
            placeholder="School name"
          />
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Submitting...' : 'Submit for Approval'}
        </button>
      </form>
    </div>
  )
}

export default AddChildForm