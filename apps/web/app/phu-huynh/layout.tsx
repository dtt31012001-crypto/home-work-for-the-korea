"use client";

import type { ReactNode } from "react";
import { PARENT_NAV } from "@/components/nav";
import { Workspace } from "@/components/workspace";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <Workspace role="PARENT" nav={PARENT_NAV}>
      {children}
    </Workspace>
  );
}
