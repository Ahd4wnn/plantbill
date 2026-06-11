import { supabase } from './supabaseClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

function buildUrl(path: string): string {
  let base = API_BASE_URL.trim();
  if (base.endsWith('/')) {
    base = base.slice(0, -1);
  }
  
  let p = path.trim();
  if (!p.startsWith('/')) {
    p = '/' + p;
  }
  
  if (base.endsWith('/api')) {
    if (p === '/api') {
      p = '';
    } else if (p.startsWith('/api/')) {
      p = p.slice(4);
    }
  }
  
  return `${base}${p}`;
}

async function getHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
}

async function handleResponse(res: Response): Promise<any> {
  if (res.status === 401) {
    // Token is expired or invalid, trigger logout
    await supabase.auth.signOut();
    window.location.href = '/login';
    throw new Error('Your session has expired. Please sign in again.');
  }
  
  if (!res.ok) {
    let errorMessage = 'An unexpected error occurred. Please try again.';
    try {
      const data = await res.json();
      errorMessage = data.detail || errorMessage;
    } catch (e) {
      // JSON parsing failed, use generic error or HTTP status text
      if (res.statusText) {
        errorMessage = res.statusText;
      }
    }
    throw new Error(errorMessage);
  }
  
  return res.json();
}

export async function apiGet(path: string): Promise<any> {
  const headers = await getHeaders();
  const res = await fetch(buildUrl(path), {
    method: 'GET',
    headers,
  });
  return handleResponse(res);
}

export async function apiPost(path: string, body?: any): Promise<any> {
  const headers = await getHeaders();
  const config: RequestInit = {
    method: 'POST',
    headers,
  };
  if (body !== undefined) {
    config.body = JSON.stringify(body);
  }
  const res = await fetch(buildUrl(path), config);
  return handleResponse(res);
}

export async function apiDelete(path: string): Promise<any> {
  const headers = await getHeaders();
  const res = await fetch(buildUrl(path), {
    method: 'DELETE',
    headers,
  });
  return handleResponse(res);
}

export async function apiGetBlob(path: string): Promise<{ blob: Blob; filename: string }> {
  const headers = await getHeaders();
  const res = await fetch(buildUrl(path), {
    method: 'GET',
    headers,
  });
  
  if (res.status === 401) {
    // Token is expired or invalid, trigger logout
    await supabase.auth.signOut();
    window.location.href = '/login';
    throw new Error('Your session has expired. Please sign in again.');
  }
  
  if (!res.ok) {
    let errorMessage = 'An unexpected error occurred. Please try again.';
    try {
      const data = await res.json();
      errorMessage = data.detail || errorMessage;
    } catch (e) {
      if (res.statusText) {
        errorMessage = res.statusText;
      }
    }
    throw new Error(errorMessage);
  }
  
  const blob = await res.blob();
  
  // Extract filename from Content-Disposition header
  let filename = 'download.csv';
  const disposition = res.headers.get('content-disposition') || res.headers.get('Content-Disposition');
  if (disposition && disposition.indexOf('attachment') !== -1) {
    const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
    const matches = filenameRegex.exec(disposition);
    if (matches != null && matches[1]) { 
      filename = matches[1].replace(/['"]/g, '');
    }
  }
  
  return { blob, filename };
}

