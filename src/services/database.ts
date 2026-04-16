import type {
  ParentBeneficiary,
  DocumentTracking,
  BankingDetails,
  DependentChildren,
  MonthlyGrants,
  ChildGadgets,
  User,
  AuditLog,
  ParentWithDetails,
  ChildWithDetails,
  GrantWithChild,
  DashboardKPIs,
  SearchResult,
  DisabilityCategory
} from '@/types';

// Database Keys
const DB_KEYS = {
  PARENTS: 'scms_parents',
  DOCUMENTS: 'scms_documents',
  BANKING: 'scms_banking',
  CHILDREN: 'scms_children',
  GRANTS: 'scms_grants',
  GADGETS: 'scms_gadgets',
  USERS: 'scms_users',
  AUDIT_LOG: 'scms_audit_log',
  CURRENT_USER: 'scms_current_user',
  NOTIFICATIONS: 'scms_notifications'
};

// Initialize default data
const initializeDefaultData = () => {
  // Default admin user
  const defaultUsers: User[] = [
    {
      User_ID: 1,
      Username: 'admin',
      Email: 'admin@scms.gov',
      Password_Hash: 'admin123', // In production, this would be hashed
      Role: 'Admin',
      Full_Name: 'System Administrator',
      Is_Active: true,
      created_at: new Date().toISOString()
    },
    {
      User_ID: 2,
      Username: 'finance',
      Email: 'finance@scms.gov',
      Password_Hash: 'finance123',
      Role: 'Finance Officer',
      Full_Name: 'Finance Officer',
      Is_Active: true,
      created_at: new Date().toISOString()
    },
    {
      User_ID: 3,
      Username: 'operator',
      Email: 'operator@scms.gov',
      Password_Hash: 'operator123',
      Role: 'Operator',
      Full_Name: 'Data Entry Operator',
      Is_Active: true,
      created_at: new Date().toISOString()
    }
  ];

  if (!localStorage.getItem(DB_KEYS.USERS)) {
    localStorage.setItem(DB_KEYS.USERS, JSON.stringify(defaultUsers));
  }

  // Initialize empty arrays for other tables
  Object.values(DB_KEYS).forEach(key => {
    if (!localStorage.getItem(key) && key !== DB_KEYS.USERS && key !== DB_KEYS.CURRENT_USER) {
      localStorage.setItem(key, JSON.stringify([]));
    }
  });
};

// Generic CRUD operations
class DatabaseService {
  constructor() {
    initializeDefaultData();
  }

  // Get next ID
  private getNextId(key: string): number {
    const items = this.getAll<any>(key);
    if (items.length === 0) return 1;
    const maxId = Math.max(...items.map(item => item[Object.keys(item).find(k => k.endsWith('_ID')) || 'id'] || 0));
    return maxId + 1;
  }

  // Generic get all
  private getAll<T>(key: string): T[] {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  }

  // Generic get by ID
  private getById<T>(key: string, idField: string, id: number | string): T | null {
    const items = this.getAll<T>(key);
    return items.find((item: any) => item[idField] === id) || null;
  }

  // Generic create
  private create<T>(key: string, item: T, idField: string): T {
    const items = this.getAll<T>(key);
    const newItem = { ...item, [idField]: this.getNextId(key) };
    items.push(newItem);
    localStorage.setItem(key, JSON.stringify(items));
    return newItem;
  }

  // Generic update
  private update<T>(key: string, idField: string, id: number | string, updates: Partial<T>): T | null {
    const items = this.getAll<T>(key);
    const index = items.findIndex((item: any) => item[idField] === id);
    if (index === -1) return null;
    items[index] = { ...items[index], ...updates, updated_at: new Date().toISOString() };
    localStorage.setItem(key, JSON.stringify(items));
    return items[index];
  }

  // Generic delete
  private delete(key: string, idField: string, id: number | string): boolean {
    const items = this.getAll<any>(key);
    const filtered = items.filter((item: any) => item[idField] !== id);
    if (filtered.length === items.length) return false;
    localStorage.setItem(key, JSON.stringify(filtered));
    return true;
  }

