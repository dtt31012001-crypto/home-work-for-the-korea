import Link from "next/link";
import { LogIn } from "lucide-react";
import { Brand, Page } from "@/components/ui";

export default function Home() {
  return (
    <Page>
      <Brand />
      <p className="text-center text-sm text-muted">Mở rộng thế giới thông qua học tập.</p>
      <Link
        href="/dang-nhap"
        className="flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-700 font-semibold text-white hover:bg-brand-800"
      >
        <LogIn className="size-5" aria-hidden />
        Đăng nhập
      </Link>
    </Page>
  );
}
