import { useState } from 'react'
import './AuthoritySettings.css'

const AuthoritySettings = ({ authority, onPasswordChanged }) => {
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')

    const handlePasswordUpdate = async (event) => {
        event.preventDefault()
        setLoading(true)
        setError('')
        setMessage('')

        if (newPassword !== confirmPassword) {
            setError('New passwords do not match')
            setLoading(false)
            return
        }
        if (newPassword.length < 12) {
            setError('The new password must be at least 12 characters long')
            setLoading(false)
            return
        }
        if (newPassword === currentPassword) {
            setError('Choose a password different from the current password')
            setLoading(false)
            return
        }

        try {
            const token = localStorage.getItem('authorityToken')
            const response = await fetch('/api/authority/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.message || 'Failed to change password')

            setMessage(data.message || 'Password changed. Sign in again.')
            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
            window.setTimeout(() => {
                if (onPasswordChanged) onPasswordChanged()
                else {
                    localStorage.removeItem('authorityToken')
                    localStorage.removeItem('authorityUser')
                    window.location.href = '/authority.html'
                }
            }, 1000)
        } catch (changeError) {
            setError(changeError instanceof Error ? changeError.message : 'Network error. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="authority-settings">
            <div className="settings-header">
                <div>
                    <h1>Security Settings</h1>
                    <p className="settings-subtitle">Change the password for {authority || 'this authority'}.</p>
                </div>
            </div>

            <div className="settings-content settings-content-single">
                <div className="password-update-form">
                    <h2>Change Your Password</h2>
                    <p className="settings-help">For security, you must provide the current password. An administrative reset is handled separately by an authorized Director.</p>
                    <form onSubmit={handlePasswordUpdate}>
                        <div className="form-group">
                            <label htmlFor="authorityCurrentPassword">Current Password</label>
                            <input
                                type="password"
                                id="authorityCurrentPassword"
                                value={currentPassword}
                                onChange={(event) => setCurrentPassword(event.target.value)}
                                required
                                autoComplete="current-password"
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="authorityNewPassword">New Password</label>
                            <input
                                type="password"
                                id="authorityNewPassword"
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                                minLength={12}
                                required
                                autoComplete="new-password"
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="authorityConfirmPassword">Confirm New Password</label>
                            <input
                                type="password"
                                id="authorityConfirmPassword"
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                minLength={12}
                                required
                                autoComplete="new-password"
                            />
                        </div>

                        {message && <div className="success-message">{message}</div>}
                        {error && <div className="error-message">{error}</div>}

                        <button type="submit" disabled={loading} className="update-btn">
                            {loading ? 'Changing...' : 'Change Password'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default AuthoritySettings
