import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { PRIVACY, PRIVACY_VERSION } from '@/lib/legal';

export const metadata: Metadata = { title: 'Chính sách bảo mật' };

export default function PrivacyPage() {
  return <LegalPage title="Chính sách bảo mật dữ liệu cá nhân" version={PRIVACY_VERSION} sections={PRIVACY} other={{ href: '/dieu-khoan', label: 'Xem Điều khoản thuê kho →' }} />;
}
