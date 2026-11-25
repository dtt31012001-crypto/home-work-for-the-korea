"use client";

import type { ReactNode } from "react";
import { STUDENT_NAV } from "@/components/nav";
import { Workspace } from "@/components/workspace";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <Workspace role="STUDENT" nav={STUDENT_NAV}>
      {children}
    </Workspace>
  );
}
