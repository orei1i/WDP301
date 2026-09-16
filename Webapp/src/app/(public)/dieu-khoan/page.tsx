import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { TERMS, TERMS_VERSION } from '@/lib/legal';

export const metadata: Metadata = { title: 'Điều khoản thuê kho' };

export default function TermsPage() {
  return <LegalPage title="Điều khoản thuê kho" version={TERMS_VERSION} sections={TERMS} other={{ href: '/bao-mat', label: 'Xem Chính sách bảo mật →' }} />;
}
