import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import './Auth.css'

const LoginForm = () => {
  const [pNoONo, setPNoONo] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [tempToken, setTempToken] = useState(null)
  
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pNoONo, password })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      if (data.user.isFirstLogin) {
        setTempToken(data.token)
        setShowPasswordChange(true)
        return
      }

      login(data.token, data.user)
      navigate('/dashboard')

    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tempToken}`
        },
        body: JSON.stringify({ currentPassword: password, newPassword })
      })

      if (res.ok) {
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pNoONo, password: newPassword })
        })
        
        const loginData = await loginRes.json()
        login(loginData.token, loginData.user)
        navigate('/dashboard')
      } else {
        const data = await res.json()
        setError(data.error)
      }
    } catch (err) {
      setError('Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  if (showPasswordChange) {
    return (
      <div className="auth-container">
        <div className="auth-box">
          <div className="auth-header">
            <h2>🔐 Change Default Password</h2>
            <p className="warning-text">
              Your account was created by an administrator. 
              You must change your default password before continuing.
            </p>
          </div>

          {error && <div className="error-alert">{error}</div>}

          <form onSubmit={handlePasswordChange}>
            <div className="form-group">
              <label>Current Password (Default)</label>
              <input type="text" value={password} disabled className="disabled-input" />
            </div>

            <div className="form-group">
              <label>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min 8 characters"
                required
                minLength={8}
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Updating...' : 'Set Password & Login'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-container">
      <div className="auth-box">
        <div className="auth-header">
          <h2>👤 Parent Portal</h2>
          <p>Enter your P.No / O.No and password</p>
        </div>

        {error && <div className="error-alert">{error}</div>}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>P.No / O.No</label>
            <input
              type="text"
              value={pNoONo}
              onChange={e => setPNoONo(e.target.value.toUpperCase())}
              placeholder="e.g., PN-12345"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-footer">
          <p>Don't have an account? <Link to="/signup">Register here</Link></p>
          <p className="hint">
            Admin-created accounts use: <code>password@yourPN</code>
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginForm