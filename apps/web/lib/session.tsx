"use client";

import type { MeResponse, Role } from "@th/contracts";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, api } from "./api";

export type Context = MeResponse["contexts"][number];
export const contextKey = (c: Context) => `${c.role}:${c.organization?.id ?? "platform"}`;

/** Workspace tương ứng từng vai trò. */
export const WORKSPACE: Record<Role, string> = {
  SUPER_ADMIN: "/quan-tri",
  CENTER_ADMIN: "/trung-tam",
  TEACHER: "/giao-vien",
  STUDENT: "/hoc",
  PARENT: "/phu-huynh",
};

const STORAGE_KEY = "th.activeContext";

interface SessionValue {
  me: MeResponse;
  reload: () => Promise<void>;
  /** Ngữ cảnh đang chọn cho vai trò của workspace hiện tại */
  activeFor: (role: Role) => Context | undefined;
  select: (c: Context) => void;
}

const SessionCtx = createContext<SessionValue | null>(null);

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<MeResponse>();
  const [stored, setStored] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const m = await api<MeResponse>("GET", "/api/auth/me");
      if (m.mustChangePassword) {
        router.replace(`/mat-khau?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setMe(m);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.code === "PASSWORD_CHANGE_REQUIRED")) {
        router.replace(`/dang-nhap?next=${encodeURIComponent(pathname)}`);
      } else throw e;
    }
  }, [router, pathname]);

  useEffect(() => {
    setStored(readStored());
    void load();
    // chỉ tải một lần khi vào khu vực đăng nhập
  }, []);

  const value = useMemo<SessionValue | null>(() => {
    if (!me) return null;
    return {
      me,
      reload: load,
      activeFor: (role) => {
        const options = me.contexts.filter((c) => c.role === role);
        return options.find((c) => contextKey(c) === stored) ?? options[0];
      },
      select: (c) => {
        try {
          localStorage.setItem(STORAGE_KEY, contextKey(c));
        } catch {
          /* trình duyệt chặn lưu trữ: vẫn chuyển được trong phiên */
        }
        setStored(contextKey(c));
        router.push(WORKSPACE[c.role]);
      },
    };
  }, [me, stored, load, router]);

  if (!value) return <>{fallback}</>;
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionCtx);
  if (!v) throw new Error("useSession phải nằm trong SessionProvider");
  return v;
}