  // ============ PARENT BENEFICIARY ============
  getAllParents(): ParentBeneficiary[] {
    return this.getAll<ParentBeneficiary>(DB_KEYS.PARENTS);
  }

  getParentById(pNo: string): ParentBeneficiary | null {
    return this.getById<ParentBeneficiary>(DB_KEYS.PARENTS, 'P_No_O_No', pNo);
  }

  createParent(parent: Omit<ParentBeneficiary, 'created_at'>): ParentBeneficiary {
    const newParent = { ...parent, created_at: new Date().toISOString() };
    const items = this.getAll<ParentBeneficiary>(DB_KEYS.PARENTS);
    items.push(newParent);
    localStorage.setItem(DB_KEYS.PARENTS, JSON.stringify(items));
    this.logAudit('Parent_Beneficiary', parent.P_No_O_No, 'CREATE', undefined, newParent);
    return newParent;
  }

  updateParent(pNo: string, updates: Partial<ParentBeneficiary>): ParentBeneficiary | null {
    const oldParent = this.getParentById(pNo);
    const items = this.getAll<ParentBeneficiary>(DB_KEYS.PARENTS);
    const index = items.findIndex(p => p.P_No_O_No === pNo);
    if (index === -1) return null;
    items[index] = { ...items[index], ...updates, updated_at: new Date().toISOString() };
    localStorage.setItem(DB_KEYS.PARENTS, JSON.stringify(items));
    this.logAudit('Parent_Beneficiary', pNo, 'UPDATE', oldParent, items[index]);
    return items[index];
  }

  deleteParent(pNo: string): boolean {
    const oldParent = this.getParentById(pNo);
    // CASCADE: Delete related records
    this.deleteAllChildrenByParent(pNo);
    this.deleteDocumentByParent(pNo);
    this.deleteBankingByParent(pNo);
    
    const result = this.delete(DB_KEYS.PARENTS, 'P_No_O_No', pNo);
    if (result) {
      this.logAudit('Parent_Beneficiary', pNo, 'DELETE', oldParent, undefined);
    }
    return result;
  }

  getParentsByStatus(status: string): ParentBeneficiary[] {
    return this.getAllParents().filter(p => p.Service_Status === status);
  }

  // ============ DOCUMENT TRACKING ============
  getAllDocuments(): DocumentTracking[] {
    return this.getAll<DocumentTracking>(DB_KEYS.DOCUMENTS);
  }

  getDocumentByParent(pNo: string): DocumentTracking | null {
    return this.getAllDocuments().find(d => d.P_No_O_No === pNo) || null;
  }

  createDocument(doc: Omit<DocumentTracking, 'Doc_ID'>): DocumentTracking {
    const newDoc = this.create<DocumentTracking>(DB_KEYS.DOCUMENTS, doc, 'Doc_ID');
    this.logAudit('Document_Tracking', newDoc.Doc_ID.toString(), 'CREATE', undefined, newDoc);
    return newDoc;
  }

  updateDocument(docId: number, updates: Partial<DocumentTracking>): DocumentTracking | null {
    const oldDoc = this.getById<DocumentTracking>(DB_KEYS.DOCUMENTS, 'Doc_ID', docId);
    const result = this.update<DocumentTracking>(DB_KEYS.DOCUMENTS, 'Doc_ID', docId, updates);
    if (result) {
      this.logAudit('Document_Tracking', docId.toString(), 'UPDATE', oldDoc, result);
    }
    return result;
  }

  deleteDocumentByParent(pNo: string): boolean {
    const docs = this.getAllDocuments();
    const doc = docs.find(d => d.P_No_O_No === pNo);
    if (doc) {
      return this.delete(DB_KEYS.DOCUMENTS, 'Doc_ID', doc.Doc_ID);
    }
    return false;
  }

