"use client";

import type { Role } from "@th/contracts";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { SessionProvider, useSession, type Context } from "@/lib/session";
import { WorkspaceShell, type NavItem } from "./shell";
import { Spinner } from "./ui";

const WorkspaceCtx = createContext<Context | null>(null);

function Guard({ role, nav, children }: { role: Role; nav: NavItem[]; children: ReactNode }) {
  const { activeFor } = useSession();
  const router = useRouter();
  const ctx = activeFor(role);
  useEffect(() => {
    if (!ctx) router.replace("/vao");
  }, [ctx, router]);
  if (!ctx) return <Spinner />;
  return (
    <WorkspaceCtx.Provider value={ctx}>
      <WorkspaceShell role={role} nav={nav}>
        {children}
      </WorkspaceShell>
    </WorkspaceCtx.Provider>
  );
}

/** Bọc một workspace: phiên đăng nhập + kiểm tra có vai trò + khung điều hướng. */
export function Workspace({ role, nav, children }: { role: Role; nav: NavItem[]; children: ReactNode }) {
  return (
    <SessionProvider fallback={<Spinner />}>
      <Guard role={role} nav={nav}>
        {children}
      </Guard>
    </SessionProvider>
  );
}

/** Ngữ cảnh (vai trò + trung tâm) của workspace hiện tại. */
export function useWorkspace(): Context {
  const c = useContext(WorkspaceCtx);
  if (!c) throw new Error("useWorkspace phải nằm trong Workspace");
  return c;
}

/** ID trung tâm của workspace hiện tại (Center Admin, Giáo viên, Học viên, Phụ huynh). */
export function useOrgId(): string {
  const c = useWorkspace();
  if (!c.organization) throw new Error("Workspace không gắn trung tâm");
  return c.organization.id;
}
