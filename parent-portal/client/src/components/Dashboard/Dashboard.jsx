import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import ChildrenList from './ChildrenList'
import AddChildForm from './AddChildForm'
import Profile from './Profile'
import Documents from './Documents'
import StatusBadge from './StatusBadge'
import './Dashboard.css'

const Dashboard = () => {
  const { user, logout } = useAuth()
  const location = useLocation()

  const navItems = [
    { path: '/dashboard', label: 'Overview', icon: '📊' },
    { path: '/dashboard/children', label: 'My Children', icon: '👶' },
    { path: '/dashboard/add-child', label: 'Add Child', icon: '➕' },
    { path: '/dashboard/documents', label: 'Documents', icon: '🗂️' },
    { path: '/dashboard/profile', label: 'Profile', icon: '👤' },
  ]

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h3>Parent Portal</h3>
          <StatusBadge origin={user?.origin} />
        </div>
        
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={location.pathname === item.path ? 'active' : ''}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <strong>{user?.name}</strong>
            <span>{user?.pNoONo}</span>
          </div>
          <button onClick={logout} className="btn-logout">Logout</button>
        </div>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/children" element={<ChildrenList />} />
          <Route path="/add-child" element={<AddChildForm />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </main>
    </div>
  )
}

const Overview = () => {
  const { user } = useAuth()
  
  return (
    <div className="overview">
      <h1>Welcome, {user?.name}</h1>
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Account Status</h3>
          <span className={`status ${user?.status}`}>{user?.status}</span>
        </div>
        <div className="stat-card">
          <h3>Origin</h3>
          <span className={`origin ${user?.origin}`}>
            {user?.origin === 'admin_created' ? 'Admin Created' : 'Self Registered'}
          </span>
        </div>
      </div>
    </div>
  )
}

export default Dashboard