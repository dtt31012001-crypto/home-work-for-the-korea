"use client";

import type { ReactNode } from "react";
import { CENTER_ADMIN_NAV } from "@/components/nav";
import { Workspace } from "@/components/workspace";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <Workspace role="CENTER_ADMIN" nav={CENTER_ADMIN_NAV}>
      {children}
    </Workspace>
  );
}
