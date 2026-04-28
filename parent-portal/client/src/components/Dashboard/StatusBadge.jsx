const StatusBadge = ({ origin }) => {
  if (!origin) return null
  
  return (
    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
      origin === 'admin_created'
        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
        : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
    }`}>
      {origin === 'admin_created' ? '👤 Admin Created' : '✨ New User'}
    </span>
  )
}

export default StatusBadge