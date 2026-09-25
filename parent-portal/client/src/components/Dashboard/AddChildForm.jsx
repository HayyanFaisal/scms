import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const AddChildForm = () => {
  const { token } = useAuth()
  const navigate = useNavigate()
  const [pageError, setPageError] = useState('')
  const [formData, setFormData] = useState({
    childName: '', age: '', cnicBformNo: '', diseaseDisability: '', disabilityCategory: '', school: ''
  })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [configuration, setConfiguration] = useState(null)
  const [configurationError, setConfigurationError] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/config/reference-data')
      .then(async response => {
        if (!response.ok) throw new Error('Configuration unavailable')
        return response.json()
      })
      .then(data => { if (active) setConfiguration(data.items) })
      .catch(() => { if (active) setConfigurationError('Configured categories and schools could not be loaded.') })
    return () => { active = false }
  }, [])

  const validateStep1 = () => {
    const next = {}
    if (!formData.childName.trim()) next.childName = 'Child name is required.'
    if (!formData.cnicBformNo.trim()) next.cnicBformNo = 'CNIC/B-Form number is required.'
    if (!formData.age || Number(formData.age) <= 0) next.age = 'Enter a valid age.'
    if (!formData.disabilityCategory) next.disabilityCategory = 'Choose a category.'
    if (!formData.school) next.school = 'Choose a school.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleStep1Submit = async event => {
    event.preventDefault()
    if (!validateStep1()) return
    setLoading(true)
    setPageError('')
    try {
      const checkResponse = await fetch(`/api/children/check-cnic?cnic=${encodeURIComponent(formData.cnicBformNo)}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const check = await checkResponse.json()
      if (!checkResponse.ok) throw new Error(check.error || 'Unable to verify the CNIC/B-Form number.')
      if (check.found) {
        setErrors({ cnicBformNo: 'This CNIC/B-Form already exists.' })
        return
      }

      const response = await fetch('/api/children', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(formData)
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to register the child.')
      navigate(`/dashboard/children/${result.child_id}`, { state: { registration: true } })
    } catch (error) {
      setPageError(error.message || 'Unable to register the child. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 transition-all focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-700/50 dark:text-slate-100'

  return <div className="max-w-3xl space-y-8">
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/30"><span className="material-symbols-outlined">person_add</span></div><div><h1 className="text-2xl font-bold text-slate-800 dark:text-white">Register New Child</h1><p className="text-slate-500 dark:text-slate-400">Enter the child record, then complete configured documents and forms.</p></div></div>
        <span className="rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">Step 1 of 2</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"><div className="h-full w-1/2 rounded-full bg-gradient-to-r from-blue-500 to-blue-600" /></div>
    </div>

    {pageError && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200" role="alert">{pageError}</div>}

    <form onSubmit={handleStep1Submit} className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-lg shadow-slate-200/50 dark:border-slate-700/50 dark:bg-slate-800 dark:shadow-black/20">
      <div className="border-b border-slate-100 bg-slate-50 px-8 py-6 dark:border-slate-700/50 dark:bg-slate-800/60"><h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-white"><span className="material-symbols-outlined text-blue-600">info</span>Basic Information</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The record is saved when you continue to step 2, so it can be resumed later from My Children.</p></div>
      <div className="space-y-6 p-8">
        <div className="space-y-2"><label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Child Name <span className="text-rose-500">*</span></label><input className={inputClass} value={formData.childName} onChange={event => setFormData({ ...formData, childName: event.target.value })} placeholder="Full name as shown on official records" />{errors.childName && <p className="text-sm text-rose-600 dark:text-rose-400">{errors.childName}</p>}</div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2"><label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Age in years <span className="text-rose-500">*</span></label><input className={inputClass} type="number" min="0.1" step="0.1" value={formData.age} onChange={event => setFormData({ ...formData, age: event.target.value })} placeholder="8.5" />{errors.age && <p className="text-sm text-rose-600 dark:text-rose-400">{errors.age}</p>}</div>
          <div className="space-y-2"><label className="text-sm font-semibold text-slate-700 dark:text-slate-300">CNIC / B-Form Number <span className="text-rose-500">*</span></label><input className={inputClass} value={formData.cnicBformNo} onChange={event => setFormData({ ...formData, cnicBformNo: event.target.value })} placeholder="35201-1234567-8" />{errors.cnicBformNo && <p className="text-sm text-rose-600 dark:text-rose-400">{errors.cnicBformNo}</p>}</div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2"><label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Parent-selected category <span className="text-rose-500">*</span></label><select className={inputClass} value={formData.disabilityCategory} onChange={event => setFormData({ ...formData, disabilityCategory: event.target.value })}><option value="">Choose category</option>{configuration?.category?.map(item => <option key={item.code} value={item.name}>Category {item.name}</option>)}</select>{errors.disabilityCategory && <p className="text-sm text-rose-600 dark:text-rose-400">{errors.disabilityCategory}</p>}</div>
          <div className="space-y-2"><label className="text-sm font-semibold text-slate-700 dark:text-slate-300">School <span className="text-rose-500">*</span></label><select className={inputClass} value={formData.school} onChange={event => setFormData({ ...formData, school: event.target.value })}><option value="">Choose school</option>{configuration?.school?.map(item => <option key={item.code} value={item.name}>{item.name}</option>)}</select>{errors.school && <p className="text-sm text-rose-600 dark:text-rose-400">{errors.school}</p>}</div>
        </div>
        <div className="space-y-2"><label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Additional administrative notes</label><textarea className={`${inputClass} resize-none`} rows="4" value={formData.diseaseDisability} onChange={event => setFormData({ ...formData, diseaseDisability: event.target.value })} placeholder="Optional non-medical notes" /></div>
        {configurationError && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{configurationError}</p>}
        <button type="submit" disabled={loading || !configuration || Boolean(configurationError)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 font-semibold text-white shadow-lg shadow-blue-600/25 hover:from-blue-700 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <><span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />Saving child record…</> : <>Continue to Documents & Forms<span className="material-symbols-outlined">arrow_forward</span></>}</button>
      </div>
    </form>
  </div>
}

export default AddChildForm