  // ============ BANKING DETAILS ============
  getAllBanking(): BankingDetails[] {
    return this.getAll<BankingDetails>(DB_KEYS.BANKING);
  }

  getBankingByParent(pNo: string): BankingDetails | null {
    return this.getAllBanking().find(b => b.P_No_O_No === pNo) || null;
  }

  createBanking(banking: Omit<BankingDetails, 'Account_ID'>): BankingDetails {
    const newBanking = this.create<BankingDetails>(DB_KEYS.BANKING, banking, 'Account_ID');
    this.logAudit('Banking_Details', newBanking.Account_ID.toString(), 'CREATE', undefined, newBanking);
    return newBanking;
  }

  updateBanking(accountId: number, updates: Partial<BankingDetails>): BankingDetails | null {
    const oldBanking = this.getById<BankingDetails>(DB_KEYS.BANKING, 'Account_ID', accountId);
    const result = this.update<BankingDetails>(DB_KEYS.BANKING, 'Account_ID', accountId, updates);
    if (result) {
      this.logAudit('Banking_Details', accountId.toString(), 'UPDATE', oldBanking, result);
    }
    return result;
  }

  deleteBankingByParent(pNo: string): boolean {
    const banking = this.getAllBanking();
    const record = banking.find(b => b.P_No_O_No === pNo);
    if (record) {
      return this.delete(DB_KEYS.BANKING, 'Account_ID', record.Account_ID);
    }
    return false;
  }

  // ============ DEPENDENT CHILDREN ============
  getAllChildren(): DependentChildren[] {
    return this.getAll<DependentChildren>(DB_KEYS.CHILDREN);
  }

  getChildrenByParent(pNo: string): DependentChildren[] {
    return this.getAllChildren().filter(c => c.P_No_O_No === pNo);
  }

  getChildById(childId: number): DependentChildren | null {
    return this.getById<DependentChildren>(DB_KEYS.CHILDREN, 'Child_ID', childId);
  }

  createChild(child: Omit<DependentChildren, 'Child_ID'>): DependentChildren {
    const newChild = this.create<DependentChildren>(DB_KEYS.CHILDREN, child, 'Child_ID');
    this.logAudit('Dependent_Children', newChild.Child_ID.toString(), 'CREATE', undefined, newChild);
    return newChild;
  }

  updateChild(childId: number, updates: Partial<DependentChildren>): DependentChildren | null {
    const oldChild = this.getChildById(childId);
    const result = this.update<DependentChildren>(DB_KEYS.CHILDREN, 'Child_ID', childId, updates);
    if (result) {
      this.logAudit('Dependent_Children', childId.toString(), 'UPDATE', oldChild, result);
    }
    return result;
  }

  deleteChild(childId: number): boolean {
    const oldChild = this.getChildById(childId);
    // CASCADE: Delete related records
    this.deleteAllGrantsByChild(childId);
    this.deleteAllGadgetsByChild(childId);
    
    const result = this.delete(DB_KEYS.CHILDREN, 'Child_ID', childId);
    if (result) {
      this.logAudit('Dependent_Children', childId.toString(), 'DELETE', oldChild, undefined);
    }
    return result;
  }

  deleteAllChildrenByParent(pNo: string): void {
    const children = this.getChildrenByParent(pNo);
    children.forEach(child => this.deleteChild(child.Child_ID));
  }

  getChildrenByCategory(category: DisabilityCategory): DependentChildren[] {
    return this.getAllChildren().filter(c => c.Disability_Category === category);
  }

  // ============ MONTHLY GRANTS ============
  getAllGrants(): MonthlyGrants[] {
    return this.getAll<MonthlyGrants>(DB_KEYS.GRANTS);
  }

  getGrantsByChild(childId: number): MonthlyGrants[] {
    return this.getAllGrants().filter(g => g.Child_ID === childId);
  }

  getGrantById(grantId: number): MonthlyGrants | null {
    return this.getById<MonthlyGrants>(DB_KEYS.GRANTS, 'Grant_ID', grantId);
  }

