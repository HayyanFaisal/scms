import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import './Dashboard.css'

const DOCUMENT_TYPES = [
    { key: 'assessment_performa', label: 'Assessment Performa', desc: 'Disability evaluation category A/B/C by Specialist Doctor' },
    { key: 'application_form', label: 'Application Form', desc: 'Father + Child + Bank details + PN Service Card / Authorization + CNIC' },
    { key: 'disability_certificate', label: 'Disability Certificate', desc: 'Issued by NCRDP / PCRDP' },
    { key: 'identity_proof', label: 'Identity Proof', desc: 'Child CNIC / B-Form' }
];

const AddChildForm = () => {
    const { token, user } = useAuth()
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
            <div className="page">
                <h1>Add Child <span className="step-badge">Step 1 of 2</span></h1>
                
                <form onSubmit={handleStep1Submit} className="form-card">
                    <div className="form-group">
                        <label>Child Name *</label>
                        <input
                            type="text"
                            value={formData.childName}
                            onChange={e => setFormData({...formData, childName: e.target.value})}
                            className={errors.childName ? 'error' : ''}
                        />
                        {errors.childName && <span className="error-text">{errors.childName}</span>}
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>Age</label>
                            <input
                                type="number"
                                step="0.1"
                                value={formData.age}
                                onChange={e => setFormData({...formData, age: e.target.value})}
                            />
                        </div>
                        <div className="form-group">
                            <label>CNIC / B-Form No *</label>
                            <input
                                type="text"
                                value={formData.cnicBformNo}
                                onChange={e => setFormData({...formData, cnicBformNo: e.target.value})}
                                className={errors.cnicBformNo ? 'error' : ''}
                            />
                            {errors.cnicBformNo && <span className="error-text">{errors.cnicBformNo}</span>}
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Disability Category</label>
                        <select
                            value={formData.disabilityCategory}
                            onChange={e => setFormData({...formData, disabilityCategory: e.target.value})}
                        >
                            <option value="">Select Category</option>
                            <option value="A">A (Severe)</option>
                            <option value="B">B (Moderate)</option>
                            <option value="C">C (Mild)</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Disease / Disability</label>
                        <textarea
                            value={formData.diseaseDisability}
                            onChange={e => setFormData({...formData, diseaseDisability: e.target.value})}
                            rows={3}
                        />
                    </div>

                    <div className="form-group">
                        <label>School</label>
                        <input
                            type="text"
                            value={formData.school}
                            onChange={e => setFormData({...formData, school: e.target.value})}
                        />
                    </div>

                    <button type="submit" className="btn-primary" disabled={loading}>
                        {loading ? 'Checking...' : 'Next: Upload Documents →'}
                    </button>
                </form>
            </div>
        )
    }

    // Step 2: Document Upload
    return (
        <div className="page">
            <h1>Upload Documents <span className="step-badge">Step 2 of 2</span></h1>
            <p className="subtitle">Child: {formData.childName} | B-Form/CNIC: {formData.cnicBformNo}</p>

            <div className="documents-grid">
                {DOCUMENT_TYPES.map(doc => (
                    <div key={doc.key} className={`doc-card ${documents[doc.key] ? 'uploaded' : ''}`}>
                        <h4>{doc.label}</h4>
                        <p className="doc-desc">{doc.desc}</p>
                        
                        {documents[doc.key] ? (
                            <div className="doc-preview">
                                <img 
                                    src={documents[doc.key].preview} 
                                    alt={doc.label}
                                    onClick={() => window.open(documents[doc.key].preview, '_blank')}
                                />
                                <span className="doc-filename">{documents[doc.key].fileName}</span>
                                <button 
                                    className="btn-change"
                                    onClick={() => setDocuments(prev => {
                                        const next = { ...prev }; delete next[doc.key]; return next;
                                    })}
                                >
                                    Change
                                </button>
                            </div>
                        ) : (
                            <label className="upload-area">
                                <input
                                    type="file"
                                    accept="image/*,.pdf"
                                    onChange={e => handleFileUpload(doc.key, e.target.files[0])}
                                    hidden
                                />
                                {uploading[doc.key] ? (
                                    <span>Uploading...</span>
                                ) : (
                                    <>
                                        <span className="upload-icon">📎</span>
                                        <span>Click to upload</span>
                                        <small>Max 5MB • JPG, PNG, PDF</small>
                                    </>
                                )}
                            </label>
                        )}
                    </div>
                ))}
            </div>

            <div className="form-actions">
                <button className="btn-secondary" onClick={() => setStep(1)}>← Back</button>
                <button className="btn-primary" onClick={handleFinish}>
                    Submit for Approval
                </button>
            </div>
        </div>
    )
}

export default AddChildForm