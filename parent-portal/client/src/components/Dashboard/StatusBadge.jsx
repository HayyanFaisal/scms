const StatusBadge = ({ origin, status }) => {
  // Status takes precedence if provided
  if (status) {
    const statusConfig = {
      approved: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', icon: 'check_circle', label: 'Approved' },
      pending: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', icon: 'schedule', label: 'Pending' },
      rejected: { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-400', icon: 'cancel', label: 'Rejected' }
    }
    const config = statusConfig[status?.toLowerCase()] || statusConfig.pending
    
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}>
        <span className="material-symbols-outlined text-[14px]">{config.icon}</span>
        {config.label}
      </span>
    )
  }
  
  // Fall back to origin badge
  if (!origin) return null
  
  const originConfig = {
    admin_created: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', icon: 'admin_panel_settings', label: 'Admin Created' },
    self_registered: { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-400', icon: 'person_add', label: 'Self Registered' }
  }
  const config = originConfig[origin] || originConfig.self_registered
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}>
      <span className="material-symbols-outlined text-[14px]">{config.icon}</span>
      {config.label}
    </span>
  )
}

export default StatusBadge