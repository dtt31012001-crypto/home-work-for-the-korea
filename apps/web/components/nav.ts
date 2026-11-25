import { BookOpen, Building2, GraduationCap, Settings, Users, type LucideIcon } from "lucide-react";

export interface NavDef {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  also?: string[];
}

/** Chỉ liệt kê chức năng ĐÃ triển khai (nguyên tắc: không hiển thị chức năng chưa có). */
export const SUPER_ADMIN_NAV: NavDef[] = [
  { href: "/quan-tri", label: "Trung tâm", icon: Building2, exact: true, also: ["/quan-tri/trung-tam"] },
  { href: "/quan-tri/giao-trinh", label: "Giáo trình", icon: BookOpen },
];

export const CENTER_ADMIN_NAV: NavDef[] = [
  { href: "/trung-tam/hoc-vien", label: "Học viên", icon: GraduationCap },
  { href: "/trung-tam/giao-vien", label: "Giáo viên", icon: Users },
  { href: "/trung-tam/cai-dat", label: "Cài đặt", icon: Settings },
];
