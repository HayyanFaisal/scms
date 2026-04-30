import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import ChildrenList from './ChildrenList'
import AddChildForm from './AddChildForm'
import Banking from './Banking'
import Profile from './Profile'
import StatusBadge from './StatusBadge'
import AccountManagement from './AccountManagement'
import pakistanNavyLogo from '../../images/pakistan-navy-logo.png'

const Dashboard = () => {
  const { user, logout } = useAuth()
  const { darkMode, toggleDarkMode } = useTheme()
  const location = useLocation()

  const navItems = [
    { path: '/dashboard', label: 'Overview', icon: 'dashboard' },
    { path: '/dashboard/children', label: 'My Children', icon: 'family_restroom' },
    { path: '/dashboard/add-child', label: 'Add Child', icon: 'person_add' },
    { path: '/dashboard/banking', label: 'Banking', icon: 'account_balance' },
    { path: '/dashboard/profile', label: 'Profile', icon: 'badge' },
    { path: '/dashboard/account', label: 'Account', icon: 'settings' },
  ]

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Premium Sidebar */}
      <aside className="w-72 flex flex-col fixed h-full z-50 bg-white/80 dark:bg-slate-900/90 backdrop-blur-xl border-r border-slate-200/80 dark:border-slate-700/50 shadow-2xl shadow-slate-200/50 dark:shadow-black/50">
        {/* Logo Header */}
        <div className="p-6 border-b border-slate-200/60 dark:border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#003358] to-[#004a7c] flex items-center justify-center shadow-lg shadow-blue-900/30">
              <img src={pakistanNavyLogo} alt="PN" className="w-9 h-9 object-contain" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tight uppercase leading-tight">
                PN Benevolent
              </h3>
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 tracking-[0.15em] uppercase">
                Parent Portal
              </span>
            </div>
          </div>
        </div>
        
        {/* User Status Card */}
        <div className="px-4 py-4">
          <div className="bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-800/50 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-700/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white shadow-lg shadow-blue-600/25">
                <span className="material-symbols-outlined text-lg">person</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 dark:text-white text-sm truncate">{user?.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{user?.pNoONo}</p>
              </div>
            </div>
            <StatusBadge origin={user?.origin} status={user?.status} />
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto custom-scrollbar">
          <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-3 mb-2">
            Main Menu
          </div>
          {navItems.map(item => {
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/25 scale-[1.02]'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className={`material-symbols-outlined transition-transform duration-200 ${isActive ? '' : 'group-hover:scale-110'}`}>
                  {item.icon}
                </span>
                <span className="font-medium text-sm">{item.label}</span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/80"></span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-200/60 dark:border-slate-700/50 space-y-2">
          <button 
            onClick={toggleDarkMode}
            className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-slate-700 dark:text-slate-300"
          >
            <span className="material-symbols-outlined text-base">
              {darkMode ? 'light_mode' : 'dark_mode'}
            </span>
            <span className="text-sm font-medium">
              {darkMode ? 'Light Mode' : 'Dark Mode'}
            </span>
          </button>
          <button 
            onClick={logout} 
            className="w-full px-4 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl transition-all duration-200 font-medium shadow-lg shadow-red-500/25 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-base">logout</span>
            <span className="text-sm">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-72 min-h-screen">
        {/* Top Header */}
        <header className="sticky top-0 z-40 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/50 px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
                {navItems.find(item => item.path === location.pathname)?.label || 'Dashboard'}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Welcome back, {user?.name?.split(' ')[0] || 'User'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-sm">schedule</span>
                <span className="text-sm text-slate-600 dark:text-slate-300 font-medium">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-8">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/children" element={<ChildrenList />} />
            <Route path="/add-child" element={<AddChildForm />} />
            <Route path="/banking" element={<Banking />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/account" element={<AccountManagement />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

const Overview = () => {
  const { user } = useAuth()
  
  const stats = [
    { 
      label: 'Account Status', 
      value: user?.status || 'Unknown',
      icon: 'verified',
      color: user?.status === 'approved' ? 'emerald' : user?.status === 'pending' ? 'amber' : 'rose',
      desc: user?.status === 'approved' ? 'Fully verified account' : 'Awaiting approval'
    },
    { 
      label: 'Account Type', 
      value: user?.origin === 'admin_created' ? 'Admin Created' : 'Self Registered',
      icon: 'admin_panel_settings',
      color: user?.origin === 'admin_created' ? 'blue' : 'violet',
      desc: user?.origin === 'admin_created' ? 'Created by administrator' : 'Self-service registration'
    },
  ]
  
  return (
    <div className="space-y-8 max-w-5xl">
      {/* Welcome Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-slate-800 p-8 text-white shadow-2xl shadow-blue-900/30">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-400/20 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="material-symbols-outlined text-3xl text-blue-200">waves</span>
            <span className="text-sm font-medium text-blue-200 uppercase tracking-wider">PN Benevolent Association</span>
          </div>
          <h1 className="text-4xl font-bold mb-2">
            Welcome, {user?.name?.split(' ')[0] || 'User'}
          </h1>
          <p className="text-blue-100 text-lg max-w-xl">
            Manage your children's educational support, track application status, and access benevolent services all in one place.
          </p>
        </div>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {stats.map((stat, idx) => (
          <div 
            key={idx}
            className="group relative bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200/60 dark:border-slate-700/50 shadow-lg shadow-slate-200/50 dark:shadow-black/20 hover:shadow-xl hover:shadow-slate-200/60 dark:hover:shadow-black/30 transition-all duration-300 hover:-translate-y-1"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                  {stat.label}
                </p>
                <p className="text-2xl font-bold text-slate-800 dark:text-white mb-1">
                  {stat.value}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {stat.desc}
                </p>
              </div>
              <div className={`w-14 h-14 rounded-2xl bg-${stat.color}-100 dark:bg-${stat.color}-900/30 flex items-center justify-center`}>
                <span className={`material-symbols-outlined text-2xl text-${stat.color}-600 dark:text-${stat.color}-400`}>
                  {stat.icon}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Quick Actions */}
      <div>
        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-blue-600">bolt</span>
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link to="/dashboard/add-child" className="group flex items-center gap-4 p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 shadow-sm hover:shadow-lg hover:shadow-blue-500/10 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined">person_add</span>
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-white">Add Child</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Register a new beneficiary</p>
            </div>
          </Link>
          
          <Link to="/dashboard/children" className="group flex items-center gap-4 p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 shadow-sm hover:shadow-lg hover:shadow-emerald-500/10 hover:border-emerald-300 dark:hover:border-emerald-700 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined">family_restroom</span>
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-white">View Children</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Manage existing records</p>
            </div>
          </Link>
          
          <Link to="/dashboard/banking" className="group flex items-center gap-4 p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 shadow-sm hover:shadow-lg hover:shadow-violet-500/10 hover:border-violet-300 dark:hover:border-violet-700 transition-all duration-300">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/30 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined">account_balance</span>
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-white">Banking</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Update payment details</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Dashboard