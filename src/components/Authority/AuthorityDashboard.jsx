import { useState, useEffect } from 'react'
import './AuthorityDashboard.css'

const AuthorityDashboard = () => {
    const [activeTab, setActiveTab] = useState('dashboard')
    const [stats, setStats] = useState({
        totalParents: 0,
        totalChildren: 0,
        totalGrants: 0,
        totalGadgets: 0,
        pendingApprovals: 0
    })
    const [parents, setParents] = useState([])
    const [children, setChildren] = useState([])
    const [grants, setGrants] = useState([])
    const [gadgets, setGadgets] = useState([])
    const [loading, setLoading] = useState(true)
    const [authorityInfo, setAuthorityInfo] = useState(null)

    useEffect(() => {
        // Check if user is authenticated as authority
        const authorityUser = localStorage.getItem('authorityUser')
        if (!authorityUser) {
            window.location.href = '/authority.html'
            return
        }
        
        const user = JSON.parse(authorityUser)
        setAuthorityInfo(user)
        
        fetchData()
    }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            const token = localStorage.getItem('authorityToken')
            
            // Fetch all data filtered by authority
            const [parentsRes, childrenRes, grantsRes, gadgetsRes] = await Promise.all([
                fetch('/api/authority/parents', {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch('/api/authority/children', {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch('/api/authority/grants', {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch('/api/authority/gadgets', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            ])

            const [parentsData, childrenData, grantsData, gadgetsData] = await Promise.all([
                parentsRes.json(),
                childrenRes.json(),
                grantsRes.json(),
                gadgetsRes.json()
            ])

            setParents(parentsData)
            setChildren(childrenData)
            setGrants(grantsData)
            setGadgets(gadgetsData)

            // Calculate stats
            setStats({
                totalParents: parentsData.length,
                totalChildren: childrenData.length,
                totalGrants: grantsData.length,
                totalGadgets: gadgetsData.length,
                pendingApprovals: parentsData.filter(p => p.Status === 'pending').length
            })
        } catch (error) {
            console.error('Failed to fetch data:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleLogout = () => {
        localStorage.removeItem('authorityToken')
        localStorage.removeItem('authorityUser')
        window.location.href = '/authority.html'
    }

    const renderDashboard = () => (
        <div className="authority-stats-grid">
            <div className="stat-card">
                <h3>Total Parents</h3>
                <div className="stat-number">{stats.totalParents}</div>
            </div>
            <div className="stat-card">
                <h3>Total Children</h3>
                <div className="stat-number">{stats.totalChildren}</div>
            </div>
            <div className="stat-card">
                <h3>Monthly Grants</h3>
                <div className="stat-number">{stats.totalGrants}</div>
            </div>
            <div className="stat-card">
                <h3>Child Gadgets</h3>
                <div className="stat-number">{stats.totalGadgets}</div>
            </div>
            <div className="stat-card pending">
                <h3>Pending Approvals</h3>
                <div className="stat-number">{stats.pendingApprovals}</div>
            </div>
        </div>
    )

    const renderParents = () => (
        <div className="data-table">
            <h3>Parents ({parents.length})</h3>
            <table>
                <thead>
                    <tr>
                        <th>P.No</th>
                        <th>Name</th>
                        <th>Rank/Rate</th>
                        <th>Unit</th>
                        <th>Service Status</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {parents.map(parent => (
                        <tr key={parent.P_No_O_No}>
                            <td>{parent.P_No_O_No}</td>
                            <td>{parent.Parent_Name}</td>
                            <td>{parent.Rank_Rate}</td>
                            <td>{parent.Unit}</td>
                            <td>{parent.Service_Status}</td>
                            <td>
                                <span className={`status-badge ${parent.Status}`}>
                                    {parent.Status || 'Active'}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )

    const renderChildren = () => (
        <div className="data-table">
            <h3>Children ({children.length})</h3>
            <table>
                <thead>
                    <tr>
                        <th>Child ID</th>
                        <th>Name</th>
                        <th>Age</th>
                        <th>Gender</th>
                        <th>Disability</th>
                        <th>Parent P.No</th>
                    </tr>
                </thead>
                <tbody>
                    {children.map(child => (
                        <tr key={child.Child_ID}>
                            <td>{child.Child_ID}</td>
                            <td>{child.Child_Name}</td>
                            <td>{child.Age}</td>
                            <td>{child.Gender}</td>
                            <td>{child.Disability || 'None'}</td>
                            <td>{child.P_No_O_No}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )

    const renderGrants = () => (
        <div className="data-table">
            <h3>Monthly Grants ({grants.length})</h3>
            <table>
                <thead>
                    <tr>
                        <th>Grant ID</th>
                        <th>Parent P.No</th>
                        <th>Amount</th>
                        <th>Month</th>
                        <th>Year</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {grants.map(grant => (
                        <tr key={grant.Grant_ID}>
                            <td>{grant.Grant_ID}</td>
                            <td>{grant.P_No_O_No}</td>
                            <td>Rs. {grant.Amount?.toLocaleString()}</td>
                            <td>{grant.Month}</td>
                            <td>{grant.Year}</td>
                            <td>
                                <span className={`status-badge ${grant.Status}`}>
                                    {grant.Status}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )

    const renderGadgets = () => (
        <div className="data-table">
            <h3>Child Gadgets ({gadgets.length})</h3>
            <table>
                <thead>
                    <tr>
                        <th>Gadget ID</th>
                        <th>Child ID</th>
                        <th>Gadget Type</th>
                        <th>Model</th>
                        <th>Status</th>
                        <th>Issued Date</th>
                    </tr>
                </thead>
                <tbody>
                    {gadgets.map(gadget => (
                        <tr key={gadget.Gadget_ID}>
                            <td>{gadget.Gadget_ID}</td>
                            <td>{gadget.Child_ID}</td>
                            <td>{gadget.Gadget_Type}</td>
                            <td>{gadget.Model}</td>
                            <td>
                                <span className={`status-badge ${gadget.Status}`}>
                                    {gadget.Status}
                                </span>
                            </td>
                            <td>{gadget.Issued_Date || 'N/A'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )

    if (loading) {
        return <div className="loading">Loading...</div>
    }

    return (
        <div className="authority-dashboard">
            <header className="dashboard-header">
                <div className="header-content">
                    <h1>Authority Dashboard</h1>
                    <div className="authority-info">
                        <span className="authority-badge">{authorityInfo?.authority}</span>
                        <button onClick={handleLogout} className="logout-btn">Logout</button>
                    </div>
                </div>
            </header>

            <nav className="dashboard-nav">
                {['dashboard', 'parents', 'children', 'grants', 'gadgets'].map(tab => (
                    <button
                        key={tab}
                        className={`nav-tab ${activeTab === tab ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </nav>

            <main className="dashboard-content">
                {activeTab === 'dashboard' && renderDashboard()}
                {activeTab === 'parents' && renderParents()}
                {activeTab === 'children' && renderChildren()}
                {activeTab === 'grants' && renderGrants()}
                {activeTab === 'gadgets' && renderGadgets()}
            </main>
        </div>
    )
}

export default AuthorityDashboard
