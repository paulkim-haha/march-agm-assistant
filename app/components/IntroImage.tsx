// 머리말 소개 문장을 이미지(그림 글자)처럼 만든 것입니다. 둥글둥글한 한글 글꼴(Jua)로 2줄을 가운데 정렬하고,
// 핵심 단어(소집통지서·가이드라인)에는 코랄 색을 입혔습니다. SVG라서 크기가 바뀌어도 선명합니다.
// 스크린리더는 그림 대신 원래 문장을 그대로 읽습니다(aria-label).

const FONT = 'var(--font-jua), "Jua", "Noto Sans KR", sans-serif';
const INK = "#4a2f1b";
const HI = "#c93a5e";

export const INTRO_SENTENCE =
  "주주총회 소집통지서를 올리면, 의결권 행사 가이드라인에 맞춰 안건별 검토 의견과 사유 초안을 만들어 드려요";

export default function IntroImage({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 640 92" role="img" aria-label={INTRO_SENTENCE} className={className}>
      <g textAnchor="middle" fontFamily={FONT} fontSize="22" fill={INK}>
        <text x="320" y="32">
          주주총회 <tspan fill={HI}>소집통지서</tspan>를 올리면, 의결권 행사 <tspan fill={HI}>가이드라인</tspan>에 맞춰
        </text>
        <text x="320" y="72">
          안건별 검토 의견과 사유 초안을 만들어 드려요
        </text>
      </g>
    </svg>
  );
}
