import { useState } from 'react'
import { Link } from 'react-router-dom'
import './Auth.css'

const SignupForm = () => {
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (formData.password !== formData.confirmPassword) {
      alert('Passwords do not match')
      return
    }

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
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
      <div className="auth-container">
        <div className="auth-box success">
          <h2>✅ Registration Submitted</h2>
          <p>Your account is pending admin approval.</p>
          
          <div className="login-id-box">
            <label>Your Login ID (save this!)</label>
            <div className="login-id">{loginId}</div>
            <p className="hint">Use this P.No/O.No to login once approved</p>
          </div>

          <Link to="/login" className="btn-primary">Go to Login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-container">
      <div className="auth-box">
        <div className="auth-header">
          <h2>📝 Parent Registration</h2>
          <p className="notice">
            Your <strong>P.No / O.No</strong> will be your permanent Login ID
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>P.No / O.No * <span className="tag-info">(Login ID)</span></label>
              <input
                type="text"
                value={formData.pNoONo}
                onChange={e => setFormData({...formData, pNoONo: e.target.value.toUpperCase()})}
                placeholder="e.g., PN-12345"
                required
              />
            </div>
            <div className="form-group">
              <label>CNIC *</label>
              <input
                type="text"
                value={formData.cnic}
                onChange={e => setFormData({...formData, cnic: e.target.value})}
                placeholder="xxxxx-xxxxxxx-x"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Full Name *</label>
            <input
              type="text"
              value={formData.parentName}
              onChange={e => setFormData({...formData, parentName: e.target.value})}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Rank / Rate</label>
              <input
                type="text"
                value={formData.rankRate}
                onChange={e => setFormData({...formData, rankRate: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Unit</label>
              <input
                type="text"
                value={formData.unit}
                onChange={e => setFormData({...formData, unit: e.target.value})}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Email *</label>
            <input
              type="email"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
              required
            />
          </div>

          <div className="form-group">
            <label>Contact No</label>
            <input
              type="tel"
              value={formData.contactNo}
              onChange={e => setFormData({...formData, contactNo: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label>Service Status</label>
            <select
              value={formData.serviceStatus}
              onChange={e => setFormData({...formData, serviceStatus: e.target.value})}
            >
              <option value="Serving">Serving</option>
              <option value="Retired">Retired</option>
              <option value="Expired">Expired</option>
            </select>
          </div>
          <div className="form-group">
            <label>Admin Authority</label>
            <select
              value={formData.adminAuthority}
              onChange={e => setFormData({...formData, adminAuthority: e.target.value})}
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

          <div className="form-row">
            <div className="form-group">
              <label>Password *</label>
              <input
                type="password"
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                required
                minLength={8}
              />
            </div>
            <div className="form-group">
              <label>Confirm Password *</label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn-primary">Submit for Approval</button>
        </form>

        <div className="auth-footer">
          <p>Already registered? <Link to="/login">Login here</Link></p>
        </div>
      </div>
    </div>
  )
}

export default SignupForm