  createGrant(grant: Omit<MonthlyGrants, 'Grant_ID'>): MonthlyGrants {
    const newGrant = this.create<MonthlyGrants>(DB_KEYS.GRANTS, grant, 'Grant_ID');
    this.logAudit('Monthly_Grants', newGrant.Grant_ID.toString(), 'CREATE', undefined, newGrant);
    return newGrant;
  }

  updateGrant(grantId: number, updates: Partial<MonthlyGrants>): MonthlyGrants | null {
    const oldGrant = this.getGrantById(grantId);
    const result = this.update<MonthlyGrants>(DB_KEYS.GRANTS, 'Grant_ID', grantId, updates);
    if (result) {
      this.logAudit('Monthly_Grants', grantId.toString(), 'UPDATE', oldGrant, result);
    }
    return result;
  }

  deleteGrant(grantId: number): boolean {
    const oldGrant = this.getGrantById(grantId);
    const result = this.delete(DB_KEYS.GRANTS, 'Grant_ID', grantId);
    if (result) {
      this.logAudit('Monthly_Grants', grantId.toString(), 'DELETE', oldGrant, undefined);
    }
    return result;
  }

  deleteAllGrantsByChild(childId: number): void {
    const grants = this.getGrantsByChild(childId);
    grants.forEach(grant => this.deleteGrant(grant.Grant_ID));
  }

  getExpiringGrants(days: number = 30): MonthlyGrants[] {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + days);
    
