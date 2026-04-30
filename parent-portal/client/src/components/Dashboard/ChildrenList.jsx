import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'

const ChildrenList = () => {
  const { token } = useAuth()
  const { darkMode } = useTheme()
  const [children, setChildren] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    fetchChildren()
  }, [])

  const fetchChildren = async () => {
    try {
      const res = await fetch('/api/children', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (res.status === 403) {
        console.error('Authentication failed - token may be corrupted')
        setChildren([])
        return
      }
      
      const data = await res.json()
      
      // Ensure data is an array
      if (Array.isArray(data)) {
        setChildren(data)
      } else {
        console.error('Expected array but got:', typeof data, data)
        setChildren([])
      }
    } catch (err) {
      console.error('Failed to fetch children:', err)
      setChildren([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <div className="w-16 h-16 border-4 border-slate-200 dark:border-slate-700 border-t-blue-600 rounded-full animate-spin mb-4"></div>
      <p className="text-slate-500 dark:text-slate-400 font-medium">Loading children...</p>
    </div>
  )

  const filteredChildren = filter === 'all' 
    ? children 
    : children.filter(c => c.status?.toLowerCase() === filter)

  const stats = {
    total: children.length,
    approved: children.filter(c => c.status === 'approved').length,
    pending: children.filter(c => c.status === 'pending').length
  }

  const getCategoryColor = (cat) => {
    switch(cat) {
      case 'A': return { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-800', icon: 'priority_high' }
      case 'B': return { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800', icon: 'warning' }
      case 'C': return { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800', icon: 'check_circle' }
      default: return { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400', border: 'border-slate-200 dark:border-slate-700', icon: 'help' }
    }
  }

  const getStatusStyle = (status) => {
    switch(status?.toLowerCase()) {
      case 'approved': return { bg: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', label: 'Approved' }
      case 'pending': return { bg: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400', label: 'Pending Review' }
      case 'rejected': return { bg: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400', label: 'Rejected' }
      default: return { bg: 'bg-slate-500', text: 'text-slate-600 dark:text-slate-400', label: 'Unknown' }
    }
  }

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-1">My Children</h1>
          <p className="text-slate-500 dark:text-slate-400">Manage your children's information and track their application status</p>
        </div>
        <Link 
          to="/dashboard/add-child" 
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/30 hover:-translate-y-0.5"
        >
          <span className="material-symbols-outlined">add</span>
          Add Child
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200/60 dark:border-slate-700/50 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">family_restroom</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.total}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Children</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200/60 dark:border-slate-700/50 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400">check_circle</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.approved}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Approved</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200/60 dark:border-slate-700/50 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-amber-600 dark:text-amber-400">schedule</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.pending}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pending</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      {children.length > 0 && (
        <div className="flex gap-2">
          {['all', 'approved', 'pending'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                filter === f 
                  ? 'bg-slate-800 dark:bg-slate-700 text-white shadow-lg' 
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      )}
      
      {children.length === 0 ? (
        <div className="text-center p-16 bg-gradient-to-br from-slate-50 to-blue-50/50 dark:from-slate-800/50 dark:to-slate-800 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-600">
          <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/30 dark:to-slate-800 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-blue-600 dark:text-blue-400">child_care</span>
          </div>
          <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-3">No Children Added Yet</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-md mx-auto">
            Start your journey by adding your first child. This will allow you to apply for educational support and benevolent services.
          </p>
          <Link 
            to="/dashboard/add-child" 
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/25 hover:shadow-xl hover:-translate-y-0.5"
          >
            <span className="material-symbols-outlined">person_add</span>
            Add Your First Child
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredChildren.map((child, index) => {
            const categoryStyle = getCategoryColor(child.disability_category)
            const statusStyle = getStatusStyle(child.status)
            
            return (
              <div 
                key={child.child_id || index} 
                className="group bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200/60 dark:border-slate-700/50 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 dark:hover:shadow-black/30 transition-all duration-300 hover:-translate-y-1"
              >
                {/* Card Header */}
                <div className="relative p-6 pb-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                        <span className="material-symbols-outlined text-2xl">child_care</span>
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white">{child.child_name}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Age: {child.age} years</p>
                      </div>
                    </div>
                    <div className={`w-3 h-3 rounded-full ${statusStyle.bg} shadow-lg ring-2 ring-white dark:ring-slate-800`} title={statusStyle.label}></div>
                  </div>
                  
                  {/* Status Badge */}
                  <div className="flex items-center gap-2 mb-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${statusStyle.text} bg-opacity-10`}
                      style={{ backgroundColor: 'currentColor', opacity: 0.1 }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'currentColor' }}></span>
                      {statusStyle.label}
                    </span>
                    {child.disability_category && (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${categoryStyle.bg} ${categoryStyle.text} ${categoryStyle.border} border`}>
                        <span className="material-symbols-outlined text-xs">{categoryStyle.icon}</span>
                        Category {child.disability_category}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Card Body */}
                <div className="px-6 pb-6 space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50">
                    <span className="material-symbols-outlined text-slate-400 text-lg">badge</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">CNIC / B-Form</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{child.cnic_bform_no}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-700/50">
                    <span className="material-symbols-outlined text-slate-400 text-lg">school</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">School</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{child.school || 'Not specified'}</p>
                    </div>
                  </div>
                  
                  {child.disease_disability && (
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800/30">
                      <span className="material-symbols-outlined text-rose-500 text-lg mt-0.5">medical_services</span>
                      <div>
                        <p className="text-xs text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-1">Condition</p>
                        <p className="text-sm text-rose-700 dark:text-rose-300">{child.disease_disability}</p>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Card Footer */}
                <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/50">
                  <button className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 rounded-xl">
                    <span className="material-symbols-outlined text-lg">visibility</span>
                    View Details
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ChildrenList