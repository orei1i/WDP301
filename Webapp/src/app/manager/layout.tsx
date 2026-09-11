import { AppShell } from '@/components/app-shell';

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return <AppShell area="manager">{children}</AppShell>;
}
