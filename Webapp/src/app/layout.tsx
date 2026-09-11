import type { Metadata } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import { StoreProvider } from '@/lib/store';
import { Toasts } from '@/components/toasts';
import './globals.css';

const font = Be_Vietnam_Pro({ subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700'], variable: '--font-be-vietnam', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'KhoAn — Kho tự quản', template: '%s · KhoAn' },
  description: 'Hệ thống quản lý kho tự quản: đặt kho, nhận kho, thanh toán và vận hành chuỗi chi nhánh.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={font.variable} suppressHydrationWarning>
      <body className="font-sans">
        <StoreProvider>
          {children}
          <Toasts />
        </StoreProvider>
      </body>
    </html>
  );
}
