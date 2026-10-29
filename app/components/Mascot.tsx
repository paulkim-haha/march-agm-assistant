// 앱 캐릭터 "주총이"입니다. 주주총회 안건을 대신 꼼꼼히 살펴 주는 AI 비서 로봇이에요.
// 머리 위 벚꽃은 "3월(봄 주총 시즌)"을 뜻하고, 손에 든 서류판은 "안건 검토"를 뜻합니다.
// 직접 그린 SVG라서 따로 이미지 파일이 필요 없고, 색은 따뜻하고 화사한 노랑·주황·코랄 핑크로 정했고, 밝은·어두운 모드에서 똑같이 보입니다.
// 표정(mood): idle(기본) · working(검토 중) · done(검토 끝) · error(문제 생김)

import { useId } from "react";

export type MascotMood = "idle" | "working" | "done" | "error";

const BLOSSOM = "#ff8fb8"; // 벚꽃 분홍 (밝은·어두운 모드 모두 잘 보이는 색)

export default function Mascot({ mood = "idle", size = 120, className = "" }: { mood?: MascotMood; size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const gradBody = `${id}-body`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      role="img"
      aria-label="AI 비서 주총이"
      className={`${mood === "working" ? "mascot-work" : "mascot-float"} ${className}`}
    >
      <defs>
        <linearGradient id={gradBody} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffc857" />
          <stop offset="1" stopColor="#ff6f91" />
        </linearGradient>
      </defs>

      {/* 바닥 그림자 */}
      <ellipse cx="80" cy="150" rx="38" ry="5" fill="#0f4c5c" opacity="0.1" />

      {/* 몸 */}
      <rect x="44" y="96" width="72" height="50" rx="24" fill={`url(#${gradBody})`} />
      {/* 팔 (왼쪽은 흔들기, 오른쪽은 서류판을 받침) */}
      <circle cx="40" cy="116" r="9" fill="#ff9f43" />
      <circle cx="120" cy="120" r="9" fill="#ff6f91" />

      {/* 서류판 (안건 검토) */}
      <g transform="rotate(8 112 124)">
        <rect x="92" y="98" width="38" height="46" rx="7" fill="#ffffff" stroke="#0f4c5c" strokeWidth="3" />
        <rect x="102" y="93" width="18" height="9" rx="4" fill="#0f4c5c" />
        <path d="M99 114h24M99 122h24M99 130h14" stroke="#ffd9c2" strokeWidth="3.2" strokeLinecap="round" />
        <path d="m100 138 4 4 8-9" stroke="#17b27a" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>

      {/* 안테나 + 벚꽃 */}
      <path d="M80 34V20" stroke="#ff9f43" strokeWidth="4" strokeLinecap="round" />
      <g transform="translate(80 14)">
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse key={a} cx="0" cy="-6.5" rx="4.6" ry="6.2" fill={BLOSSOM} transform={`rotate(${a})`} />
        ))}
        <circle r="3.4" fill="#ffb020" />
      </g>

      {/* 귀 */}
      <circle cx="28" cy="68" r="7" fill="#ff9f43" />
      <circle cx="132" cy="68" r="7" fill="#ff6f91" />

      {/* 머리 */}
      <rect x="30" y="34" width="100" height="72" rx="32" fill="#ffffff" stroke="#ff8a5b" strokeWidth="4.5" />
      {/* 얼굴 화면 */}
      <rect x="42" y="46" width="76" height="48" rx="22" fill="#fff3d6" />

      {/* 볼터치 */}
      <ellipse cx="55" cy="80" rx="7" ry="4.2" fill={BLOSSOM} opacity="0.5" />
      <ellipse cx="105" cy="80" rx="7" ry="4.2" fill={BLOSSOM} opacity="0.5" />

      {/* 눈과 입: 표정마다 달라짐 */}
      {mood === "done" ? (
        <>
          <path d="M56 68q6-8 12 0M92 68q6-8 12 0" stroke="#0f4c5c" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M68 80q12 12 24 0" stroke="#0f4c5c" strokeWidth="4" strokeLinecap="round" fill="none" />
        </>
      ) : mood === "error" ? (
        <>
          <path d="m57 62 10 10m0-10-10 10M93 62l10 10m0-10-10 10" stroke="#0f4c5c" strokeWidth="3.6" strokeLinecap="round" />
          <path d="M70 87q10-8 20 0" stroke="#0f4c5c" strokeWidth="4" strokeLinecap="round" fill="none" />
        </>
      ) : mood === "working" ? (
        <>
          <circle cx="64" cy="66" r="6.5" fill="#0f4c5c" />
          <circle cx="96" cy="66" r="6.5" fill="#0f4c5c" />
          <circle cx="66.5" cy="64" r="2.2" fill="#ffffff" />
          <circle cx="98.5" cy="64" r="2.2" fill="#ffffff" />
          <ellipse cx="80" cy="83" rx="5" ry="4" fill="#0f4c5c" />
        </>
      ) : (
        <>
          <circle cx="63" cy="66" r="6.5" fill="#0f4c5c" />
          <circle cx="97" cy="66" r="6.5" fill="#0f4c5c" />
          <circle cx="65.2" cy="63.8" r="2.2" fill="#ffffff" />
          <circle cx="99.2" cy="63.8" r="2.2" fill="#ffffff" />
          <path d="M70 79q10 10 20 0" stroke="#0f4c5c" strokeWidth="4" strokeLinecap="round" fill="none" />
        </>
      )}

      {/* 검토 끝: 반짝이 / 검토 중: 돋보기 */}
      {mood === "done" && (
        <g fill="#ffb020">
          <path d="M136 30l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
          <path d="M22 28l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
        </g>
      )}
      {mood === "working" && (
        <g transform="translate(118 88)">
          <circle cx="8" cy="8" r="11" fill="#ffffff" fillOpacity="0.55" stroke="#0f4c5c" strokeWidth="4" />
          <path d="m17 17 12 12" stroke="#0f4c5c" strokeWidth="5" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
