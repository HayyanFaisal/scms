import { useEffect, useRef } from 'react'
import './ImagePopup.css'

const ImagePopup = ({ src, onClose }) => {
    const overlayRef = useRef()

    useEffect(() => {
        const handleEsc = (e) => e.key === 'Escape' && onClose()
        document.addEventListener('keydown', handleEsc)
        document.body.style.overflow = 'hidden'
        return () => {
            document.removeEventListener('keydown', handleEsc)
            document.body.style.overflow = ''
        }
    }, [onClose])

    const handleOverlayClick = (e) => {
        if (e.target === overlayRef.current) onClose()
    }

    const handleImageClick = () => {
        window.open(src, '_blank')
    }

    return (
        <div className="image-popup-overlay" ref={overlayRef} onClick={handleOverlayClick}>
            <div className="image-popup-content">
                <button className="popup-close" onClick={onClose}>×</button>
                <img 
                    src={src} 
                    alt="Document" 
                    onClick={handleImageClick}
                    title="Click to open in new tab"
                />
                <p className="popup-hint">Click image to open in new tab • Click outside or × to close</p>
            </div>
        </div>
    )
}

export default ImagePopup
