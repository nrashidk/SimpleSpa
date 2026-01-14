import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Selected Spa ID for super admin (global state accessible by fetch functions)
let selectedSpaId: number | null = null;

export function setSelectedSpaId(id: number | null) {
  selectedSpaId = id;
}

export function getSelectedSpaId(): number | null {
  return selectedSpaId;
}

// CSRF Token management - cached token to avoid redundant fetches
let csrfToken: string | null = null;
let csrfTokenPromise: Promise<string> | null = null;

async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  
  // Prevent multiple simultaneous fetches
  if (csrfTokenPromise) return csrfTokenPromise;
  
  csrfTokenPromise = fetch('/api/csrf-token', { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
      csrfToken = data.csrfToken;
      csrfTokenPromise = null;
      return csrfToken!;
    })
    .catch(err => {
      csrfTokenPromise = null;
      console.error('Failed to fetch CSRF token:', err);
      return '';
    });
  
  return csrfTokenPromise;
}

// Clear CSRF token on logout (call this when user logs out)
export function clearCsrfToken() {
  csrfToken = null;
  csrfTokenPromise = null;
}

// Set CSRF token directly (call after login with token from response)
export function setCsrfToken(token: string) {
  csrfToken = token;
  csrfTokenPromise = null;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  // Add CSRF token for state-changing requests
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
    const token = await getCsrfToken();
    if (token) {
      headers["X-CSRF-Token"] = token;
    }
  }
  
  // Add spa ID header for super admin spa selection
  if (selectedSpaId) {
    headers["X-Spa-Id"] = selectedSpaId.toString();
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const headers: Record<string, string> = {};
    
    // Add spa ID header for super admin spa selection
    if (selectedSpaId) {
      headers["X-Spa-Id"] = selectedSpaId.toString();
    }
    
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
