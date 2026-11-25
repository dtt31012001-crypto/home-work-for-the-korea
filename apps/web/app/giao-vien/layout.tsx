"use client";

import type { ReactNode } from "react";
import { TEACHER_NAV } from "@/components/nav";
import { Workspace } from "@/components/workspace";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <Workspace role="TEACHER" nav={TEACHER_NAV}>
      {children}
    </Workspace>
  );
}
