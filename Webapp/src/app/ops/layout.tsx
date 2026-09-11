import { AppShell } from '@/components/app-shell';

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell area="ops">{children}</AppShell>;
}
