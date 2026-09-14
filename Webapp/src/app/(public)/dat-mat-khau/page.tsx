'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Check, KeyRound, Mail, TriangleAlert } from 'lucide-react';
import { useStore } from '@/lib/store';
import { HOME } from '@/lib/nav';
import { Button, Card, Field, inputCls } from '@/components/ui';

const LABEL: Record<string, string> = {
  'google.com': 'Google',
  password: 'Email + mật khẩu',
  'facebook.com': 'Facebook',
};

export default function SetPasswordPage() {
  const { user, busy, providers, setPassword, logout } = useStore();
  const router = useRouter();
  const [password, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);

  const hasPassword = providers.includes('password');
  const mismatch = confirm.length > 0 && password !== confirm;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    if (await setPassword(password)) { setPw(''); setConfirm(''); setDone(true); }
  };

  if (!user) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <Card className="flex gap-3 border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <TriangleAlert className="size-5 shrink-0" />
          <div>
            <p>Bạn cần đăng nhập trước khi đặt mật khẩu.</p>
            <Link href="/login?next=/dat-mat-khau" className="mt-2 inline-block font-medium text-brand-700 hover:underline">Tới trang đăng nhập</Link>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <Card className="p-6 sm:p-8">
        <p className="flex items-center gap-2 text-lg font-semibold">
          <KeyRound className="size-5" />
          {hasPassword ? 'Đổi mật khẩu' : 'Đặt mật khẩu'}
        </p>
        <p className="mt-2 text-sm text-stone-500">
          {hasPassword
            ? 'Đổi mật khẩu dùng để đăng nhập bằng email.'
            : 'Tài khoản của bạn đang đăng nhập bằng Google. Đặt thêm mật khẩu để lần sau đăng nhập được bằng email — vẫn là cùng một tài khoản, không tạo tài khoản mới.'}
        </p>

        <div className="mt-5 rounded-lg bg-stone-50 p-4 text-sm ring-1 ring-stone-200">
          <p className="flex items-center gap-2 font-medium"><Mail className="size-4 text-stone-400" />{user.email}</p>
          <p className="mt-2 text-xs text-stone-500">
            Đang đăng nhập được bằng: {providers.length ? providers.map((p) => LABEL[p] ?? p).join(' · ') : '—'}
          </p>
        </div>

        {done && (
          <div className="mt-5 flex gap-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <Check className="size-5 shrink-0" />
            <div>
              <p className="font-medium">{hasPassword ? 'Đã cập nhật mật khẩu.' : 'Xong.'}</p>
              <p className="mt-1">Từ giờ bạn đăng nhập được bằng <strong>{user.email}</strong> và mật khẩu vừa đặt. Nút Google vẫn dùng bình thường.</p>
            </div>
          </div>
        )}

        <form className="mt-6 grid gap-4" onSubmit={submit}>
          {/* trình quản lý mật khẩu cần thấy email để lưu đúng tài khoản */}
          <input type="email" value={user.email} readOnly hidden autoComplete="username" />
          <Field label={hasPassword ? 'Mật khẩu mới' : 'Mật khẩu'} hint="Ít nhất 6 ký tự">
            <input type="password" className={inputCls} required minLength={6} value={password} onChange={(e) => { setPw(e.target.value); setDone(false); }} autoComplete="new-password" />
          </Field>
          <Field label="Nhập lại mật khẩu" hint={mismatch ? 'Hai lần nhập chưa khớp' : undefined}>
            <input type="password" className={inputCls} required minLength={6} value={confirm} onChange={(e) => { setConfirm(e.target.value); setDone(false); }} autoComplete="new-password" />
          </Field>
          <Button type="submit" size="lg" disabled={busy || mismatch || password.length < 6}>
            {hasPassword ? 'Đổi mật khẩu' : 'Đặt mật khẩu'}
          </Button>
        </form>

        <div className="mt-6 flex flex-wrap gap-2 border-t border-stone-200 pt-5">
          <Button variant="secondary" onClick={() => router.push(HOME[user.role])}>Vào bảng điều khiển <ArrowRight className="size-4" /></Button>
          <Button variant="secondary" onClick={() => void logout()}>Đăng xuất</Button>
        </div>

        <p className="mt-5 text-xs text-stone-500">
          Nếu phiên đăng nhập đã cũ, Firebase sẽ yêu cầu xác thực lại — một cửa sổ Google hiện ra, xác nhận xong hệ thống tự đặt tiếp.
        </p>
      </Card>
    </main>
  );
}
