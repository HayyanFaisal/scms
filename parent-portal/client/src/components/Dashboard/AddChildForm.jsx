import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'

const DOCUMENT_TYPES = [
    { key: 'assessment_performa', label: 'Assessment Performa', desc: 'Disability evaluation category A/B/C by Specialist Doctor' },
    { key: 'application_form', label: 'Application Form', desc: 'Father + Child + Bank details + PN Service Card / Authorization + CNIC' },
    { key: 'disability_certificate', label: 'Disability Certificate', desc: 'Issued by NCRDP / PCRDP' },
    { key: 'identity_proof', label: 'Identity Proof', desc: 'Child CNIC / B-Form' }
];

const AddChildForm = () => {
    const { token, user } = useAuth()
    const { darkMode } = useTheme()
    const navigate = useNavigate()
    
    const [step, setStep] = useState(1)
    const [childId, setChildId] = useState(null)
    const [pNoONo, setPNoONo] = useState(user?.pNoONo || '')
    
    const [formData, setFormData] = useState({
        childName: '',
        age: '',
        cnicBformNo: '',
        diseaseDisability: '',
        disabilityCategory: '',
        school: ''
    })
    
    const [documents, setDocuments] = useState({})
    const [uploading, setUploading] = useState({})
    const [errors, setErrors] = useState({})
    const [loading, setLoading] = useState(false)

    const validateStep1 = () => {
        const errs = {}
        if (!formData.childName.trim()) errs.childName = 'Required'
        if (!formData.cnicBformNo.trim()) errs.cnicBformNo = 'Required'
        if (!formData.age || formData.age <= 0) errs.age = 'Invalid age'
        setErrors(errs)
        return Object.keys(errs).length === 0
    }

    const handleStep1Submit = async (e) => {
        e.preventDefault()
        if (!validateStep1()) return
        
        setLoading(true)
        try {
            // Check unique CNIC/B-Form
            const checkRes = await fetch(`/api/children/check-cnic?cnic=${formData.cnicBformNo}`)
            if (checkRes.ok) {
                const exists = await checkRes.json()
                if (exists.found) {
                    setErrors({ cnicBformNo: 'This CNIC/B-Form already exists' })
                    setLoading(false)
                    return
                }
            }

            const res = await fetch('/api/children', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            })

            const data = await res.json()
            if (res.ok) {
                setChildId(data.child_id)
                // Ensure pNoONo is set from user data
                const userPNo = user?.pNoONo || 'default'
                setPNoONo(userPNo)
                console.log('Step 2: Set pNoONo to', userPNo, 'User data:', user)
                setStep(2)
            } else {
                alert(data.error || 'Failed to add child')
            }
        } catch (err) {
            alert('Network error')
        } finally {
            setLoading(false)
        }
    }

    const handleFileUpload = async (docType, file) => {
        if (!file) return
        
        // Validate size
        const maxSize = 5 * 1024 * 1024 // 5MB
        const MAX_FILE_SIZE_MB = 5
        if (file.size > maxSize) {
            alert(`File too large. Max ${MAX_FILE_SIZE_MB}MB allowed.`)
            return
        }

        // Ensure pNoONo is available - use fallback if user.pNoONo is not set
        const pNoValue = pNoONo || user?.pNoONo || 'default'
        console.log('Uploading with pNoONo:', pNoValue, 'User:', user)

        setUploading(prev => ({ ...prev, [docType]: true }))
        
        const formDataUpload = new FormData()
        formDataUpload.append('file', file)
        formDataUpload.append('documentType', docType)
        formDataUpload.append('pNoONo', pNoValue)
        formDataUpload.append('identifier', formData.cnicBformNo)

        try {
            const res = await fetch(`/api/children/${childId}/documents`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formDataUpload
            })
            
            const data = await res.json()
            if (res.ok) {
                setDocuments(prev => ({
                    ...prev,
                    [docType]: {
                        fileName: data.fileName,
                        filePath: data.filePath,
                        preview: URL.createObjectURL(file)
                    }
                }))
            } else {
                alert(data.error || 'Upload failed')
            }
        } catch (err) {
            alert('Upload error')
        } finally {
            setUploading(prev => ({ ...prev, [docType]: false }))
        }
    }

    const handleFinish = () => {
        const uploadedCount = Object.keys(documents).length
        if (uploadedCount < 4) {
            if (!window.confirm(`Only ${uploadedCount}/4 documents uploaded. Submit anyway?`)) return
        }
        alert('Child registration submitted for approval!')
        navigate('/dashboard/children')
    }

    // Step 1: Child Data
    if (step === 1) {
        return (
            <div className="space-y-8 max-w-3xl">
                {/* Step Indicator */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white shadow-lg shadow-blue-600/30">
                                <span className="material-symbols-outlined text-xl">person_add</span>
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Register New Child</h1>
                                <p className="text-slate-500 dark:text-slate-400">Complete the registration in two simple steps</p>
                            </div>
                        </div>
                        <span className="px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-sm font-semibold rounded-full">
                            Step 1 of 2
                        </span>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="relative">
                        <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full w-1/2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"></div>
                        </div>
                        <div className="flex justify-between mt-2">
                            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Child Information</span>
                            <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Document Upload</span>
                        </div>
                    </div>
                </div>
                
                <form onSubmit={handleStep1Submit} className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg shadow-slate-200/50 dark:shadow-black/20 border border-slate-200/60 dark:border-slate-700/50 overflow-hidden">
                    {/* Form Header */}
                    <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-700/50 bg-gradient-to-r from-slate-50 to-white dark:from-slate-800/50 dark:to-slate-800">
                        <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-blue-600">info</span>
                            Basic Information
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Enter your child's details carefully. This information will be used for official records.</p>
                    </div>
                    
                    <div className="p-8 space-y-6">
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                Child Name
                                <span className="text-rose-500">*</span>
                            </label>
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">person</span>
                                <input
                                    type="text"
                                    value={formData.childName}
                                    onChange={e => setFormData({...formData, childName: e.target.value})}
                                    placeholder="Enter full name as per official documents"
                                    className={`w-full pl-12 pr-4 py-3 border rounded-xl bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                                        errors.childName ? 'border-rose-300 dark:border-rose-600 bg-rose-50 dark:bg-rose-900/10' : 'border-slate-200 dark:border-slate-600'
                                    }`}
                                />
                            </div>
                            {errors.childName && <span className="text-rose-600 dark:text-rose-400 text-sm flex items-center gap-1"><span className="material-symbols-outlined text-sm">error</span>{errors.childName}</span>}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                    Age (in years)
                                </label>
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">cake</span>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={formData.age}
                                        onChange={e => setFormData({...formData, age: e.target.value})}
                                        placeholder="e.g., 8.5"
                                        className="w-full pl-12 pr-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                    CNIC / B-Form Number
                                    <span className="text-rose-500">*</span>
                                </label>
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">badge</span>
                                    <input
                                        type="text"
                                        value={formData.cnicBformNo}
                                        onChange={e => setFormData({...formData, cnicBformNo: e.target.value})}
                                        placeholder="e.g., 35201-1234567-8"
                                        className={`w-full pl-12 pr-4 py-3 border rounded-xl bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                                            errors.cnicBformNo ? 'border-rose-300 dark:border-rose-600 bg-rose-50 dark:bg-rose-900/10' : 'border-slate-200 dark:border-slate-600'
                                        }`}
                                    />
                                </div>
                                {errors.cnicBformNo && <span className="text-rose-600 dark:text-rose-400 text-sm flex items-center gap-1"><span className="material-symbols-outlined text-sm">error</span>{errors.cnicBformNo}</span>}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                                    Disability Category
                                </label>
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">category</span>
                                    <select
                                        value={formData.disabilityCategory}
                                        onChange={e => setFormData({...formData, disabilityCategory: e.target.value})}
                                        className="w-full pl-12 pr-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none"
                                    >
                                        <option value="">Select Category</option>
                                        <option value="A">Category A (Severe)</option>
                                        <option value="B">Category B (Moderate)</option>
                                        <option value="C">Category C (Mild)</option>
                                    </select>
                                    <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                                    School Name
                                </label>
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">school</span>
                                    <input
                                        type="text"
                                        value={formData.school}
                                        onChange={e => setFormData({...formData, school: e.target.value})}
                                        placeholder="Enter school name"
                                        className="w-full pl-12 pr-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                                Disease / Disability Description
                            </label>
                            <textarea
                                value={formData.diseaseDisability}
                                onChange={e => setFormData({...formData, diseaseDisability: e.target.value})}
                                placeholder="Provide details about the disability or medical condition..."
                                rows={4}
                                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                            />
                        </div>

                        <div className="pt-4 border-t border-slate-100 dark:border-slate-700/50">
                            <button 
                                type="submit" 
                                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/25 hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0" 
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        <span>Verifying...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Continue to Document Upload</span>
                                        <span className="material-symbols-outlined">arrow_forward</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        )
    }

    // Step 2: Document Upload
    return (
        <div className="space-y-8 max-w-4xl">
            {/* Step Indicator */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-600/30">
                            <span className="material-symbols-outlined text-xl">upload_file</span>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Upload Documents</h1>
                            <p className="text-slate-500 dark:text-slate-400">Upload required documents for verification</p>
                        </div>
                    </div>
                    <span className="px-4 py-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm font-semibold rounded-full">
                        Step 2 of 2
                    </span>
                </div>
                
                {/* Progress Bar */}
                <div className="relative">
                    <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full w-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full"></div>
                    </div>
                    <div className="flex justify-between mt-2">
                        <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Child Information</span>
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Document Upload</span>
                    </div>
                </div>
            </div>

            {/* Child Info Card */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-6 border border-blue-100 dark:border-blue-800/30">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-lg">
                        <span className="material-symbols-outlined text-2xl text-blue-600">child_care</span>
                    </div>
                    <div className="flex-1">
                        <p className="text-sm text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Registering Child</p>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white">{formData.childName}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">CNIC/B-Form: {formData.cnicBformNo}</p>
                    </div>
                </div>
            </div>

            {/* Upload Progress */}
            <div className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Upload Progress</span>
                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{Object.keys(documents).length} / {DOCUMENT_TYPES.length}</span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
                            style={{ width: `${(Object.keys(documents).length / DOCUMENT_TYPES.length) * 100}%` }}
                        ></div>
                    </div>
                </div>
            </div>

            {/* Document Upload Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {DOCUMENT_TYPES.map(doc => (
                    <div key={doc.key} className={`group bg-white dark:bg-slate-800 rounded-2xl shadow-sm border-2 overflow-hidden transition-all duration-300 hover:shadow-lg ${
                        documents[doc.key] 
                            ? 'border-emerald-300 dark:border-emerald-600 shadow-emerald-100 dark:shadow-emerald-900/20' 
                            : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                    }`}>
                        {/* Card Header */}
                        <div className={`px-6 py-4 border-b ${documents[doc.key] ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/30' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700/50'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${documents[doc.key] ? 'bg-emerald-100 dark:bg-emerald-800/50 text-emerald-600 dark:text-emerald-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'}`}>
                                    <span className="material-symbols-outlined">
                                        {documents[doc.key] ? 'check_circle' : 'description'}
                                    </span>
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-semibold text-slate-800 dark:text-white">{doc.label}</h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{documents[doc.key] ? 'Uploaded successfully' : 'Required document'}</p>
                                </div>
                            </div>
                        </div>
                        
                        {/* Card Body */}
                        <div className="p-6">
                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{doc.desc}</p>
                            
                            {documents[doc.key] ? (
                                <div className="space-y-4">
                                    <div className="relative group/img rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                                        <img 
                                            src={documents[doc.key].preview} 
                                            alt={doc.label}
                                            onClick={() => window.open(documents[doc.key].preview, '_blank')}
                                            className="w-full h-40 object-cover cursor-pointer transition-transform duration-300 group-hover/img:scale-105"
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center">
                                            <span className="material-symbols-outlined text-white opacity-0 group-hover/img:opacity-100 transition-opacity text-3xl drop-shadow-lg">open_in_full</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                                        <span className="material-symbols-outlined text-slate-400 text-sm">description</span>
                                        <p className="text-sm text-slate-600 dark:text-slate-400 truncate flex-1">{documents[doc.key].fileName}</p>
                                    </div>
                                    <button 
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:border-rose-300 dark:hover:border-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 font-medium rounded-xl transition-all"
                                        onClick={() => setDocuments(prev => {
                                            const next = { ...prev }; delete next[doc.key]; return next;
                                        })}
                                    >
                                        <span className="material-symbols-outlined text-sm">refresh</span>
                                        Replace Document
                                    </button>
                                </div>
                            ) : (
                                <label className="block cursor-pointer">
                                    <input
                                        type="file"
                                        accept="image/*,.pdf"
                                        onChange={e => handleFileUpload(doc.key, e.target.files[0])}
                                        hidden
                                    />
                                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all duration-300 group-hover:shadow-inner">
                                        {uploading[doc.key] ? (
                                            <div className="space-y-3">
                                                <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-600 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
                                                <span className="text-slate-600 dark:text-slate-400 font-medium">Uploading...</span>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <div className="w-12 h-12 mx-auto rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center group-hover:bg-blue-200 dark:group-hover:bg-blue-800/50 transition-colors">
                                                    <span className="material-symbols-outlined text-2xl text-blue-600 dark:text-blue-400">cloud_upload</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-700 dark:text-slate-300 font-semibold block">Click to upload</span>
                                                    <span className="text-slate-500 dark:text-slate-400 text-sm">or drag and drop</span>
                                                </div>
                                                <p className="text-xs text-slate-400 dark:text-slate-500">JPG, PNG, PDF up to 5MB</p>
                                            </div>
                                        )}
                                    </div>
                                </label>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-between gap-4 pt-6 border-t border-slate-200 dark:border-slate-700">
                <button 
                    className="flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-semibold rounded-xl transition-all" 
                    onClick={() => setStep(1)}
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                    Back to Information
                </button>
                <button 
                    className="flex items-center justify-center gap-2 px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleFinish}
                    disabled={Object.keys(documents).length === 0}
                >
                    <span className="material-symbols-outlined">check_circle</span>
                    Submit for Approval
                </button>
            </div>
        </div>
    )
}

export default AddChildForm