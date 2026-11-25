import { Building2, Settings, type LucideIcon } from "lucide-react";

export interface NavDef {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

/** Chỉ liệt kê chức năng ĐÃ triển khai (nguyên tắc: không hiển thị chức năng chưa có). */
export const SUPER_ADMIN_NAV: NavDef[] = [{ href: "/quan-tri", label: "Trung tâm", icon: Building2 }];

export const CENTER_ADMIN_NAV: NavDef[] = [{ href: "/trung-tam/cai-dat", label: "Cài đặt", icon: Settings }];
