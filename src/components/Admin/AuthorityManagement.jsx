import { useState, useEffect } from 'react'
import './AuthorityManagement.css'
import { apiFetch } from '../../services/http'
import { useAuth } from '../../hooks/useAuth'

const AuthorityManagement = () => {
    const { hasPermission } = useAuth()
    const canResetAuthorityPassword = hasPermission('authority_accounts.reset_password')
    const [authorities, setAuthorities] = useState([])
    const [selectedAuthority, setSelectedAuthority] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        fetchAuthorities()
    }, [])

    const fetchAuthorities = async () => {
        try {
            const response = await apiFetch('/auth/authorities')
            const data = await response.json()
            if (!response.ok) throw new Error(data?.error?.message || data?.message || 'Failed to fetch authorities')
            setAuthorities(data)
        } catch (error) {
            setError('Failed to fetch authorities')
        }
    }

    const handlePasswordUpdate = async (e) => {
        e.preventDefault()
        if (!canResetAuthorityPassword) return
        setLoading(true)
        setError('')
        setMessage('')

        if (newPassword !== confirmPassword) {
            setError('New passwords do not match')
            setLoading(false)
            return
        }

        if (newPassword.length < 12) {
            setError('Temporary password must be at least 12 characters long')
            setLoading(false)
            return
        }

        try {
            const response = await apiFetch('/auth/reset-authority-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    authority: selectedAuthority,
                    newPassword
                })
            })

            const data = await response.json()

            if (response.ok) {
                setMessage('Temporary authority password issued. It expires in 24 hours and must be changed after sign-in.')
                setNewPassword('')
                setConfirmPassword('')
                fetchAuthorities() // Refresh the list
            } else {
                setError(data?.error?.message || data.message || 'Failed to reset password')
            }
        } catch (error) {
            setError('Network error. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const selectedAuthData = authorities.find(auth => auth.value === selectedAuthority)

    return (
        <div className="authority-management">
            <div className="management-header">
                <h1>Authority Management</h1>
                <p>Issue temporary authority credentials without needing the previous password</p>
            </div>

            <div className="management-content">
                <div className="authorities-overview">
                    <h2>Authorities Overview</h2>
                    <div className="authorities-grid">
                        {authorities.map(auth => (
                            <div key={auth.value} className="authority-card">
                                <h3>{auth.label}</h3>
                                <div className="auth-status">
                                    <span className={`password-status ${auth.hasCredential ? 'custom' : 'default'}`}>
                                        {!auth.hasCredential ? 'Credential Not Set' : auth.mustChangePassword ? 'Temporary Password Active' : 'Credential Active'}
                                    </span>
                                </div>
                                <div className="auth-actions">
                                    <button 
                                        onClick={() => setSelectedAuthority(auth.value)}
                                        className="manage-btn"
                                        disabled={!canResetAuthorityPassword}
                                    >
                                        {canResetAuthorityPassword ? 'Reset Password' : 'View Only'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="password-update-form">
                    <h2>Reset Authority Password</h2>
                    <p className="form-help">This is an administrative override. The authority will be required to choose a permanent password after signing in.</p>
                    {!canResetAuthorityPassword && <div className="selected-info"><p>Your role can view authorities but does not have the <code>authority_accounts.reset_password</code> permission.</p></div>}
                    <form onSubmit={handlePasswordUpdate}>
                        <div className="form-group">
                            <label htmlFor="authority">Select Authority</label>
                            <select
                                id="authority"
                                value={selectedAuthority}
                                onChange={(e) => setSelectedAuthority(e.target.value)}
                                disabled={!canResetAuthorityPassword}
                                required
                            >
                                <option value="">Choose authority...</option>
                                {authorities.map(auth => (
                                    <option key={auth.value} value={auth.value}>
                                        {auth.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {selectedAuthData && (
                            <div className="selected-info">
                                <p>Current status: <span className={`status ${selectedAuthData.hasCredential ? 'custom' : 'default'}`}>
                                    {!selectedAuthData.hasCredential ? 'No credential issued' : selectedAuthData.mustChangePassword ? 'Awaiting password change' : 'Active credential'}
                                </span></p>
                            </div>
                        )}

                        <div className="form-group">
                            <label htmlFor="newPassword">Temporary Password</label>
                            <input
                                type="password"
                                id="newPassword"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                placeholder="Enter temporary password (minimum 12 characters)"
                                minLength={12}
                                disabled={!canResetAuthorityPassword}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="confirmPassword">Confirm New Password</label>
                            <input
                                type="password"
                                id="confirmPassword"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                placeholder="Confirm new password"
                                minLength={12}
                                disabled={!canResetAuthorityPassword}
                            />
                        </div>

                        {message && <div className="success-message">{message}</div>}
                        {error && <div className="error-message">{error}</div>}

                        <button
                            type="submit"
                            disabled={!canResetAuthorityPassword || loading || !selectedAuthority || !newPassword || !confirmPassword}
                            className="update-btn"
                        >
                            {loading ? 'Resetting...' : 'Issue Temporary Password'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default AuthorityManagement
