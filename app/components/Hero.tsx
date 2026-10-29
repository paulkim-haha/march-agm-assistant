// 화면 맨 위 머리말입니다. 앱 이름을 이미지(그림 글자 로고)로 가운데에 크게 보여 주고, 그 아래에 안내를 둡니다.
// 배경은 따로 영상 없이 페이지의 화사한 라벤더빛 바탕과 벚꽃 그림 위에 그대로 올라갑니다.

import { CalendarCheckIcon } from "./Icons";
import IntroImage from "./IntroImage";
import TitleLogo from "./TitleLogo";

export default function Hero() {
  return (
    <header className="border-b border-line bg-surface/70 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 px-4 pb-8 pt-7 text-center">
        <p className="inline-flex items-center rounded-full bg-hold-soft px-3 py-1 text-xs font-semibold text-hold-ink">
          실습용 가상 자료만 사용하세요
        </p>

        {/* 제목: 이미지(그림 글자)로 만든 로고 */}
        <h1 className="w-[min(92vw,640px)]">
          <TitleLogo className="h-auto w-full drop-shadow-[0_10px_18px_rgba(15,76,92,0.25)]" />
        </h1>

        <p className="inline-flex items-center gap-2.5 rounded-full bg-linear-to-r from-[#ffe9a8] via-[#ffd3b0] to-[#ffc2d4] px-6 py-2.5 text-xl font-bold tracking-[0.14em] text-[#0f4c5c] shadow-sm sm:text-3xl">
          <CalendarCheckIcon size={28} />
          AI 주총 어시스턴트
        </p>
        {/* 소개 문장: 따뜻한 크림·핑크 박스 안에 이미지(그림 글자)로 */}
        <div className="w-full max-w-xl rounded-2xl border border-[#ffd8b8] bg-linear-to-br from-[#fff4d6] to-[#ffe3ea] px-5 py-4 shadow-card sm:px-7">
          <IntroImage className="h-auto w-full" />
        </div>
      </div>
    </header>
  );
}
