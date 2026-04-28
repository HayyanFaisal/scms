/**
 * CNIC Validator and Formatter
 * Formats CNIC as: XXXXX-XXXXXXX-X (13 digits total)
 */

// Validate CNIC format
export const validateCNIC = (cnic) => {
  // Remove all non-digit characters
  const cleanCNIC = cnic.replace(/\D/g, '');
  
  // Check if it has exactly 13 digits
  if (cleanCNIC.length !== 13) {
    return false;
  }
  
  // Check if all characters are digits
  if (!/^\d{13}$/.test(cleanCNIC)) {
    return false;
  }
  
  return true;
};

// Format CNIC as user types
export const formatCNIC = (value) => {
  // Remove all non-digit characters
  let cleanValue = value.replace(/\D/g, '');
  
  // Limit to 13 digits
  if (cleanValue.length > 13) {
    cleanValue = cleanValue.slice(0, 13);
  }
  
  // Apply formatting: XXXXX-XXXXXXX-X
  if (cleanValue.length >= 6) {
    const firstPart = cleanValue.slice(0, 5);
    const secondPart = cleanValue.slice(5, 12);
    const thirdPart = cleanValue.slice(12, 13);
    
    if (cleanValue.length === 13) {
      return `${firstPart}-${secondPart}-${thirdPart}`;
    } else if (cleanValue.length > 5) {
      return `${firstPart}-${secondPart}`;
    }
  }
  
  return cleanValue;
};

// CNIC input component handler
export const handleCNICChange = (e, setCNIC, setError) => {
  const formattedCNIC = formatCNIC(e.target.value);
  setCNIC(formattedCNIC);
  
  // Validate if we have 13 digits
  const cleanCNIC = formattedCNIC.replace(/\D/g, '');
  if (cleanCNIC.length === 13 && !validateCNIC(formattedCNIC)) {
    setError('Please enter a valid 13-digit CNIC number');
  } else if (cleanCNIC.length === 13) {
    setError('');
  } else if (cleanCNIC.length > 0) {
    setError('CNIC must be 13 digits');
  } else {
    setError('');
  }
};

// Get clean CNIC for API calls
export const getCleanCNIC = (formattedCNIC) => {
  return formattedCNIC.replace(/\D/g, '');
};
