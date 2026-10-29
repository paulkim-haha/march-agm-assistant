import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

// 화면 전체에 쓰는 한글 글꼴입니다. (굵기를 자유롭게 쓸 수 있는 가변 글꼴)
const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto",
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
});

// 브라우저 탭에 보이는 앱 이름과 설명입니다.
export const metadata: Metadata = {
  title: "3월을 부탁해(AI 주총 어시스턴트)",
  description:
    "주주총회 안건을 의결권 행사 가이드라인에 맞춰 검토해 주는 도구",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${notoSansKr.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
