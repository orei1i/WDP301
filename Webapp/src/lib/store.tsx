'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  createUserWithEmailAndPassword, getRedirectResult, onAuthStateChanged, reload, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, updateProfile,
} from 'firebase/auth';
import type { Facility, UnitCategory, UnitType, User } from '@ssm/shared';
import type { DB } from './mock-data';
import { api, ApiError } from './api';
import { actions, type ActionName, type Payload, type Value } from './actions';
import { authErrorMessage, firebaseAuth, firebaseConfigured, googleProvider } from './firebase';

export type RunResult<V> = { ok: true; value: V } | { ok: false; error: string };
export interface Toast { id: number; tone: 'success' | 'error' | 'info'; text: string }

export interface PublicFacility extends Facility {
  fromPrice: number | null;
  availability: { unitTypeId: string; name: string; category: UnitCategory; total: number; free: number; holds: number; available: number }[];
}
export interface Catalog { facilities: PublicFacility[]; unitTypes: UnitType[] }

const EMPTY_DB: DB = { users: [], facilities: [], unitTypes: [], units: [], reservations: [], contracts: [], payments: [], inspections: [], tickets: [], policies: [], audit: [] };
type Snapshot = DB & { me: User };

interface StoreValue {
  /** Server snapshot of everything the signed-in user may see (empty when signed out). */
  db: DB;
  user: User | null;
  /** Public catalogue (facilities, unit types, live availability) — loaded for everyone. */
  catalog: Catalog | null;
  busy: boolean;
  firebaseReady: boolean;
  loginEmail: (email: string, password: string) => Promise<boolean>;
  loginGoogle: () => Promise<boolean>;
  register: (fullName: string, email: string, password: string) => Promise<boolean>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  confirmVerification: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  reloadCatalog: () => Promise<void>;
  run: <K extends ActionName>(name: K, payload: Payload<K>, successText?: string | ((v: Value<K>) => string), onOk?: (v: Value<K>) => void) => Promise<RunResult<Value<K>>>;
  toast: (text: string, tone?: Toast['tone']) => void;
  toasts: Toast[];
  dismiss: (id: number) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [db, setDb] = useState<DB>(EMPTY_DB);
  const [user, setUser] = useState<User | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const userRef = useRef<User | null>(null);
  const pendingName = useRef<string | undefined>(undefined);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const refresh = useCallback(async () => {
    const snap = await api.get<Snapshot>('/bootstrap');
    const { me, ...rest } = snap;
    userRef.current = me;
    setUser(me);
    setDb({ ...EMPTY_DB, ...rest });
  }, []);

  const reloadCatalog = useCallback(async () => {
    try {
      const res = await api.get<{ items: PublicFacility[]; unitTypes: UnitType[] }>('/facilities/public');
      setCatalog({ facilities: res.items, unitTypes: res.unitTypes });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Không tải được danh sách chi nhánh', 'error');
      setCatalog({ facilities: [], unitTypes: [] });
    }
  }, [toast]);

  // Firebase session → POST /auth/sync (create/link profile) → GET /bootstrap
  useEffect(() => {
    void reloadCatalog();
    if (!firebaseConfigured) { setReady(true); return; }
    // Quay lại sau signInWithRedirect: phiên chảy vào onAuthStateChanged bên dưới,
    // gọi getRedirectResult chỉ để lộ lỗi (vd auth/unauthorized-domain) thay vì im lặng.
    getRedirectResult(firebaseAuth()).catch((e) => toast(authErrorMessage(e), 'error'));
    return onAuthStateChanged(firebaseAuth(), async (fb) => {
      if (!fb) {
        userRef.current = null; setUser(null); setDb(EMPTY_DB); setReady(true);
        return;
      }
      try {
        await api.post('/auth/sync', pendingName.current ? { fullName: pendingName.current } : {});
        pendingName.current = undefined;
        await refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Không đồng bộ được tài khoản', 'error');
        await signOut(firebaseAuth()).catch(() => {});
      } finally {
        setReady(true);
      }
    });
  }, [refresh, reloadCatalog, toast]);

