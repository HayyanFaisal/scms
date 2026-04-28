import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import UnifiedLogin from './components/Auth/UnifiedLogin'
import SignupForm from './components/Auth/SignupForm'
import Dashboard from './components/Dashboard/Dashboard'
import './App.css'
import './styles/design-system.css'

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <div className="app">
          <Routes>
            <Route path="/login" element={<UnifiedLogin />} />
            <Route path="/signup" element={<SignupForm />} />
            <Route path="/dashboard/*" element={<Dashboard />} />
            <Route path="/" element={<Navigate to="/login" replace />} />
          </Routes>
        </div>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App