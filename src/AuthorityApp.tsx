import { useState, useEffect } from 'react'
// @ts-ignore - JSX components don't need type declarations for this setup
import AuthorityLogin from './components/Auth/AuthorityLogin'
// @ts-ignore - JSX components don't need type declarations for this setup
import AuthorityDashboard from './components/Authority/AuthorityDashboard'
// @ts-ignore - JSX components don't need type declarations for this setup
import AuthoritySettings from './components/Authority/AuthoritySettings'
import { AuthorityThemeProvider } from './components/Authority/hooks/useAuthorityTheme'
import ThemeToggle from './components/Authority/ThemeToggle'
import './AuthorityApp.css'
import './components/Authority/AuthorityTheme.css'

type AuthorityPage = 'login' | 'dashboard' | 'settings'

const AuthorityAppContent = () => {
    const [currentPage, setCurrentPage] = useState<AuthorityPage>('login')

    useEffect(() => {
        // Check if user is already logged in
        const storedUser = localStorage.getItem('authorityUser')
        const token = localStorage.getItem('authorityToken')
        
        if (storedUser && token) {
            try {
                JSON.parse(storedUser) // Validate JSON
                setCurrentPage('dashboard')
            } catch (error) {
                // Invalid stored data, clear it
                localStorage.removeItem('authorityUser')
                localStorage.removeItem('authorityToken')
            }
        }
    }, [])

    const renderPage = () => {
        switch (currentPage) {
            case 'login':
                return <AuthorityLogin />
            case 'dashboard':
                return <AuthorityDashboard />
            case 'settings':
                return <AuthoritySettings />
            default:
                return <AuthorityLogin />
        }
    }

    return (
        <div className="authority-app">
            <ThemeToggle />
            {renderPage()}
        </div>
    )
}

const AuthorityApp = () => {
    return (
        <AuthorityThemeProvider>
            <AuthorityAppContent />
        </AuthorityThemeProvider>
    )
}

export default AuthorityApp
