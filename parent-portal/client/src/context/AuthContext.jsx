import { createContext, useState, useContext, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('portalToken'))
  const navigate = useNavigate()

  useEffect(() => {
    if (token) {
      const userData = localStorage.getItem('portalUser')
      if (userData) setUser(JSON.parse(userData))
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
    localStorage.removeItem('portalUser')
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