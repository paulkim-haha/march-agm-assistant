"use client";

// 화면 맨 위 히어로입니다. 풍경 동영상을 배경으로 깔고, 그 위에 앱 이름(그림 글자 로고)과 안내를 가운데 정렬로 올립니다.
// - 상단 바: 화면 맨 위에 고정. 스크롤하면 크림색 반투명 + 흐림 효과로 바뀜
// - 동영상: 자동 재생·소리 없음·반복. 어두운 막(오버레이)이나 그라데이션 없이 그대로 보여 줍니다.
// - 글자는 숲색(#2d3a2e)으로 고정해 밝은 풍경 위에서도 또렷하게 보입니다. (어두운 모드와 상관없음)

import { useEffect, useState } from "react";
import { ArrowRightIcon, CalendarCheckIcon } from "./Icons";
import TitleLogo from "./TitleLogo";

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260820_010308_b1636845-4c15-4ab6-b0c9-9a29bfb0c6e3.mp4";

export default function Hero() {
  // 스크롤을 조금(20px) 내리면 상단 바 모양이 바뀜
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* 상단 바 (고정) */}
      <nav
        className={`fixed inset-x-0 top-0 z-50 transition duration-300 ${
          scrolled ? "bg-cream/90 shadow-sm backdrop-blur-md" : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6 md:h-20 lg:px-8">
          <a href="#top" className="animate-fade-down stagger-1 flex items-center gap-2.5 text-forest">
            <span className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-brand to-brand-2 text-brand-ink shadow-card">
              <CalendarCheckIcon size={20} />
            </span>
            <span className="text-xl font-medium tracking-tight">3월을 부탁해</span>
          </a>
          <p className="animate-fade-down stagger-2 hidden items-center rounded-full bg-white/70 px-4 py-2 text-xs font-semibold tracking-wide text-forest backdrop-blur-sm sm:inline-flex">
            실습용 가상 자료만 사용하세요
          </p>
        </div>
      </nav>

      {/* 동영상 히어로 */}
      <section
        id="top"
        className="relative h-[68vh] min-h-[520px] w-full overflow-hidden bg-cream"
        aria-label="앱 소개"
      >
        <div className="absolute inset-0">
          <video
            className="h-full w-full object-cover object-bottom"
            src={VIDEO_URL}
            autoPlay
            muted
            loop
            playsInline
            aria-hidden="true"
          />
        </div>

        {/* 가운데 정렬: 안내 알약 → 제목 이미지 → 부제 → 소개 */}
        <div className="relative z-10 mx-auto flex max-w-7xl flex-col items-center px-6 pt-24 text-center md:pt-32 lg:px-8">
          <a
            href="#upload"
            className="animate-fade-up stagger-3 mb-3 inline-flex items-center gap-2 rounded-full border border-forest/15 bg-white/60 px-4 py-2 backdrop-blur-sm transition-colors hover:bg-white/80 md:mb-4"
          >
            <span className="text-sm text-forest">소집통지서를 올리면 바로 검토해 드려요</span>
            <ArrowRightIcon size={14} className="text-forest" />
          </a>

          {/* 제목: 이미지(그림 글자)로 만든 로고 */}
          <h1 className="animate-fade-up stagger-4 w-[min(92vw,680px)]">
            <TitleLogo className="h-auto w-full drop-shadow-[0_10px_18px_rgba(45,58,46,0.25)]" />
          </h1>
          {/* 부제와 소개는 반투명 흰 판 위에 올려, 동영상 어느 장면에서도 읽히게 함 */}
          <p className="animate-fade-up stagger-5 mt-1 rounded-full bg-white/70 px-5 py-1.5 text-base font-bold tracking-[0.2em] text-forest backdrop-blur-sm sm:text-lg">
            AI 주총 어시스턴트
          </p>
          <p className="animate-fade-up stagger-6 mt-3 max-w-xl rounded-2xl bg-white/65 px-5 py-3 text-[15px] leading-7 text-forest backdrop-blur-sm">
            주주총회 소집통지서를 올리면, 의결권 행사 가이드라인에 맞춰 안건별 검토 의견과 사유 초안을 만들어 드립니다.
          </p>
        </div>
      </section>
    </>
  );
}
