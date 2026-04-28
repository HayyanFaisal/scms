import { useState } from 'react'
import './AuthorityLogin.css'

const AuthorityLogin = () => {
    const [authority, setAuthority] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const authorities = [
        { value: 'HQ COMNOR', label: 'HQ COMNOR' },
        { value: 'HQ COMKAR', label: 'HQ COMKAR' },
        { value: 'HQ COMCEP', label: 'HQ COMCEP' },
        { value: 'HQ PMSA', label: 'HQ PMSA' },
        { value: 'HQ COMPAK', label: 'HQ COMPAK' },
        { value: 'HQ COMCOAST', label: 'HQ COMCOAST' },
        { value: 'HQ FOST', label: 'HQ FOST' },
        { value: 'HQ NSFC', label: 'HQ NSFC' },
        { value: 'HQ COMLOG', label: 'HQ COMLOG' }
    ]

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            const response = await fetch('/api/auth/authority-login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ authority, password })
            })

            const data = await response.json()

            if (response.ok) {
                localStorage.setItem('authorityToken', data.token)
                localStorage.setItem('authorityUser', JSON.stringify({
                    authority: data.authority,
                    type: 'authority'
                }))
                window.location.href = '/authority.html'
            } else {
                setError(data.message || 'Login failed')
            }
        } catch (err) {
            setError('Network error. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="authority-login-container">
            <div className="authority-login-card">
                <div className="login-header">
                    <h1>Authority Portal</h1>
                    <p>Login to access your authority dashboard</p>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    <div className="form-group">
                        <label htmlFor="authority">Select Authority</label>
                        <select
                            id="authority"
                            value={authority}
                            onChange={(e) => setAuthority(e.target.value)}
                            required
                            className="authority-select"
                        >
                            <option value="">Choose your authority...</option>
                            {authorities.map(auth => (
                                <option key={auth.value} value={auth.value}>
                                    {auth.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            placeholder="Enter your password"
                            className="password-input"
                        />
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    <button
                        type="submit"
                        disabled={loading || !authority || !password}
                        className="login-button"
                    >
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                </form>

                <div className="login-footer">
                    <p>Default password: 12345678</p>
                    <p>
                        <a href="/admin">Admin Portal</a>
                    </p>
                </div>
            </div>
        </div>
    )
}

export default AuthorityLogin
