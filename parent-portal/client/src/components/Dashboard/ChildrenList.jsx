import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'

const ChildrenList = () => {
  const { token } = useAuth()
  const { darkMode } = useTheme()
  const [children, setChildren] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchChildren()
  }, [])

  const fetchChildren = async () => {
    try {
      const res = await fetch('/api/children', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      setChildren(data)
    } catch (err) {
      console.error('Failed to fetch children:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="text-gray-500 dark:text-gray-400">Loading children...</div>
    </div>
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">My Children</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage your children's information and documents</p>
      </div>
      
      {children.length === 0 ? (
        <div className="text-center p-12 bg-gray-50 dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600">
          <div className="text-6xl mb-4 opacity-50">👶</div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Children Added</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">You haven't added any children yet. Get started by adding your first child.</p>
          <Link 
            to="/dashboard/add-child" 
            className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Add Your First Child
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {children.map(child => (
            <div key={child.child_id} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 border-l-4 border-l-blue-600">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{child.child_name}</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Age:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{child.age}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">CNIC/B-Form:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{child.cnic_bform_no}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">School:</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{child.school || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Category:</span>
                  <span className={`text-sm font-medium ${
                    child.disability_category === 'A' ? 'text-red-600 dark:text-red-400' :
                    child.disability_category === 'B' ? 'text-yellow-600 dark:text-yellow-400' :
                    child.disability_category === 'C' ? 'text-green-600 dark:text-green-400' :
                    'text-gray-600 dark:text-gray-400'
                  }`}>
                    {child.disability_category || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Status:</span>
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                    child.sync_status === 'synced' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                  }`}>
                    {child.sync_status === 'synced' ? '✅ Approved' : '⏳ Pending'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ChildrenList