import { apiFetch, readApiError } from '@/services/http';

export type ReferenceType = 'authority' | 'school' | 'rank' | 'unit' | 'service_status' | 'category';

export interface ReferenceTypeDefinition {
  code: ReferenceType;
  label: string;
}

export interface ReferenceItem {
  id: number;
  type: ReferenceType;
  code: string;
  name: string;
  description: string;
  sortOrder: number;
  metadata: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceData {
  types: ReferenceTypeDefinition[];
  items: Record<ReferenceType, ReferenceItem[]>;
}

export interface CategoryRate {
  id: number;
  categoryItemId: number;
  categoryCode: string;
  categoryName: string;
  categoryActive: boolean;
  monthlyAmount: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string;
  publishedAt: string;
  publishedByName: string;
  isCurrent: boolean;
}

export interface ParentFieldPolicy {
  fieldCode: string;
  label: string;
  updateMode: 'direct' | 'approval' | 'locked';
  referenceType: ReferenceType | null;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
}

export const emptyReferenceData: ReferenceData = {
  types: [],
  items: { authority: [], school: [], rank: [], unit: [], service_status: [], category: [] }
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) throw new Error(await readApiError(response, 'Unable to load configuration.'));
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const configuration = {
  loadReferenceData: () => request<ReferenceData>('/config/reference-data'),
  loadMasterData: () => request<ReferenceData>('/config/master-data?includeInactive=true'),
  createItem: (payload: { type: ReferenceType; name: string; description?: string; sortOrder?: number }) =>
    request<{ id: number }>('/config/master-data', { method: 'POST', body: JSON.stringify(payload) }),
  updateItem: (itemId: number, payload: Pick<ReferenceItem, 'name' | 'description' | 'sortOrder' | 'isActive'>) =>
    request<void>(`/config/master-data/${itemId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  loadRates: () => request<CategoryRate[]>('/config/rates'),
  publishRate: (payload: { categoryItemId: number; monthlyAmount: number; effectiveFrom: string; notes?: string }) =>
    request<{ id: number }>('/config/rates', { method: 'POST', body: JSON.stringify(payload) }),
  loadParentFieldPolicies: () => request<ParentFieldPolicy[]>('/config/parent-field-policies'),
  updateParentFieldPolicy: (fieldCode: string, payload: { updateMode: ParentFieldPolicy['updateMode']; isRequired: boolean; isActive: boolean; reason: string }) =>
    request<void>(`/config/parent-field-policies/${encodeURIComponent(fieldCode)}`, { method: 'PATCH', body: JSON.stringify(payload) })
};
