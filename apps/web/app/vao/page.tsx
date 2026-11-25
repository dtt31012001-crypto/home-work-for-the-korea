"use client";

import { ROLE_LABEL } from "@th/contracts";
import { Building2, ChevronRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Brand, Card, Page, Spinner } from "@/components/ui";
import { SessionProvider, contextKey, useSession } from "@/lib/session";

function Chooser() {
  const { me, select } = useSession();
  const single = me.contexts.length === 1 ? me.contexts[0] : undefined;
  useEffect(() => {
    if (single) select(single);
  }, [single, select]);
  if (single) return <Spinner label="Đang vào…" />;

  return (
    <Card>
      <h1 className="text-lg font-semibold">Chọn nơi làm việc</h1>
      {me.contexts.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Tài khoản chưa được gán vai trò ở trung tâm nào. Vui lòng liên hệ trung tâm.{" "}
          <Link href="/tai-khoan" className="font-semibold text-brand-700">
            Xem tài khoản
          </Link>
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {me.contexts.map((c) => (
            <li key={contextKey(c)}>
              <button onClick={() => select(c)} className="flex w-full items-center gap-3 py-3 text-left">
                {c.organization ? <Building2 className="size-5 text-brand-700" aria-hidden /> : <ShieldCheck className="size-5 text-brand-700" aria-hidden />}
                <span className="flex-1">
                  <span className="block text-sm font-semibold">{ROLE_LABEL[c.role]}</span>
                  <span className="block text-xs text-muted">{c.organization?.name ?? "Nền tảng TH – Tiếng Hàn"}</span>
                </span>
                <ChevronRight className="size-5 text-muted" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function EnterPage() {
  return (
    <Page>
      <Brand />
      <SessionProvider fallback={<Spinner />}>
        <Chooser />
      </SessionProvider>
    </Page>
  );
}
