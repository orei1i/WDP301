import Constants from 'expo-constants';
import { firebaseAuth, firebaseConfigured } from './firebase';

/**
 * Địa chỉ API.
 *
 * Trên điện thoại `localhost` trỏ về chính cái điện thoại, không phải máy chạy BE — đây là lỗi
 * tốn thời gian nhất khi mới chạy app. Thứ tự tìm:
 *
 *  1. EXPO_PUBLIC_API_URL trong Mobile/React-Native/.env  → khi deploy hoặc trỏ sang Railway
 *  2. Suy ra từ địa chỉ máy đang chạy Metro (Expo cho biết qua hostUri, ví dụ 192.168.1.5:8081)
 *     → cắm điện thoại thật vào cùng Wi-Fi là chạy, không phải sửa gì
 *  3. localhost — chỉ đúng khi mở bằng expo web
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:4000/api`;

  return 'http://localhost:4000/api';
}

export const API_URL = resolveApiUrl();

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) { super(message); }
}

async function request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const current = firebaseConfigured ? firebaseAuth().currentUser : null;
  const token = current ? await current.getIdToken() : null; // SDK tự cache và làm mới mỗi giờ
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'content-type': 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', `Không kết nối được API (${API_URL}). Kiểm tra BE đã chạy và điện thoại cùng mạng Wi-Fi với máy tính.`);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? `Lỗi máy chủ (${res.status})`, err?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}, headers?: Record<string, string>) => request<T>('POST', path, body, headers),
  patch: <T>(path: string, body: unknown = {}) => request<T>('PATCH', path, body),
};
