import { useState, useEffect, useCallback } from 'react';
import { db } from '@/services/database';
import type { 
  ParentBeneficiary, 
  DependentChildren, 
  MonthlyGrants, 
  ChildGadgets,
  DocumentTracking,
  ScannedDocumentFile,
  BankingDetails,
  DashboardKPIs,
  SearchResult,
  ParentWithDetails,
  ChildWithDetails,
  GrantWithChild,
  AuditLog,
  User,
} from '@/types';

type ViteImportMeta = ImportMeta & { env?: Record<string, string | undefined> };
const API_BASE_URL = (import.meta as ViteImportMeta).env?.VITE_API_URL || 'http://localhost:3001/api';

function useDbRefresh(refresh: () => void) {
  useEffect(() => {
    refresh();
    return db.subscribe(refresh);
  }, [refresh]);
}

// Generic hook for data fetching
export function useData<T>(fetcher: () => T, deps: any[] = []): T {
  const [data, setData] = useState<T>(fetcher());

  useEffect(() => {
    setData(fetcher());
  }, deps);

  return data;
}

// Parents
export function useParents() {
  const [parents, setParents] = useState<ParentBeneficiary[]>([]);

  const refresh = useCallback(() => {
    setParents(db.getAllParents());
  }, []);

  useDbRefresh(refresh);

  const create = useCallback((parent: Omit<ParentBeneficiary, 'created_at'>) => {
    const result = db.createParent(parent);
    refresh();
    return result;
  }, [refresh]);

  const update = useCallback((pNo: string, updates: Partial<ParentBeneficiary>) => {
    const result = db.updateParent(pNo, updates);
    refresh();
    return result;
  }, [refresh]);

  const remove = useCallback((pNo: string) => {
    const result = db.deleteParent(pNo);
    refresh();
    return result;
  }, [refresh]);

  return { parents, create, update, remove, refresh };
}

export function useParentWithDetails(pNo: string | null) {
  const [parent, setParent] = useState<ParentWithDetails | null>(null);

  const refresh = useCallback(() => {
    if (pNo) {
      setParent(db.getParentWithDetails(pNo));
    }
  }, [pNo]);

  useDbRefresh(refresh);

  return { parent, refresh };
}

// Children
export function useChildren() {
  const [children, setChildren] = useState<DependentChildren[]>([]);

  const refresh = useCallback(() => {
    setChildren(db.getAllChildren());
  }, []);

  useDbRefresh(refresh);

  const create = useCallback((child: Omit<DependentChildren, 'Child_ID'>) => {
    const result = db.createChild(child);
    refresh();
    return result;
  }, [refresh]);

  const update = useCallback((childId: number, updates: Partial<DependentChildren>) => {
    const result = db.updateChild(childId, updates);
    refresh();
    return result;
  }, [refresh]);

  const remove = useCallback((childId: number) => {
    const result = db.deleteChild(childId);
    refresh();
    return result;
  }, [refresh]);

  return { children, create, update, remove, refresh };
}

export function useChildrenByParent(pNo: string) {
  const [children, setChildren] = useState<DependentChildren[]>([]);

  const refresh = useCallback(() => {
    setChildren(db.getChildrenByParent(pNo));
  }, [pNo]);

  useDbRefresh(refresh);

  return { children, refresh };
}

export function useChildWithDetails(childId: number | null) {
  const [child, setChild] = useState<ChildWithDetails | null>(null);

  const refresh = useCallback(() => {
    if (childId) {
      setChild(db.getChildWithDetails(childId));
    }
  }, [childId]);

  useDbRefresh(refresh);

  return { child, refresh };
}

// Grants
export function useGrants() {
  const [grants, setGrants] = useState<MonthlyGrants[]>([]);

  const refresh = useCallback(() => {
    setGrants(db.getAllGrants());
  }, []);

  useDbRefresh(refresh);

  const create = useCallback((grant: Omit<MonthlyGrants, 'Grant_ID'>) => {
    const result = db.createGrant(grant);
    refresh();
    return result;
  }, [refresh]);

  const update = useCallback((grantId: number, updates: Partial<MonthlyGrants>) => {
    const result = db.updateGrant(grantId, updates);
    refresh();
    return result;
  }, [refresh]);

  const remove = useCallback((grantId: number) => {
    const result = db.deleteGrant(grantId);
    refresh();
    return result;
  }, [refresh]);

  return { grants, create, update, remove, refresh };
}

export function useGrantsWithDetails() {
  const [grants, setGrants] = useState<GrantWithChild[]>([]);

  const refresh = useCallback(() => {
    setGrants(db.getAllGrantsWithDetails());
  }, []);

  useDbRefresh(refresh);

  return { grants, refresh };
}

export function useExpiringGrants(days: number = 30) {
  const [grants, setGrants] = useState<MonthlyGrants[]>([]);

  const refresh = useCallback(() => {
    setGrants(db.getExpiringGrants(days));
  }, [days]);

  useDbRefresh(refresh);

  return { grants, refresh };
}

