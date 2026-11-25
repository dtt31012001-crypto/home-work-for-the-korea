import { CalendarCheck, GraduationCap, HeartHandshake, LogIn, School, ShieldCheck, Smartphone, UsersRound } from "lucide-react";
import Link from "next/link";
import { ProgramPicker } from "@/components/program-picker";

const ROLES = [
  {
    icon: School,
    title: "Trung tâm",
    points: ["Tạo lớp theo giáo trình và cấp độ, hệ thống tự sinh lịch học", "Chặn trùng phòng, trùng giáo viên", "Xem buổi chưa điểm danh, học viên vắng, lớp chậm tiến độ"],
  },
  {
    icon: UsersRound,
    title: "Giáo viên",
    points: ["Lịch dạy hôm nay ngay khi mở ứng dụng", "Điểm danh cả lớp trong khoảng một phút", "Ghi bài đã dạy và nhận xét từng học viên"],
  },
  {
    icon: GraduationCap,
    title: "Học viên",
    points: ["Buổi học tiếp theo: giờ, phòng, cơ sở", "Đang học tới bài nào", "Lịch học và chuyên cần của mình"],
  },
  {
    icon: HeartHandshake,
    title: "Phụ huynh",
    points: ["Hôm nay con có học, có đi học không", "Nhận xét của giáo viên khi được chia sẻ", "Theo dõi nhiều con trong một tài khoản"],
  },
];

const PRINCIPLES = [
  { icon: Smartphone, text: "Dùng tốt trên điện thoại" },
  { icon: CalendarCheck, text: "Lịch theo giờ của từng cơ sở" },
  { icon: ShieldCheck, text: "Dữ liệu tách riêng từng trung tâm" },
];

function LoginLink({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/dang-nhap"
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-brand-700 font-semibold text-white hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${className}`}
    >
      <LogIn className="size-4" aria-hidden />
      Đăng nhập
    </Link>
  );
}

/** C-05: trang công khai tối giản – thương hiệu, chọn nhanh chương trình, đăng nhập. */
export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="font-semibold text-brand-800">
            TH – Tiếng Hàn
          </Link>
          <LoginLink className="h-10 px-4 text-sm" />
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-5xl gap-10 px-4 pt-12 pb-14 md:grid-cols-[1.1fr_1fr] md:items-center md:pt-20">
          <div>
            <p lang="ko" className="text-sm font-semibold tracking-wide text-brand-700">
              배움으로 세상을 넓히다
            </p>
            <h1 className="mt-2 text-3xl leading-tight font-semibold sm:text-4xl">Mở rộng thế giới thông qua học tập.</h1>
            <p className="mt-4 max-w-prose text-base leading-relaxed text-muted">
              Nền tảng học và quản lý đào tạo tiếng Hàn: trung tâm sắp lớp và lịch học, giáo viên điểm danh và ghi tiến độ, học viên và phụ huynh biết ngay hôm nay học gì, ở đâu, đã học tới đâu.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <LoginLink className="h-12 px-6" />
              <a href="#chuong-trinh" className="inline-flex h-12 items-center rounded-lg border border-line bg-surface px-5 font-semibold hover:bg-canvas">
                Xem chương trình
              </a>
            </div>
            <p className="mt-3 text-xs text-muted">Tài khoản do trung tâm cấp. Quên mật khẩu? Liên hệ trung tâm của bạn.</p>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {PRINCIPLES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2 text-muted">
                  <Icon className="size-4 text-brand-700" aria-hidden />
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <div id="chuong-trinh" className="scroll-mt-20">
            <h2 className="sr-only">Chương trình học</h2>
            <ProgramPicker />
          </div>
        </section>

        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="text-2xl font-semibold">Mỗi người một góc làm việc riêng</h2>
            <p className="mt-2 text-muted">Một tài khoản có thể có nhiều vai trò, ví dụ vừa là phụ huynh vừa là học viên.</p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ROLES.map(({ icon: Icon, title, points }) => (
                <li key={title} className="rounded-2xl border border-line bg-canvas p-5">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted">
                    {points.map((p) => (
                      <li key={p} className="flex gap-2">
                        <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-brand-600" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted">
          <p>© {new Date().getFullYear()} TH – Tiếng Hàn</p>
          <p lang="ko">배움으로 세상을 넓히다</p>
        </div>
      </footer>
    </div>
  );
}
