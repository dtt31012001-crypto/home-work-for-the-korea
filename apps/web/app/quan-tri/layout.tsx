"use client";

import type { ReactNode } from "react";
import { SUPER_ADMIN_NAV } from "@/components/nav";
import { Workspace } from "@/components/workspace";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <Workspace role="SUPER_ADMIN" nav={SUPER_ADMIN_NAV}>
      {children}
    </Workspace>
  );
}
