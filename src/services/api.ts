const DEFAULT_API_BASE = "http://127.0.0.1:8000";

export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || DEFAULT_API_BASE;

export const headers = {
  json: {
    "Content-Type": "application/json",
  },
};

export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function getAdminToken(): string | null {
  return localStorage.getItem("admin_token");
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  return requestHeaders;
}

export function adminHeaders(): Record<string, string> {
  const token = getAdminToken();
  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  return requestHeaders;
}
