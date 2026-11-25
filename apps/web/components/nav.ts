import { BookOpen, Building2, CalendarDays, GraduationCap, Home, School, Settings, Users, type LucideIcon } from "lucide-react";

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
  { href: "/trung-tam", label: "Hôm nay", icon: Home, exact: true, also: ["/trung-tam/buoi"] },
  { href: "/trung-tam/lop", label: "Lớp học", icon: School },
  { href: "/trung-tam/lich", label: "Lịch học", icon: CalendarDays },
  { href: "/trung-tam/hoc-vien", label: "Học viên", icon: GraduationCap },
  { href: "/trung-tam/giao-vien", label: "Giáo viên", icon: Users },
  { href: "/trung-tam/cai-dat", label: "Cài đặt", icon: Settings },
];

export const TEACHER_NAV: NavDef[] = [
  { href: "/giao-vien", label: "Hôm nay", icon: Home, exact: true, also: ["/giao-vien/buoi"] },
  { href: "/giao-vien/lop", label: "Lớp của tôi", icon: School },
];
