import type { Metadata, Viewport } from "next";
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/600.css";
import "@fontsource/noto-sans-kr/400.css";
import "@fontsource/noto-sans-kr/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "TH – Tiếng Hàn", template: "%s · TH – Tiếng Hàn" },
  description: "배움으로 세상을 넓히다 – Mở rộng thế giới thông qua học tập.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#15803d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
