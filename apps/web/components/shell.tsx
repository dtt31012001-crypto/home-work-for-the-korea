"use client";

import { ROLE_LABEL, type Role } from "@th/contracts";
import { ChevronDown, LogOut, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { contextKey, useSession, type Context } from "@/lib/session";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Trang chủ của workspace: chỉ sáng khi đúng đường dẫn */
  exact?: boolean;
  /** Các đường dẫn con khác cũng thuộc mục này */
  also?: string[];
}

function isActive(pathname: string, item: NavItem) {
  if (item.also?.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

function contextLabel(c: Context) {
  return `${ROLE_LABEL[c.role]} · ${c.organization?.name ?? "Nền tảng"}`;
}

function ContextSwitcher({ current, overflow = [] }: { current: Context; overflow?: NavItem[] }) {
  const { me, select } = useSession();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const others = me.contexts.filter((c) => contextKey(c) !== contextKey(current));

  async function logout() {
    await api("POST", "/api/auth/logout").catch(() => undefined);
    router.replace("/dang-nhap");
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-canvas"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
          {me.user.displayName.trim().split(/\s+/).pop()?.[0]?.toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{me.user.displayName}</span>
          <span className="block truncate text-xs text-muted">{contextLabel(current)}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-72 rounded-xl border border-line bg-surface p-1 shadow-lg">
          {others.length > 0 && <p className="px-3 pt-2 pb-1 text-xs font-semibold text-muted">Chuyển vai trò</p>}
          {others.map((c) => (
            <button key={contextKey(c)} role="menuitem" onClick={() => select(c)} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-canvas">
              {contextLabel(c)}
            </button>
          ))}
          {overflow.map((item) => (
            <Link key={item.href} role="menuitem" href={item.href} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-canvas lg:hidden">
              <item.icon className="size-4" aria-hidden /> {item.label}
            </Link>
          ))}
          <Link role="menuitem" href="/tai-khoan" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-canvas">
            <UserRound className="size-4" aria-hidden /> Tài khoản
          </Link>
          <button role="menuitem" onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-bg">
            <LogOut className="size-4" aria-hidden /> Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Khung workspace: sidebar trên desktop, thanh điều hướng dưới trên mobile (tối đa 5 mục).
 * Chỉ hiển thị mục đã triển khai (truyền vào qua `nav`).
 */
export function WorkspaceShell({ role, nav, children }: { role: Role; nav: NavItem[]; children: ReactNode }) {
  const { activeFor } = useSession();
  const pathname = usePathname();
  const current = activeFor(role);
  if (!current) return null;
  const mobileNav = nav.slice(0, 5);
  const overflow = nav.slice(5);

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 pt-5 pb-4">
          <p className="font-semibold text-brand-800">TH – Tiếng Hàn</p>
          <p className="text-xs text-muted">{current.organization?.name ?? "Quản trị nền tảng"}</p>
        </div>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Điều hướng chính">
          {nav.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold ${active ? "bg-brand-50 text-brand-800" : "text-ink hover:bg-canvas"}`}
              >
                <item.icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line p-3">
          <ContextSwitcher current={current} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur lg:hidden">
          <p className="truncate font-semibold text-brand-800">{current.organization?.name ?? "TH – Tiếng Hàn"}</p>
          <div className="w-48">
            <ContextSwitcher current={current} overflow={overflow} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-24 lg:px-8 lg:pt-8 lg:pb-10">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface lg:hidden" style={{ gridTemplateColumns: `repeat(${mobileNav.length}, minmax(0, 1fr))` }} aria-label="Điều hướng">
          {mobileNav.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${active ? "text-brand-700" : "text-muted"}`}
              >
                <item.icon className="size-5" aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
