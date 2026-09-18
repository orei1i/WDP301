import type { Metadata } from 'next';
import { LegalPage } from '@/features/legal/legal-page';
import { TERMS, TERMS_VERSION } from '@/features/legal/legal-content';

export const metadata: Metadata = { title: 'Điều khoản thuê kho' };

export default function TermsPage() {
  return <LegalPage title="Điều khoản thuê kho" version={TERMS_VERSION} sections={TERMS} other={{ href: '/bao-mat', label: 'Xem Chính sách bảo mật →' }} />;
}