// Gadgets
export function useGadgets() {
  const [gadgets, setGadgets] = useState<ChildGadgets[]>([]);

  const refresh = useCallback(() => {
    setGadgets(db.getAllGadgets());
  }, []);

  useDbRefresh(refresh);

  const create = useCallback((gadget: Omit<ChildGadgets, 'Gadget_ID' | 'Tax_18_Percent' | 'Total_Cost'>) => {
    const result = db.createGadget(gadget);
    refresh();
    return result;
  }, [refresh]);

  const update = useCallback((gadgetId: number, updates: Partial<ChildGadgets>) => {
    const result = db.updateGadget(gadgetId, updates);
    refresh();
    return result;
  }, [refresh]);

  const remove = useCallback((gadgetId: number) => {
    const result = db.deleteGadget(gadgetId);
    refresh();
    return result;
  }, [refresh]);

  return { gadgets, create, update, remove, refresh };
}

export function usePendingGadgets() {
  const [gadgets, setGadgets] = useState<ChildGadgets[]>([]);

  const refresh = useCallback(() => {
    setGadgets(db.getPendingGadgets());
  }, []);

  useDbRefresh(refresh);

  return { gadgets, refresh };
}

// Documents
export function useDocuments() {
  const [documents, setDocuments] = useState<DocumentTracking[]>([]);

  const refresh = useCallback(() => {
    setDocuments(db.getAllDocuments());
  }, []);

  useDbRefresh(refresh);

  const create = useCallback((doc: Omit<DocumentTracking, 'Doc_ID'>) => {
    const result = db.createDocument(doc);
    refresh();
    return result;
  }, [refresh]);

  const update = useCallback((docId: number, updates: Partial<DocumentTracking>) => {
    const result = db.updateDocument(docId, updates);
    refresh();
    return result;
  }, [refresh]);

  return { documents, create, update, refresh };
}

export function useScannedDocuments(pNo: string | null) {
  const [documents, setDocuments] = useState<ScannedDocumentFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!pNo) {
      setDocuments([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/parents/${encodeURIComponent(pNo)}/scanned-documents`);
      if (!response.ok) {
        throw new Error('Unable to load scanned documents');
      }

      const payload = (await response.json()) as ScannedDocumentFile[];
      setDocuments(payload);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load scanned documents');
    } finally {
      setLoading(false);
    }
  }, [pNo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = useCallback(async (file: File, docType?: string) => {
    if (!pNo) {
      throw new Error('Parent is required before uploading documents');
    }

    const formData = new FormData();
    formData.append('file', file);
    if (docType) {
      formData.append('docType', docType);
    }

    const response = await fetch(`${API_BASE_URL}/parents/${encodeURIComponent(pNo)}/scanned-documents`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Upload failed');
    }

    await refresh();
  }, [pNo, refresh]);

  const remove = useCallback(async (documentFileId: number) => {
    const response = await fetch(`${API_BASE_URL}/scanned-documents/${documentFileId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || 'Delete failed');
    }

    await refresh();
  }, [refresh]);

  const getFileUrl = useCallback((storagePath: string): string => {
    const uploadsBase = API_BASE_URL.replace(/\/api\/?$/, '');
    return `${uploadsBase}${storagePath}`;
  }, []);

  return {
    documents,
    loading,
    error,
    refresh,
    upload,
    remove,
    getFileUrl
  };
}

// Banking
export function useBanking() {
  const [banking, setBanking] = useState<BankingDetails[]>([]);

  const refresh = useCallback(() => {
    setBanking(db.getAllBanking());
  }, []);

  useDbRefresh(refresh);

  const create = useCallback((bank: Omit<BankingDetails, 'Account_ID'>) => {
    const result = db.createBanking(bank);
    refresh();
    return result;
  }, [refresh]);

  const update = useCallback((accountId: number, updates: Partial<BankingDetails>) => {
    const result = db.updateBanking(accountId, updates);
    refresh();
    return result;
  }, [refresh]);

  return { banking, create, update, refresh };
}

// Dashboard
export function useDashboardKPIs() {
  const [kpis, setKpis] = useState<DashboardKPIs>({
    totalMonthlyDisbursement: 0,
    totalChildrenRegistered: 0,
    pendingGadgetRequests: 0,
    totalParents: 0,
    expiringGrantsCount: 0,
    grantsByCategory: []
  });

  const refresh = useCallback(() => {
    setKpis(db.getDashboardKPIs());
  }, []);

  useDbRefresh(refresh);

  return { kpis, refresh };
}

// Search
export function useSearch(query: string) {
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const update = () => {
      if (query.trim()) {
        setResults(db.search(query));
      } else {
        setResults([]);
      }
    };

    update();
    return db.subscribe(update);
  }, [query]);

  return results;
}

// Audit Logs
export function useAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  const refresh = useCallback(() => {
    setLogs(db.getAllAuditLogs());
  }, []);

  useDbRefresh(refresh);

  return { logs, refresh };
}

// Users
export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);

  const refresh = useCallback(() => {
    setUsers(db.getAllUsers());
  }, []);

  useDbRefresh(refresh);

  const create = useCallback((user: Omit<User, 'User_ID'>) => {
    const result = db.createUser(user);
    refresh();
    return result;
  }, [refresh]);

  const update = useCallback((userId: number, updates: Partial<User>) => {
    const result = db.updateUser(userId, updates);
    refresh();
    return result;
  }, [refresh]);

  const remove = useCallback((userId: number) => {
    const result = db.deleteUser(userId);
    refresh();
    return result;
  }, [refresh]);

  return { users, create, update, remove, refresh };
}

// Seed data
export function useSeedData() {
  const seed = useCallback(() => {
    db.seedSampleData();
  }, []);

  return { seed };
}
