import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import ChildrenList from './ChildrenList'
import AddChildForm from './AddChildForm'
import Banking from './Banking'
import Profile from './Profile'
import StatusBadge from './StatusBadge'

const Dashboard = () => {
  const { user, logout } = useAuth()
  const { darkMode, toggleDarkMode } = useTheme()
  const location = useLocation()

  const navItems = [
    { path: '/dashboard', label: 'Overview', icon: '📊' },
    { path: '/dashboard/children', label: 'My Children', icon: '👶' },
    { path: '/dashboard/add-child', label: 'Add Child', icon: '➕' },
    { path: '/dashboard/banking', label: 'Banking', icon: '🏦' },
    { path: '/dashboard/profile', label: 'Profile', icon: '👤' },
  ]

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 dark:bg-gray-950 text-white flex flex-col fixed h-full z-10">
        {/* Sidebar Header */}
        <div className="p-6 border-b border-gray-800 dark:border-gray-900">
          <h3 className="text-lg font-bold mb-3">Parent Portal</h3>
          <StatusBadge origin={user?.origin} />
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 p-4">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${
                location.pathname === item.path
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-6 border-t border-gray-800 dark:border-gray-900">
          <div className="mb-4">
            <p className="font-semibold text-white">{user?.name}</p>
            <p className="text-sm text-gray-400 font-mono">{user?.pNoONo}</p>
          </div>
          <button 
            onClick={toggleDarkMode}
            className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors mb-2 flex items-center justify-center gap-2"
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span className="material-symbols-outlined text-sm">
              {darkMode ? 'light_mode' : 'dark_mode'}
            </span>
            <span className="text-sm">
              {darkMode ? 'Light Mode' : 'Dark Mode'}
            </span>
          </button>
          <button 
            onClick={logout} 
            className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors font-medium"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/children" element={<ChildrenList />} />
          <Route path="/add-child" element={<AddChildForm />} />
          <Route path="/banking" element={<Banking />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </main>
    </div>
  )
}

const Overview = () => {
  const { user } = useAuth()
  
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Welcome, {user?.name}
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Here's an overview of your account status and information
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Account Status
          </h3>
          <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
            user?.status === 'approved' 
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
              : user?.status === 'pending'
              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            {user?.status || 'Unknown'}
          </span>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
            Account Origin
          </h3>
          <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
            user?.origin === 'admin_created'
              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
              : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
          }`}>
            {user?.origin === 'admin_created' ? 'Admin Created' : 'Self Registered'}
          </span>
        </div>
      </div>
    </div>
  )
}

export default Dashboard