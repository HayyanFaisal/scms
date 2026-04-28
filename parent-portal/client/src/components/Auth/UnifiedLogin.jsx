import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import parentPicture from '../../images/parent_picture.png'
import pakistanNavyLogo from '../../images/pakistan-navy-logo.png'

const UnifiedLogin = () => {
  const [formData, setFormData] = useState({
    pNoONo: '',
    password: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { login } = useAuth()
  const { darkMode, toggleDarkMode } = useTheme()

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('http://127.0.0.1:4000/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (response.ok) {
        localStorage.setItem('token', data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        login(data.user)
        navigate('/dashboard')
      } else {
        setError(data.error || 'Login failed')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center shadow-md">
                <img src={pakistanNavyLogo} alt="Pakistan Navy" className="w-10 h-10 object-contain" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tighter text-blue-600 dark:text-blue-400 uppercase leading-none">
                  PN Benevolent
                </h1>
                <span className="text-[10px] font-bold tracking-[0.2em] text-sky-600 dark:text-sky-400 uppercase">
                  Platform
                </span>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-6">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Institutional Access Portal
              </span>
              <div className="p-8 space-y-6 bg-white dark:bg-dark-surface"></div>
              <button className="text-sky-700 dark:text-sky-400 font-bold border-b-2 border-sky-700 dark:border-sky-400">
                Login
              </button>
              <button className="text-gray-500 dark:text-gray-400 hover:text-sky-800 dark:hover:text-sky-300">
                Help
              </button>
              <button 
                onClick={toggleDarkMode}
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                <span className="material-symbols-outlined text-gray-600 dark:text-gray-300">
                  {darkMode ? 'light_mode' : 'dark_mode'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex items-center justify-center px-4 py-12 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-surface-low dark:bg-dark-surface rounded-l-[10rem] opacity-50"></div>
          <div className="absolute bottom-0 left-0 w-1/3 h-1/2 bg-surface dark:bg-dark-surface-low rounded-tr-[5rem] opacity-30"></div>
        </div>
        
        {/* Login Card */}
        <div className="relative z-10 w-full max-w-5xl bg-white dark:bg-dark-surface rounded-2xl shadow-2xl overflow-hidden border border-surface-high dark:border-dark-surface-high" style={{minHeight: '600px'}}>
          <div className="grid lg:grid-cols-2">
            {/* Left Side - Image */}
            <div className="hidden lg:block relative">
              <img 
                alt="Parent Portal" 
                className="absolute inset-0 w-full h-full object-cover" 
                src={parentPicture}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-dark-primary/80 via-primary/40 to-transparent">
                <div className="absolute bottom-0 left-0 right-0 p-12">
                  <h2 className="text-4xl font-bold text-white mb-4 leading-tight">
                    Securing maritime futures with institutional integrity.
                  </h2>
                  <p className="text-lg text-white/95 max-w-md leading-relaxed">
                    The PN Benevolent Association's unified ecosystem for administrative, medical, and educational excellence.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="p-8 md:p-12 lg:p-16 flex flex-col justify-center">
              <div className="mb-10">
                <h3 className="text-3xl font-bold text-blue-900 dark:text-blue-300 mb-2">
                  Welcome Back
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Please enter your PN number and password to access the portal.
                </p>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm flex items-center gap-3">
                  <span className="material-symbols-outlined">error</span>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* PN Number Field */}
                <div>
                  <label htmlFor="pNoONo" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    PN Number
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="material-symbols-outlined text-gray-400">badge</span>
                    </div>
                    <input
                      type="text"
                      id="pNoONo"
                      name="pNoONo"
                      value={formData.pNoONo}
                      onChange={handleChange}
                      placeholder="e.g., 12345"
                      className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label htmlFor="password" className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Password
                    </label>
                    <a href="#" className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
                      Forgot Password?
                    </a>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="material-symbols-outlined text-gray-400">lock</span>
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="••••••••"
                      className="block w-full pl-10 pr-10 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      <span className="material-symbols-outlined text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        {showPassword ? "visibility_off" : "visibility"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Submit Button */}
                <div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex justify-center items-center gap-2 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{background: 'linear-gradient(135deg, #003358 0%, #004a7c 100%)'}}
                  >
                    {loading ? (
                      <>
                        <span>Signing in...</span>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      </>
                    ) : (
                      <>
                        <span>Access Portal</span>
                        <span className="material-symbols-outlined">login</span>
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Register Link */}
              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-600">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    New to the platform?
                  </p>
                  <Link 
                    to="/signup" 
                    className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold hover:text-blue-800 dark:hover:text-blue-300 transition-colors group"
                  >
                    <div className="bg-gradient-to-br from-primary to-primary-dark dark:from-dark-primary dark:to-dark-primary-light p-8 text-white">
                      Register for Parents
                      <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">
                        arrow_forward
                      </span>
                    </div>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-surface-low dark:bg-dark-surface-low p-6 border-t border-surface-high dark:border-dark-surface-high">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex flex-col items-center md:items-start">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">
                Institutional Guardian
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                &copy; 2024 PN Benevolent Association. All rights reserved.
              </p>
            </div>
            <div className="flex gap-8 text-sm font-semibold text-gray-600 dark:text-gray-400">
              <a href="#" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                Security Standards
              </a>
              <a href="#" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                Contact Support
              </a>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-800 bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-gray-600 dark:text-gray-300 text-sm">support_agent</span>
                </div>
                <div className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-800 bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-gray-600 dark:text-gray-300 text-sm">admin_panel_settings</span>
                </div>
              </div>
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                24/7 Priority Support Active
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default UnifiedLogin
