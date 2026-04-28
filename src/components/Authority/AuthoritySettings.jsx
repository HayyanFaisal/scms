import { useState, useEffect } from 'react'
import './AuthoritySettings.css'

const AuthoritySettings = () => {
    const [authorities, setAuthorities] = useState([])
    const [selectedAuthority, setSelectedAuthority] = useState('')
    const [currentPassword, setCurrentPassword] = useState('')
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
            const response = await fetch('/api/auth/authorities')
            const data = await response.json()
            setAuthorities(data)
        } catch (error) {
            setError('Failed to fetch authorities')
        }
    }

    const handlePasswordUpdate = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        setMessage('')

        if (newPassword !== confirmPassword) {
            setError('New passwords do not match')
            setLoading(false)
            return
        }

        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters long')
            setLoading(false)
            return
        }

        try {
            const response = await fetch('/api/auth/update-authority-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    authority: selectedAuthority,
                    currentPassword,
                    newPassword
                })
            })

            const data = await response.json()

            if (response.ok) {
                setMessage('Password updated successfully!')
                setCurrentPassword('')
                setNewPassword('')
                setConfirmPassword('')
                fetchAuthorities() // Refresh the list
            } else {
                setError(data.message || 'Failed to update password')
            }
        } catch (error) {
            setError('Network error. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const selectedAuthData = authorities.find(auth => auth.value === selectedAuthority)

    return (
        <div className="authority-settings">
            <div className="settings-header">
                <h1>Authority Settings</h1>
                <button onClick={() => window.location.href = '/authority.html'} className="back-btn">
                    ← Back to Dashboard
                </button>
            </div>

            <div className="settings-content">
                <div className="authorities-list">
                    <h2>Authorities</h2>
                    <div className="authorities-grid">
                        {authorities.map(auth => (
                            <div key={auth.value} className="authority-card">
                                <h3>{auth.label}</h3>
                                <div className="auth-status">
                                    <span className={`password-status ${auth.hasCustomPassword ? 'custom' : 'default'}`}>
                                        {auth.hasCustomPassword ? 'Custom Password' : 'Default Password'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="password-update-form">
                    <h2>Update Authority Password</h2>
                    <form onSubmit={handlePasswordUpdate}>
                        <div className="form-group">
                            <label htmlFor="authority">Select Authority</label>
                            <select
                                id="authority"
                                value={selectedAuthority}
                                onChange={(e) => setSelectedAuthority(e.target.value)}
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
                                <p>Current status: <span className={`status ${selectedAuthData.hasCustomPassword ? 'custom' : 'default'}`}>
                                    {selectedAuthData.hasCustomPassword ? 'Custom password set' : 'Using default password (12345678)'}
                                </span></p>
                            </div>
                        )}

                        <div className="form-group">
                            <label htmlFor="currentPassword">Current Password</label>
                            <input
                                type="password"
                                id="currentPassword"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                required
                                placeholder="Enter current password"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="newPassword">New Password</label>
                            <input
                                type="password"
                                id="newPassword"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                placeholder="Enter new password (min 6 characters)"
                                minLength={6}
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
                                minLength={6}
                            />
                        </div>

                        {message && <div className="success-message">{message}</div>}
                        {error && <div className="error-message">{error}</div>}

                        <button
                            type="submit"
                            disabled={loading || !selectedAuthority || !currentPassword || !newPassword || !confirmPassword}
                            className="update-btn"
                        >
                            {loading ? 'Updating...' : 'Update Password'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default AuthoritySettings
