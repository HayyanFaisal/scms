const StatusBadge = ({ origin }) => {
  if (!origin) return null
  
  return (
    <span className={`status-badge ${origin}`}>
      {origin === 'admin_created' ? '👤 Admin Created' : '✨ New User'}
    </span>
  )
}

export default StatusBadge