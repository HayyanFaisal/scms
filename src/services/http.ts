const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const CSRF_STORAGE_KEY = 'scms_csrf_token';

export function setCsrfToken(token: string | null): void {
  if (token) sessionStorage.setItem(CSRF_STORAGE_KEY, token);
  else sessionStorage.removeItem(CSRF_STORAGE_KEY);
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const csrfToken = sessionStorage.getItem(CSRF_STORAGE_KEY);
  if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(String(init.method || 'GET').toUpperCase())) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include'
  });
}

export async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json();
    return payload?.error?.message || payload?.message || fallback;
  } catch {
    return fallback;
  }
}
