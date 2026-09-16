import type { Role } from '@ssm/shared';
import {
  Building2, CalendarCheck, ClipboardList, CreditCard, FileText, HandCoins, LayoutDashboard, LayoutGrid, LifeBuoy,
  ListTodo, PackageOpen, ScanLine, ScrollText, ShieldCheck, Tags, TrendingUp, Users, Warehouse, type LucideIcon,
} from 'lucide-react';

export type Area = 'portal' | 'staff' | 'manager' | 'ops' | 'admin';
export interface NavItem { href: string; label: string; icon: LucideIcon }

export const AREAS: Record<Area, { title: string; roles: Role[]; items: NavItem[] }> = {
  portal: {
    title: 'Khách hàng', roles: ['CUSTOMER'],
    items: [
      { href: '/portal', label: 'Tổng quan', icon: LayoutDashboard },
      { href: '/portal/reservations', label: 'Đặt chỗ của tôi', icon: CalendarCheck },
      { href: '/portal/units', label: 'Kho đang thuê', icon: Warehouse },
      { href: '/portal/payments', label: 'Thanh toán', icon: CreditCard },
      { href: '/portal/tickets', label: 'Hỗ trợ', icon: LifeBuoy },
      { href: '/portal/claims', label: 'Bồi thường', icon: HandCoins },
    ],
  },
  staff: {
    title: 'Vận hành kho', roles: ['STAFF', 'FACILITY_MANAGER'],
    items: [
      { href: '/staff', label: 'Hàng đợi hôm nay', icon: ClipboardList },
      { href: '/staff/check-in', label: 'Nhận kho (check-in)', icon: ScanLine },
      { href: '/staff/move-out', label: 'Trả kho & kiểm tra', icon: PackageOpen },
      { href: '/staff/units', label: 'Sơ đồ kho', icon: LayoutGrid },
      { href: '/staff/tasks', label: 'Công việc của tôi', icon: ListTodo },
    ],
  },
  manager: {
    title: 'Quản lý chi nhánh', roles: ['FACILITY_MANAGER'],
    items: [
      { href: '/manager', label: 'Tổng quan', icon: LayoutDashboard },
      { href: '/manager/units', label: 'Quản lý kho', icon: LayoutGrid },
      { href: '/manager/allocations', label: 'Phân kho', icon: CalendarCheck },
      { href: '/manager/contracts', label: 'Hợp đồng & công nợ', icon: FileText },
      { href: '/manager/tasks', label: 'Yêu cầu & công việc', icon: ListTodo },
      { href: '/manager/claims', label: 'Bồi thường', icon: HandCoins },
      { href: '/manager/reports', label: 'Báo cáo', icon: TrendingUp },
    ],
  },
  ops: {
    title: 'Vận hành chuỗi', roles: ['OPS_MANAGER'],
    items: [
      { href: '/ops', label: 'Tổng quan chuỗi', icon: TrendingUp },
      { href: '/ops/facilities', label: 'Chi nhánh', icon: Building2 },
      { href: '/ops/policies', label: 'Chính sách', icon: ScrollText },
      { href: '/ops/pricing', label: 'Bảng giá', icon: Tags },
    ],
  },
  admin: {
    title: 'Quản trị hệ thống', roles: ['ADMIN'],
    items: [
      { href: '/admin/users', label: 'Người dùng & phân quyền', icon: Users },
      { href: '/admin/audit', label: 'Nhật ký kiểm toán', icon: ShieldCheck },
    ],
  },
};

export const HOME: Record<Role, string> = {
  CUSTOMER: '/portal', STAFF: '/staff', FACILITY_MANAGER: '/manager', OPS_MANAGER: '/ops', ADMIN: '/admin/users',
};
