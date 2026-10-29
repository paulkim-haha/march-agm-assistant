// 앱 제목 "3월을 부탁해"를 이미지(그림 글자)처럼 만든 로고입니다.
// 아주 굵은 한글 제목용 글꼴(Black Han Sans) 위에 ① 두꺼운 짙은 청록 윤곽선 ② 아래로 떨어지는 입체 그림자
// ③ 노랑→주황→코랄 핑크 그라데이션 글자 ④ 윗면 하이라이트 ⑤ 벚꽃 장식을 겹쳐 강렬하게 보이게 했습니다.
// SVG라서 화면이 아무리 커져도 선명하고, 어떤 배경 위에서도 윤곽선 덕에 또렷합니다.

import { useId } from "react";

const BLOSSOM = "#ff8fb8";
const FONT = 'var(--font-black-han), "Black Han Sans", "Noto Sans KR", sans-serif';

/** 꽃송이(꽃잎 5장) */
function Flower({ x, y, s, r = 0 }: { x: number; y: number; s: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="0" cy="-9" rx="6.8" ry="9.4" fill={BLOSSOM} stroke="#0f4c5c" strokeWidth="2" transform={`rotate(${a})`} />
      ))}
      <circle r="4.2" fill="#ffb020" stroke="#0f4c5c" strokeWidth="2" />
    </g>
  );
}

export default function TitleLogo({ className = "" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const fill = `${id}-fill`;
  const shine = `${id}-shine`;
  const text = "3월을 부탁해";

  return (
    <svg viewBox="0 0 720 220" role="img" aria-label="3월을 부탁해" className={className}>
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe066" />
          <stop offset="0.5" stopColor="#ff9f43" />
          <stop offset="1" stopColor="#ff5e8a" />
        </linearGradient>
        <linearGradient id={shine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      <g>
        {/* 입체 그림자 (아래·오른쪽으로 두껍게) */}
        <text x="366" y="170" textAnchor="middle" fontSize="132" fontFamily={FONT} fill="#0f4c5c" stroke="#0f4c5c" strokeWidth="26" strokeLinejoin="round">
          {text}
        </text>
        {/* 흰색 바깥 윤곽선 */}
        <text x="360" y="162" textAnchor="middle" fontSize="132" fontFamily={FONT} fill="#ffffff" stroke="#ffffff" strokeWidth="24" strokeLinejoin="round">
          {text}
        </text>
        {/* 짙은 청록 안쪽 윤곽선 */}
        <text x="360" y="162" textAnchor="middle" fontSize="132" fontFamily={FONT} fill="#0f4c5c" stroke="#0f4c5c" strokeWidth="12" strokeLinejoin="round">
          {text}
        </text>
        {/* 글자 본체 (그라데이션) */}
        <text x="360" y="162" textAnchor="middle" fontSize="132" fontFamily={FONT} fill={`url(#${fill})`}>
          {text}
        </text>
        {/* 윗면 하이라이트 */}
        <text x="360" y="162" textAnchor="middle" fontSize="132" fontFamily={FONT} fill={`url(#${shine})`}>
          {text}
        </text>
      </g>

      {/* 벚꽃 장식 */}
      <Flower x={44} y={44} s={1.25} r={-12} />
      <Flower x={682} y={34} s={0.95} r={18} />
      <Flower x={668} y={196} s={0.7} r={-20} />
    </svg>
  );
}
