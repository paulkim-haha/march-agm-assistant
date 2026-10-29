// 버튼과 제목 앞에 붙이는 아이콘 모음입니다. (새 패키지 없이 직접 그린 SVG)
// 모양은 모두 "선으로만 그린" 단순한 스타일이고, 색은 둘러싼 글자색을 따라갑니다(currentColor).
// 아이콘은 장식이라 스크린리더가 읽지 않도록 aria-hidden을 붙였습니다.

import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 18, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** 파일 올리기 (구름 + 위 화살표) */
export const UploadIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 16V4" />
    <path d="m7 8 5-5 5 5" />
    <path d="M20 16.5v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-2" />
  </Base>
);

/** 검토 시작 (반짝이) */
export const SparklesIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 10.9 10.1 9z" />
    <path d="M19 3v4M17 5h4" />
  </Base>
);

/** 문서 (파일 목록) */
export const FileIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Base>
);

/** 닫기·빼기 */
export const CloseIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);

/** 복사 */
export const CopyIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </Base>
);

/** 체크 (완료) */
export const CheckIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Base>
);

/** 되돌리기 */
export const UndoIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Base>
);

/** 경고 (삼각형 느낌표) */
export const AlertIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.5v4M12 17h.01" />
  </Base>
);

/** 달력+체크 (앱 로고) */
export const CalendarCheckIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M8 3v4M16 3v4M3.5 10h17" />
    <path d="m9 15 2.2 2.2L15.5 13" />
  </Base>
);

/** 개요표 (표) */
export const TableIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 10h17M9.5 10v9.5" />
  </Base>
);

/** 조항 (책) */
export const BookIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v16H6.5A1.5 1.5 0 0 0 5 20.5z" />
    <path d="M5 20.5A1.5 1.5 0 0 0 6.5 22H19v-3" />
  </Base>
);

/** 오른쪽 화살표 */
export const ArrowRightIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Base>
);

/** 둥글게 도는 표시 (검토 중) */
export const SpinnerIcon = ({ size = 18, ...rest }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.4}
    strokeLinecap="round"
    aria-hidden="true"
    focusable="false"
    className="shrink-0 animate-spin motion-reduce:animate-none"
    {...rest}
  >
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
);
