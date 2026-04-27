// Database Schema Types

export type ServiceStatus = 'Serving' | 'Retired' | 'Expired';
export type AcquisitionType = 'Off the Shelf' | 'Customized' | 'Reimbursed';
export type UserRole = 'Admin' | 'Finance Officer' | 'Operator';
export type DisabilityCategory = 'A' | 'B' | 'C';

// Core Identity
export interface ParentBeneficiary {
  P_No_O_No: string;
  Parent_Name: string;
  Rank_Rate: string;
  Unit: string;
  Admin_Authority: string;
  Service_Status: ServiceStatus;
  Parent_CNIC: string;
  created_at?: string;
  updated_at?: string;
}

// Documentation Tracking
export interface DocumentTracking {
  Doc_ID: number;
  P_No_O_No: string;
  Letter_Reference: string;
  Contact_No: string;
  Almirah_No: string;
  File_No: string;
}

export interface ScannedDocumentFile {
  Document_File_ID: number;
  P_No_O_No: string;
  Doc_Type?: string;
  Original_File_Name: string;
  Stored_File_Name: string;
  Mime_Type: string;
  File_Size_Bytes: number;
  Storage_Path: string;
  Uploaded_At: string;
}

// Banking Layer
export interface BankingDetails {
  Account_ID: number;
  P_No_O_No: string;
  Account_Title: string;
  IBAN: string;
  Bank_Name_Branch: string;
}

// Child Medical Profile
export interface DependentChildren {
  Child_ID: number;
  P_No_O_No: string;
  Child_Name: string;
  Age: number;
  CNIC_BForm_No: string;
  Disease_Disability: string;
  Disability_Category: DisabilityCategory;
  School: string;
}

// Financials
export interface MonthlyGrants {
  Grant_ID: number;
  Child_ID: number;
  Monthly_Amount: number;
  Total_CFY_Amount: number;
  Approved_From: string;
  Approved_To: string;
}

// Gadgets
export interface ChildGadgets {
  Gadget_ID: number;
  Child_ID: number;
  Detail_of_Gadgets: string;
  Base_Cost: number;
  Tax_18_Percent: number;
  Total_Cost: number;
  Acquisition_Type: AcquisitionType;
}

// User Management
export interface User {
  User_ID: number;
  Username: string;
  Email: string;
  Password_Hash: string;
  Role: UserRole;
  Full_Name: string;
  Is_Active: boolean;
  Last_Login?: string;
  created_at?: string;
}

// Audit Log
export interface AuditLog {
  Log_ID: number;
  Table_Name: string;
  Record_ID: string;
  Action: 'CREATE' | 'UPDATE' | 'DELETE';
  Old_Values?: string;
  New_Values?: string;
  User_ID: number;
  Username: string;
  Timestamp: string;
}

// Composite Types for UI
export interface ParentWithDetails extends ParentBeneficiary {
  documents?: DocumentTracking;
  scannedDocuments?: ScannedDocumentFile[];
  banking?: BankingDetails;
  children?: ChildWithDetails[];
}

export interface ChildWithDetails extends DependentChildren {
  grants?: MonthlyGrants[];
  gadgets?: ChildGadgets[];
  parent?: ParentBeneficiary;
}

export interface GrantWithChild extends MonthlyGrants {
  child?: DependentChildren;
  parent?: ParentBeneficiary;
  banking?: BankingDetails;
}

// KPI Types
export interface DashboardKPIs {
  totalMonthlyDisbursement: number;
  totalChildrenRegistered: number;
  pendingGadgetRequests: number;
  totalParents: number;
  expiringGrantsCount: number;
  grantsByCategory: { category: DisabilityCategory; count: number; amount: number }[];
}

// Search Result Type
export interface SearchResult {
  type: 'parent' | 'child';
  id: string | number;
  title: string;
  subtitle: string;
  status?: string;
}

// Form Validation Types
export interface ValidationError {
  field: string;
  message: string;
}

// Notification Type
export interface Notification {
  id: number;
  type: 'warning' | 'info' | 'success' | 'error';
  title: string;
  message: string;
  created_at: string;
  read: boolean;
}
