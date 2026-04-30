import { createContext, useState, useContext, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('portalToken') || localStorage.getItem('token'))
  const navigate = useNavigate()

  console.log('AuthContext - portalToken:', localStorage.getItem('portalToken'))
  console.log('AuthContext - token:', localStorage.getItem('token'))
  console.log('AuthContext - initial token state:', token)

  useEffect(() => {
    if (token) {
      // Validate token format (JWT tokens should have 3 parts separated by dots)
      if (typeof token === 'string' && token.split('.').length !== 3) {
        console.warn('Invalid JWT token format, clearing corrupted data')
        localStorage.removeItem('portalUser')
        localStorage.removeItem('user')
        localStorage.removeItem('portalToken')
        localStorage.removeItem('token')
        setToken(null)
        setUser(null)
        return
      }
      
      const userData = localStorage.getItem('portalUser') || localStorage.getItem('user')
      if (userData && userData !== 'undefined') {
        try {
          const parsedUser = JSON.parse(userData)
          setUser(parsedUser)
        } catch (error) {
          console.error('Failed to parse user data from localStorage:', error)
          // Clear corrupted data
          localStorage.removeItem('portalUser')
          localStorage.removeItem('user')
          localStorage.removeItem('portalToken')
          localStorage.removeItem('token')
          setToken(null)
          setUser(null)
        }
      } else if (userData === 'undefined') {
        console.warn('localStorage contains "undefined" string, clearing corrupted data')
        localStorage.removeItem('portalUser')
        localStorage.removeItem('user')
        localStorage.removeItem('portalToken')
        localStorage.removeItem('token')
        setToken(null)
        setUser(null)
      }
    }
  }, [token])

  const login = (tokenData, userData) => {
    localStorage.setItem('portalToken', tokenData)
    localStorage.setItem('portalUser', JSON.stringify(userData))
    setToken(tokenData)
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('portalToken')
    localStorage.removeItem('token')
    localStorage.removeItem('portalUser')
    localStorage.removeItem('user')
    setToken(null)
    setUser(null)
    navigate('/login')
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)