  const wrapAuth = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); return true; } catch (e) { toast(authErrorMessage(e), 'error'); return false; } finally { setBusy(false); }
  }, [toast]);

  const loginEmail = useCallback((email: string, password: string) => wrapAuth(() => signInWithEmailAndPassword(firebaseAuth(), email.trim(), password)), [wrapAuth]);
  /**
   * Popup trước (giữ nguyên trang, UX tốt hơn). Trình duyệt chặn popup hoặc môi trường không hỗ trợ
   * (in-app browser của Facebook/Zalo, iOS Safari chặn cửa sổ mới) thì chuyển sang redirect cùng tab —
   * redirect không bao giờ bị popup blocker chặn. Người dùng đóng popup thì tôn trọng, không redirect.
   */
  const loginGoogle = useCallback(() => wrapAuth(async () => {
    try {
      await signInWithPopup(firebaseAuth(), googleProvider);
    } catch (e) {
      const code = (e as { code?: string })?.code ?? '';
      const popupUnavailable = code === 'auth/popup-blocked'
        || code === 'auth/cancelled-popup-request'
        || code === 'auth/operation-not-supported-in-this-environment';
      if (!popupUnavailable) throw e;
      await signInWithRedirect(firebaseAuth(), googleProvider); // trang rời đi; onAuthStateChanged bắt phiên khi quay lại
    }
  }), [wrapAuth]);
  const register = useCallback((fullName: string, email: string, password: string) => wrapAuth(async () => {
    pendingName.current = fullName.trim();
    const cred = await createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password);
    await updateProfile(cred.user, { displayName: fullName.trim() });
    await sendEmailVerification(cred.user);
    toast('Đã gửi email xác minh — mở hộp thư để kích hoạt tài khoản', 'info');
  }), [wrapAuth, toast]);

  const resetPassword = useCallback(async (email: string) => {
    if (await wrapAuth(() => sendPasswordResetEmail(firebaseAuth(), email.trim()))) toast('Đã gửi email đặt lại mật khẩu', 'success');
  }, [wrapAuth, toast]);

  const resendVerification = useCallback(async () => {
    const cu = firebaseAuth().currentUser;
    if (cu && await wrapAuth(() => sendEmailVerification(cu))) toast('Đã gửi lại email xác minh', 'success');
  }, [wrapAuth, toast]);

  /** After clicking the link in the email: reload Firebase user, force a fresh token (email_verified=true), re-sync. */
  const confirmVerification = useCallback(async () => {
    const cu = firebaseAuth().currentUser;
    if (!cu) return;
    await wrapAuth(async () => {
      await reload(cu);
      if (!cu.emailVerified) throw new Error('Email chưa được xác minh — hãy bấm link trong email trước');
      await cu.getIdToken(true);
      await api.post('/auth/sync', {});
      await refresh();
      toast('Tài khoản đã được kích hoạt', 'success');
    });
  }, [wrapAuth, refresh, toast]);

  const logout = useCallback(async () => { await signOut(firebaseAuth()).catch(() => {}); }, []);

  const run = useCallback(async <K extends ActionName>(name: K, payload: Payload<K>, successText?: string | ((v: Value<K>) => string), onOk?: (v: Value<K>) => void): Promise<RunResult<Value<K>>> => {
    if (!userRef.current) { toast('Vui lòng đăng nhập', 'error'); return { ok: false, error: 'UNAUTHENTICATED' }; }
    setBusy(true);
    try {
      const fn = actions[name] as unknown as (p: Payload<K>) => Promise<Value<K>>;
      const value = await fn(payload);
      await refresh();
      void reloadCatalog(); // public availability/prices may have changed
      if (successText) toast(typeof successText === 'function' ? successText(value) : successText, 'success');
      onOk?.(value);
      return { ok: true, value };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast(msg, 'error');
      if (e instanceof ApiError && (e.code === 'TOKEN_REVOKED' || e.code === 'TOKEN_EXPIRED' || e.code === 'ACCOUNT_SUSPENDED')) await logout();
      else refresh().catch(() => {}); // the server may have changed state (e.g. hold expired)
      return { ok: false, error: msg };
    } finally {
      setBusy(false);
    }
  }, [refresh, reloadCatalog, toast, logout]);

  if (!ready) return <div className="grid min-h-screen place-items-center text-sm text-stone-500">Đang kết nối…</div>;

  return (
    <StoreContext.Provider value={{
      db, user, catalog, busy, firebaseReady: firebaseConfigured,
      loginEmail, loginGoogle, register, resetPassword, resendVerification, confirmVerification, logout, refresh, reloadCatalog,
      run, toast, toasts, dismiss,
    }}>
      {busy && <div className="fixed inset-x-0 top-0 z-[70] h-0.5 animate-pulse bg-brand-500" />}
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