    return this.getAllGrants().filter(grant => {
      const approvedTo = new Date(grant.Approved_To);
      return approvedTo <= futureDate && approvedTo >= today;
    });
  }

  // ============ CHILD GADGETS ============
  getAllGadgets(): ChildGadgets[] {
    return this.getAll<ChildGadgets>(DB_KEYS.GADGETS);
  }

  getGadgetsByChild(childId: number): ChildGadgets[] {
    return this.getAllGadgets().filter(g => g.Child_ID === childId);
  }

  getGadgetById(gadgetId: number): ChildGadgets | null {
    return this.getById<ChildGadgets>(DB_KEYS.GADGETS, 'Gadget_ID', gadgetId);
  }

  createGadget(gadget: Omit<ChildGadgets, 'Gadget_ID' | 'Tax_18_Percent' | 'Total_Cost'>): ChildGadgets {
    const tax = gadget.Base_Cost * 0.18;
    const total = gadget.Base_Cost + tax;
    const newGadget = this.create<ChildGadgets>(DB_KEYS.GADGETS, {
      ...gadget,
      Tax_18_Percent: tax,
      Total_Cost: total
    }, 'Gadget_ID');
    this.logAudit('Child_Gadgets', newGadget.Gadget_ID.toString(), 'CREATE', undefined, newGadget);
    return newGadget;
  }

  updateGadget(gadgetId: number, updates: Partial<ChildGadgets>): ChildGadgets | null {
    const oldGadget = this.getGadgetById(gadgetId);
    let updateData = { ...updates };
    
    // Recalculate tax and total if base cost changes
    if (updates.Base_Cost !== undefined) {
      updateData.Tax_18_Percent = updates.Base_Cost * 0.18;
      updateData.Total_Cost = updates.Base_Cost + updateData.Tax_18_Percent;
    }
    
    const result = this.update<ChildGadgets>(DB_KEYS.GADGETS, 'Gadget_ID', gadgetId, updateData);
    if (result) {
      this.logAudit('Child_Gadgets', gadgetId.toString(), 'UPDATE', oldGadget, result);
    }
    return result;
  }

  deleteGadget(gadgetId: number): boolean {
    const oldGadget = this.getGadgetById(gadgetId);
    const result = this.delete(DB_KEYS.GADGETS, 'Gadget_ID', gadgetId);
    if (result) {
      this.logAudit('Child_Gadgets', gadgetId.toString(), 'DELETE', oldGadget, undefined);
    }
    return result;
  }

  deleteAllGadgetsByChild(childId: number): void {
    const gadgets = this.getGadgetsByChild(childId);
    gadgets.forEach(gadget => this.deleteGadget(gadget.Gadget_ID));
  }

  getPendingGadgets(): ChildGadgets[] {
    return this.getAllGadgets().filter(g => g.Acquisition_Type === 'Reimbursed');
  }

  // ============ USERS ============
  getAllUsers(): User[] {
    return this.getAll<User>(DB_KEYS.USERS);
  }

  getUserById(userId: number): User | null {
    return this.getById<User>(DB_KEYS.USERS, 'User_ID', userId);
  }

  getUserByUsername(username: string): User | null {
    return this.getAllUsers().find(u => u.Username === username) || null;
  }

  createUser(user: Omit<User, 'User_ID'>): User {
    return this.create<User>(DB_KEYS.USERS, user, 'User_ID');
  }

  updateUser(userId: number, updates: Partial<User>): User | null {
    return this.update<User>(DB_KEYS.USERS, 'User_ID', userId, updates);
  }

  deleteUser(userId: number): boolean {
    return this.delete(DB_KEYS.USERS, 'User_ID', userId);
  }

  // ============ AUDIT LOG ============
  getAllAuditLogs(): AuditLog[] {
    return this.getAll<AuditLog>(DB_KEYS.AUDIT_LOG).sort((a, b) => 
      new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime()
    );
  }

  logAudit(tableName: string, recordId: string, action: 'CREATE' | 'UPDATE' | 'DELETE', 
           oldValues?: any, newValues?: any): void {
    const currentUser = this.getCurrentUser();
    const log: AuditLog = {
      Log_ID: this.getNextId(DB_KEYS.AUDIT_LOG),
      Table_Name: tableName,
      Record_ID: recordId,
      Action: action,
      Old_Values: oldValues ? JSON.stringify(oldValues) : undefined,
      New_Values: newValues ? JSON.stringify(newValues) : undefined,
      User_ID: currentUser?.User_ID || 0,
      Username: currentUser?.Username || 'system',
      Timestamp: new Date().toISOString()
    };
    
    const logs = this.getAll<AuditLog>(DB_KEYS.AUDIT_LOG);
    logs.push(log);
    localStorage.setItem(DB_KEYS.AUDIT_LOG, JSON.stringify(logs));
  }

  // ============ AUTHENTICATION ============
  login(username: string, password: string): User | null {
    const user = this.getUserByUsername(username);
    if (user && user.Password_Hash === password && user.Is_Active) {
      user.Last_Login = new Date().toISOString();
      this.updateUser(user.User_ID, { Last_Login: user.Last_Login });
      localStorage.setItem(DB_KEYS.CURRENT_USER, JSON.stringify(user));
      return user;
    }
    return null;
  }

  logout(): void {
    localStorage.removeItem(DB_KEYS.CURRENT_USER);
  }

  getCurrentUser(): User | null {
    const data = localStorage.getItem(DB_KEYS.CURRENT_USER);
    return data ? JSON.parse(data) : null;
  }

  isAuthenticated(): boolean {
    return !!this.getCurrentUser();
  }

  hasRole(role: string | string[]): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;
    if (Array.isArray(role)) {
      return role.includes(user.Role);
    }
    return user.Role === role;
  }

  // ============ COMPOSITE QUERIES ============
  getParentWithDetails(pNo: string): ParentWithDetails | null {
    const parent = this.getParentById(pNo);
    if (!parent) return null;
    
    return {
      ...parent,
      documents: this.getDocumentByParent(pNo) || undefined,
      banking: this.getBankingByParent(pNo) || undefined,
      children: this.getChildrenByParent(pNo).map(child => this.getChildWithDetails(child.Child_ID) as ChildWithDetails)
    };
  }

  getChildWithDetails(childId: number): ChildWithDetails | null {
    const child = this.getChildById(childId);
    if (!child) return null;
    
    return {
      ...child,
      grants: this.getGrantsByChild(childId),
      gadgets: this.getGadgetsByChild(childId),
      parent: this.getParentById(child.P_No_O_No) || undefined
    };
  }

  getAllGrantsWithDetails(): GrantWithChild[] {
    return this.getAllGrants().map(grant => {
      const child = this.getChildById(grant.Child_ID);
      const parent = child ? this.getParentById(child.P_No_O_No) : null;
      const banking = parent ? this.getBankingByParent(parent.P_No_O_No) : null;
      
      return {
        ...grant,
        child,
        parent,
        banking
      };
    });
  }

  // ============ DASHBOARD KPIs ============
  getDashboardKPIs(): DashboardKPIs {
    const grants = this.getAllGrants();
    const children = this.getAllChildren();
    const gadgets = this.getAllGadgets();
    const parents = this.getAllParents();
    
    const totalMonthlyDisbursement = grants.reduce((sum, g) => sum + (g.Monthly_Amount || 0), 0);
    const pendingGadgetRequests = gadgets.filter(g => g.Acquisition_Type === 'Reimbursed').length;
    const expiringGrantsCount = this.getExpiringGrants(30).length;
    
    const grantsByCategory: { category: DisabilityCategory; count: number; amount: number }[] = [
      { category: 'A', count: 0, amount: 0 },
      { category: 'B', count: 0, amount: 0 },
      { category: 'C', count: 0, amount: 0 }
    ];
    
    children.forEach(child => {
      const childGrants = this.getGrantsByChild(child.Child_ID);
      const totalAmount = childGrants.reduce((sum, g) => sum + (g.Monthly_Amount || 0), 0);
      const categoryData = grantsByCategory.find(c => c.category === child.Disability_Category);
      if (categoryData) {
        categoryData.count++;
        categoryData.amount += totalAmount;
      }
    });
    
    return {
      totalMonthlyDisbursement,
      totalChildrenRegistered: children.length,
      pendingGadgetRequests,
      totalParents: parents.length,
      expiringGrantsCount,
      grantsByCategory
    };
  }

  // ============ SEARCH ============
  search(query: string): SearchResult[] {
    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();
    
    // Search parents
    this.getAllParents().forEach(parent => {
      if (parent.P_No_O_No.toLowerCase().includes(lowerQuery) ||
          parent.Parent_Name.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: 'parent',
          id: parent.P_No_O_No,
          title: parent.Parent_Name,
          subtitle: `P/No: ${parent.P_No_O_No}`,
          status: parent.Service_Status
        });
      }
    });
    
    // Search children
    this.getAllChildren().forEach(child => {
      if (child.Child_Name.toLowerCase().includes(lowerQuery) ||
          child.CNIC_BForm_No.toLowerCase().includes(lowerQuery)) {
        const parent = this.getParentById(child.P_No_O_No);
        results.push({
          type: 'child',
          id: child.Child_ID,
          title: child.Child_Name,
          subtitle: `Parent: ${parent?.Parent_Name || 'Unknown'}`,
          status: `Category ${child.Disability_Category}`
        });
      }
    });
    
    return results;
  }

  // ============ EXPORT ============
  exportPayrollData(): GrantWithChild[] {
    return this.getAllGrantsWithDetails().filter(g => {
      const approvedTo = new Date(g.Approved_To);
      return approvedTo >= new Date();
    });
  }

  // ============ NOTIFICATIONS ============
  getNotifications(): any[] {
    const data = localStorage.getItem(DB_KEYS.NOTIFICATIONS);
    return data ? JSON.parse(data) : [];
  }

  addNotification(notification: any): void {
    const notifications = this.getNotifications();
    notifications.push({
      ...notification,
      id: Date.now(),
      created_at: new Date().toISOString(),
      read: false
    });
    localStorage.setItem(DB_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
  }

  markNotificationRead(id: number): void {
    const notifications = this.getNotifications();
    const index = notifications.findIndex(n => n.id === id);
    if (index !== -1) {
      notifications[index].read = true;
      localStorage.setItem(DB_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
    }
  }

  // ============ SAMPLE DATA ============
  seedSampleData(): void {
    // Sample Parents
    const parents: Omit<ParentBeneficiary, 'created_at'>[] = [
      {
        P_No_O_No: 'P-12345',
        Parent_Name: 'Muhammad Ahmad Khan',
        Rank_Rate: 'Captain',
        Unit: '5th Infantry Battalion',
        Admin_Authority: 'GHQ Rawalpindi',
        Service_Status: 'Serving',
        Parent_CNIC: '35201-1234567-1'
      },
      {
        P_No_O_No: 'P-12346',
        Parent_Name: 'Ali Hassan Shah',
        Rank_Rate: 'Major',
        Unit: '10th Artillery Regiment',
        Admin_Authority: 'GHQ Rawalpindi',
        Service_Status: 'Retired',
        Parent_CNIC: '35201-2345678-2'
      },
      {
        P_No_O_No: 'P-12347',
        Parent_Name: 'Fatima Bibi',
        Rank_Rate: 'Lieutenant Colonel',
        Unit: 'Medical Corps',
        Admin_Authority: 'CMH Lahore',
        Service_Status: 'Serving',
        Parent_CNIC: '35201-3456789-3'
      },
      {
        P_No_O_No: 'P-12348',
        Parent_Name: 'Imranullah Khan',
        Rank_Rate: 'Naib Subedar',
        Unit: 'Frontier Force Regiment',
        Admin_Authority: 'Peshawar Garrison',
        Service_Status: 'Expired',
        Parent_CNIC: '35201-4567890-4'
      }
    ];

    parents.forEach(p => this.createParent(p));

    // Sample Documents
    const documents: Omit<DocumentTracking, 'Doc_ID'>[] = [
      { P_No_O_No: 'P-12345', Letter_Reference: 'GHQ/2024/1234', Contact_No: '0300-1234567', Almirah_No: 'A-01', File_No: 'F-1001' },
      { P_No_O_No: 'P-12346', Letter_Reference: 'GHQ/2024/1235', Contact_No: '0300-2345678', Almirah_No: 'A-02', File_No: 'F-1002' },
      { P_No_O_No: 'P-12347', Letter_Reference: 'CMH/2024/567', Contact_No: '0300-3456789', Almirah_No: 'B-01', File_No: 'F-2001' },
      { P_No_O_No: 'P-12348', Letter_Reference: 'PG/2024/890', Contact_No: '0300-4567890', Almirah_No: 'A-03', File_No: 'F-1003' }
    ];

    documents.forEach(d => this.createDocument(d));

    // Sample Banking
    const banking: Omit<BankingDetails, 'Account_ID'>[] = [
      { P_No_O_No: 'P-12345', Account_Title: 'Muhammad Ahmad Khan', IBAN: 'PK36SCBL0000001123456701', Bank_Name_Branch: 'Standard Chartered Bank, Lahore' },
      { P_No_O_No: 'P-12346', Account_Title: 'Ali Hassan Shah', IBAN: 'PK36SCBL0000001123456702', Bank_Name_Branch: 'Standard Chartered Bank, Islamabad' },
      { P_No_O_No: 'P-12347', Account_Title: 'Fatima Bibi', IBAN: 'PK36SCBL0000001123456703', Bank_Name_Branch: 'HBL Bank, Lahore' },
      { P_No_O_No: 'P-12348', Account_Title: 'Imranullah Khan', IBAN: 'PK36SCBL0000001123456704', Bank_Name_Branch: 'UBL Bank, Peshawar' }
    ];

    banking.forEach(b => this.createBanking(b));

    // Sample Children
    const children: Omit<DependentChildren, 'Child_ID'>[] = [
      { P_No_O_No: 'P-12345', Child_Name: 'Ahmad Khan Jr.', Age: 8, CNIC_BForm_No: '35201-1234567-0001', Disease_Disability: 'Autism Spectrum Disorder', Disability_Category: 'A', School: 'Special Education School Lahore' },
      { P_No_O_No: 'P-12345', Child_Name: 'Sara Khan', Age: 12, CNIC_BForm_No: '35201-1234567-0002', Disease_Disability: 'Cerebral Palsy', Disability_Category: 'B', School: 'Rehabilitation Center Islamabad' },
      { P_No_O_No: 'P-12346', Child_Name: 'Hassan Shah', Age: 6, CNIC_BForm_No: '35201-2345678-0001', Disease_Disability: 'Down Syndrome', Disability_Category: 'A', School: 'Special Children Academy' },
      { P_No_O_No: 'P-12347', Child_Name: 'Ayesha Bibi', Age: 15, CNIC_BForm_No: '35201-3456789-0001', Disease_Disability: 'Hearing Impairment', Disability_Category: 'C', School: 'Deaf Reach School' },
      { P_No_O_No: 'P-12348', Child_Name: 'Kamran Khan', Age: 10, CNIC_BForm_No: '35201-4567890-0001', Disease_Disability: 'Visual Impairment', Disability_Category: 'B', School: 'Blind School Peshawar' }
    ];

    children.forEach(c => this.createChild(c));

    // Sample Grants
    const today = new Date();
    const futureDate = new Date();
    futureDate.setFullYear(today.getFullYear() + 1);
    
    const expiringSoon = new Date();
    expiringSoon.setDate(today.getDate() + 15);

    const grants: Omit<MonthlyGrants, 'Grant_ID'>[] = [
      { Child_ID: 1, Monthly_Amount: 25000, Total_CFY_Amount: 300000, Approved_From: today.toISOString().split('T')[0], Approved_To: futureDate.toISOString().split('T')[0] },
      { Child_ID: 2, Monthly_Amount: 35000, Total_CFY_Amount: 420000, Approved_From: today.toISOString().split('T')[0], Approved_To: futureDate.toISOString().split('T')[0] },
      { Child_ID: 3, Monthly_Amount: 28000, Total_CFY_Amount: 336000, Approved_From: today.toISOString().split('T')[0], Approved_To: expiringSoon.toISOString().split('T')[0] },
      { Child_ID: 4, Monthly_Amount: 15000, Total_CFY_Amount: 180000, Approved_From: today.toISOString().split('T')[0], Approved_To: futureDate.toISOString().split('T')[0] },
      { Child_ID: 5, Monthly_Amount: 22000, Total_CFY_Amount: 264000, Approved_From: today.toISOString().split('T')[0], Approved_To: expiringSoon.toISOString().split('T')[0] }
    ];

    grants.forEach(g => this.createGrant(g));

    // Sample Gadgets
    const gadgets: Omit<ChildGadgets, 'Gadget_ID' | 'Tax_18_Percent' | 'Total_Cost'>[] = [
      { Child_ID: 1, Detail_of_Gadgets: 'Communication Tablet with AAC Software', Base_Cost: 85000, Acquisition_Type: 'Off the Shelf' },
      { Child_ID: 2, Detail_of_Gadgets: 'Motorized Wheelchair', Base_Cost: 150000, Acquisition_Type: 'Customized' },
      { Child_ID: 3, Detail_of_Gadgets: 'Educational Tablet', Base_Cost: 45000, Acquisition_Type: 'Reimbursed' },
      { Child_ID: 4, Detail_of_Gadgets: 'Hearing Aids (Pair)', Base_Cost: 120000, Acquisition_Type: 'Off the Shelf' },
      { Child_ID: 5, Detail_of_Gadgets: 'Braille Display Device', Base_Cost: 95000, Acquisition_Type: 'Reimbursed' }
    ];

    gadgets.forEach(g => this.createGadget(g));
  }
}

export const db = new DatabaseService();
export default db;
