import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import RecordRequirements from './RecordRequirements'

const ChildDetailsPage = () => {
  const { childId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [child, setChild] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/children', { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Unable to load child details.')
        const match = result.find(item => String(item.child_id) === String(childId))
        if (!match) throw new Error('Child record not found.')
        return match
      })
      .then(result => { if (active) setChild(result) })
      .catch(loadError => { if (active) setError(loadError.message || 'Unable to load child details.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [childId, token])

  if (loading) return <div className="p-8 text-slate-500 dark:text-slate-400">Loading child record…</div>
  if (!child) return <div className="space-y-4"><div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error || 'Child record not found.'}</div><button onClick={() => navigate('/dashboard/children')} className="rounded-xl bg-slate-200 px-5 py-3 font-medium text-slate-800 dark:bg-slate-700 dark:text-white">Back to My Children</button></div>

  const isDraft = ['draft', 'changes_required'].includes(child.status)
  const statusClass = child.status === 'approved'
    ? 'border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-100'
    : isDraft
      ? 'border-blue-300 bg-blue-100 text-blue-950 dark:border-blue-700 dark:bg-blue-950/70 dark:text-blue-100'
      : 'border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-700 dark:bg-amber-950/70 dark:text-amber-100'

  const submitRegistration = async () => {
    if (!isDraft || submitting) return
    setSubmitting(true); setError(''); setNotice('')
    try {
      const response = await fetch(`/api/children/${child.child_id}/submit`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to submit the registration.')
      setChild(current => ({ ...current, status: 'pending' }))
      setShowSuccess(true)
    } catch (submitError) {
      setError(submitError.message || 'Unable to submit the registration.')
    } finally { setSubmitting(false) }
  }

  return <div className="space-y-6">
    {isDraft && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100"><strong>Step 2 of 2:</strong> this is a saved draft and is not yet in the staff review queue. Complete the current requirements, then submit it below. This URL can be refreshed safely.</div>}
    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200" role="alert">{error}</div>}
    {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" role="status">{notice}</div>}
    <div className="max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium text-blue-700 dark:text-blue-300">Child record</p><h1 className="text-2xl font-bold text-slate-900 dark:text-white">{child.child_name}</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">CNIC/B-Form: {child.cnic_bform_no}</p></div><span className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${statusClass}`}>{String(child.status || 'unknown').replace('_', ' ')}</span></div>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-slate-500 dark:text-slate-400">Age</dt><dd className="font-semibold text-slate-900 dark:text-white">{child.age}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">School</dt><dd className="font-semibold text-slate-900 dark:text-white">{child.school || 'Not set'}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Category</dt><dd className="font-semibold text-slate-900 dark:text-white">{child.disability_category || 'Pending staff decision'}</dd></div></dl>
    </div>
    <RecordRequirements token={token} childId={child.child_id} childName={child.child_name} identifier={child.cnic_bform_no} onBack={() => navigate('/dashboard/children')} onFinish={() => isDraft ? void submitRegistration() : setNotice('All current required uploads are saved. This record remains available here while staff review it.')} finishLabel={isDraft ? (submitting ? 'Submitting…' : 'Submit for review') : 'Done'} />
    {showSuccess && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="registration-complete-title"><div className="w-full max-w-md rounded-3xl border border-emerald-200 bg-white p-7 text-center shadow-2xl dark:border-emerald-800 dark:bg-slate-900"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"><span className="material-symbols-outlined text-4xl">check_circle</span></div><h2 id="registration-complete-title" className="text-2xl font-bold text-slate-900 dark:text-white">Registration sent for review</h2><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">The child record, uploaded documents, and submitted digital forms are saved. You can safely refresh or return later without uploading the same file again.</p><button onClick={() => navigate('/dashboard/children', { replace: true })} className="mt-6 w-full rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white hover:bg-emerald-700">View My Children</button><button onClick={() => { setShowSuccess(false); navigate(location.pathname, { replace: true }) }} className="mt-2 w-full rounded-xl px-5 py-3 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Continue reviewing this record</button></div></div>}
  </div>
}

export default ChildDetailsPage
