"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CENTER_ADMIN_NAV } from "@/components/nav";
import { Spinner } from "@/components/ui";

/** Trang chủ trung tâm: chuyển tới màn hình đầu tiên đã triển khai. */
export default function CenterHome() {
  const router = useRouter();
  useEffect(() => router.replace(CENTER_ADMIN_NAV[0]!.href), [router]);
  return <Spinner />;
}
