import type { ApiErrorBody } from "@th/contracts";

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
  }
}

let csrfToken: string | undefined;

async function getCsrf(): Promise<string> {
  if (!csrfToken) {
    const res = await fetch("/api/auth/csrf", { credentials: "same-origin" });
    csrfToken = ((await res.json()) as { csrfToken: string }).csrfToken;
  }
  return csrfToken;
}

async function raw(method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") {
    headers["x-csrf-token"] = await getCsrf();
    headers["Content-Type"] = "application/json";
  }
  return fetch(path, { method, headers, credentials: "same-origin", body: body === undefined ? undefined : JSON.stringify(body) });
}

let refreshing: Promise<boolean> | undefined;

/** Làm mới phiên một lần cho mọi request đang chờ (tránh nhiều tab/request cùng xoay token). */
function refreshSession(): Promise<boolean> {
  refreshing ??= raw("POST", "/api/auth/refresh")
    // 409 SESSION_ROTATED: tab khác vừa làm mới, cookie mới đã có → coi như thành công
    .then((r) => r.ok || r.status === 409)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = undefined), 0));
  return refreshing;
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const b = (await res.json()) as ApiErrorBody;
    return new ApiError(res.status, b.error.code, b.error.message, b.error.details);
  } catch {
    return new ApiError(res.status, "NETWORK", "Không kết nối được máy chủ. Vui lòng thử lại.");
  }
}

export async function api<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await raw(method, path, body);
    if (res.status === 401 && !path.startsWith("/api/auth/login") && !path.startsWith("/api/auth/refresh")) {
      const err = await toError(res.clone());
      if (err.code === "UNAUTHENTICATED" && (await refreshSession())) res = await raw(method, path, body);
    }
    if (res.status === 403) {
      const err = await toError(res.clone());
      if (err.code === "CSRF_INVALID") {
        csrfToken = undefined;
        res = await raw(method, path, body);
      }
    }
  } catch {
    throw new ApiError(0, "NETWORK", "Không kết nối được máy chủ. Vui lòng kiểm tra mạng.");
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
