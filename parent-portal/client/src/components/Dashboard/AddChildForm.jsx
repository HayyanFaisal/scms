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
                setChildId(data.childId)
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
            <div className="space-y-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        Add Child <span className="ml-3 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-sm font-semibold rounded-full">Step 1 of 2</span>
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">Enter your child's basic information</p>
                </div>
                
                <form onSubmit={handleStep1Submit} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 max-w-2xl">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Child Name *</label>
                            <input
                                type="text"
                                value={formData.childName}
                                onChange={e => setFormData({...formData, childName: e.target.value})}
                                className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                    errors.childName ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                                }`}
                            />
                            {errors.childName && <span className="text-red-600 dark:text-red-400 text-sm">{errors.childName}</span>}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Age</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={formData.age}
                                    onChange={e => setFormData({...formData, age: e.target.value})}
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">CNIC / B-Form No *</label>
                                <input
                                    type="text"
                                    value={formData.cnicBformNo}
                                    onChange={e => setFormData({...formData, cnicBformNo: e.target.value})}
                                    className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                        errors.cnicBformNo ? 'border-red-300 dark:border-red-600' : 'border-gray-300 dark:border-gray-600'
                                    }`}
                                />
                                {errors.cnicBformNo && <span className="text-red-600 dark:text-red-400 text-sm">{errors.cnicBformNo}</span>}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Disability Category</label>
                            <select
                                value={formData.disabilityCategory}
                                onChange={e => setFormData({...formData, disabilityCategory: e.target.value})}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                <option value="">Select Category</option>
                                <option value="A">A (Severe)</option>
                                <option value="B">B (Moderate)</option>
                                <option value="C">C (Mild)</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">Disease / Disability</label>
                            <textarea
                                value={formData.diseaseDisability}
                                onChange={e => setFormData({...formData, diseaseDisability: e.target.value})}
                                rows={3}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">School</label>
                            <input
                                type="text"
                                value={formData.school}
                                onChange={e => setFormData({...formData, school: e.target.value})}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <button 
                            type="submit" 
                            className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                            disabled={loading}
                        >
                            {loading ? 'Checking...' : 'Next: Upload Documents →'}
                        </button>
                    </div>
                </form>
            </div>
        )
    }

    // Step 2: Document Upload
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    Upload Documents <span className="ml-3 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-sm font-semibold rounded-full">Step 2 of 2</span>
                </h1>
                <p className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 p-4 rounded-lg border-l-4 border-blue-600">
                    Child: {formData.childName} | B-Form/CNIC: {formData.cnicBformNo}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {DOCUMENT_TYPES.map(doc => (
                    <div key={doc.key} className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border-2 p-6 transition-colors ${
                        documents[doc.key] 
                            ? 'border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/10' 
                            : 'border-gray-200 dark:border-gray-700'
                    }`}>
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{doc.label}</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{doc.desc}</p>
                        
                        {documents[doc.key] ? (
                            <div className="space-y-4">
                                <div className="relative group">
                                    <img 
                                        src={documents[doc.key].preview} 
                                        alt={doc.label}
                                        onClick={() => window.open(documents[doc.key].preview, '_blank')}
                                        className="w-full h-48 object-cover rounded-lg cursor-pointer transition-transform group-hover:scale-105"
                                    />
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400 break-all">{documents[doc.key].fileName}</p>
                                <button 
                                    className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
                                    onClick={() => setDocuments(prev => {
                                        const next = { ...prev }; delete next[doc.key]; return next;
                                    })}
                                >
                                    Change Document
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
                                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-blue-500 dark:hover:border-blue-400 transition-colors bg-gray-50 dark:bg-gray-700">
                                    {uploading[doc.key] ? (
                                        <div className="space-y-2">
                                            <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
                                            <span className="text-gray-600 dark:text-gray-400">Uploading...</span>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <span className="text-4xl">📎</span>
                                            <span className="text-gray-600 dark:text-gray-400 font-medium">Click to upload</span>
                                            <p className="text-xs text-gray-500 dark:text-gray-500">Max 5MB • JPG, PNG, PDF</p>
                                        </div>
                                    )}
                                </div>
                            </label>
                        )}
                    </div>
                ))}
            </div>

            <div className="flex justify-between gap-4 pt-6 border-t border-gray-200 dark:border-gray-700">
                <button 
                    className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors" 
                    onClick={() => setStep(1)}
                >
                    ← Back
                </button>
                <button 
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                    onClick={handleFinish}
                >
                    Submit for Approval
                </button>
            </div>
        </div>
    )
}

export default AddChildForm