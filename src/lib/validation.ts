import type { ValidationError } from '@/types';

// CNIC Validation: 00000-0000000-0 format
export const validateCNIC = (cnic: string): boolean => {
  const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;
  return cnicRegex.test(cnic);
};

export const getCNICError = (cnic: string): string | null => {
  if (!cnic) return 'CNIC is required';
  if (!validateCNIC(cnic)) return 'CNIC must be in format: 00000-0000000-0';
  return null;
};

// IBAN Validation: 24 characters for Pakistan
export const validateIBAN = (iban: string): boolean => {
  // Remove spaces and check length
  const cleanIBAN = iban.replace(/\s/g, '');
  if (cleanIBAN.length !== 24) return false;
  
  // Check if starts with PK
  if (!cleanIBAN.startsWith('PK')) return false;
  
  // Check if alphanumeric
  return /^[A-Z0-9]{24}$/.test(cleanIBAN);
};

export const getIBANError = (iban: string): string | null => {
  if (!iban) return 'IBAN is required';
  if (!validateIBAN(iban)) return 'IBAN must be 24 characters starting with PK (e.g., PK36SCBL0000001123456701)';
  return null;
};

// Phone Number Validation
export const validatePhone = (phone: string): boolean => {
  const phoneRegex = /^03\d{2}-\d{7}$/;
  return phoneRegex.test(phone);
};

export const getPhoneError = (phone: string): string | null => {
  if (!phone) return 'Phone number is required';
  if (!validatePhone(phone)) return 'Phone must be in format: 03XX-XXXXXXX';
  return null;
};

// Email Validation
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const getEmailError = (email: string): string | null => {
  if (!email) return 'Email is required';
  if (!validateEmail(email)) return 'Please enter a valid email address';
  return null;
};

// Required Field Validation
export const validateRequired = (value: string, fieldName: string): string | null => {
  if (!value || value.trim() === '') return `${fieldName} is required`;
  return null;
};

// Age Validation
export const validateAge = (age: number): boolean => {
  return age > 0 && age <= 25;
};

export const getAgeError = (age: number): string | null => {
  if (age <= 0) return 'Age must be greater than 0';
  if (age > 25) return 'Age must be 25 or less for dependent children';
  return null;
};

// Amount Validation
export const validateAmount = (amount: number): boolean => {
  return amount >= 0;
};

export const getAmountError = (amount: number): string | null => {
  if (amount < 0) return 'Amount cannot be negative';
  return null;
};

// Date Validation
export const validateDateRange = (from: string, to: string): string | null => {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  
  if (fromDate > toDate) return 'End date must be after start date';
  return null;
};

// P/No O/No Validation
export const validatePNo = (pNo: string): boolean => {
  return pNo.trim().length >= 3;
};

export const getPNoError = (pNo: string): string | null => {
  if (!pNo) return 'P/No or O/No is required';
  if (pNo.trim().length < 3) return 'P/No or O/No must be at least 3 characters';
  return null;
};

// Form Validation Helper
export const validateForm = (fields: Record<string, { value: any; validators: ((val: any) => string | null)[] }>): ValidationError[] => {
  const errors: ValidationError[] = [];
  
  Object.entries(fields).forEach(([fieldName, { value, validators }]) => {
    validators.forEach(validator => {
      const error = validator(value);
      if (error) {
        errors.push({ field: fieldName, message: error });
      }
    });
  });
  
  return errors;
};

// Format helpers
export const formatCNIC = (cnic: string): string => {
  // Remove all non-digits
  const digits = cnic.replace(/\D/g, '');
  // Format as 00000-0000000-0
  if (digits.length >= 13) {
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
  }
  return cnic;
};

export const formatIBAN = (iban: string): string => {
  // Remove spaces
  const clean = iban.replace(/\s/g, '').toUpperCase();
  // Add space every 4 characters
  return clean.match(/.{1,4}/g)?.join(' ') || clean;
};

export const formatPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 11)}`;
  }
  return phone;
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 2
  }).format(amount);
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('en-PK').format(num);
};

export const formatDate = (date: string): string => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-PK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};
