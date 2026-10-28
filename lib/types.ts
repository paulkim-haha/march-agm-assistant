// 앱 전체가 함께 쓰는 "데이터 모양"을 모아 둔 파일입니다. (DESIGN.md 4장)
// 화면, 서버 API, 계산 함수가 모두 이 모양을 따르기 때문에 서로 어긋나지 않습니다.
// 이 파일에는 실제 동작하는 코드가 없고, "이런 칸이 있다"는 약속만 적혀 있습니다.

// ───────────────────────── 규칙 숫자 ─────────────────────────

// PRD 5장에서 정한 숫자 규칙입니다. 여러 파일에서 같은 숫자를 쓰도록 한곳에 둡니다.
export const RULES = {
  /** 사유의 최대 글자 수 */
  maxReasonLength: 500,
  /** 안건 1건당 근거 조항 최대 개수 */
  maxClauses: 3,
  /** 업로드 파일 크기 한도: 한 번에 올리는 파일들의 합계 (4MB, Vercel 요청 한도 4.5MB 안) */
  maxFileBytes: 4 * 1024 * 1024,
  /** 한 번에 올릴 수 있는 파일 수 (소집통지서와 안건 자료가 나뉜 경우 등) */
  maxFiles: 5,
} as const;

// ───────────────────────── 고를 수 있는 값 ─────────────────────────

/** 안건별 최종 의견 (판단 보류는 담당자가 정해야 하는 상태) */
export type Opinion = "찬성" | "반대" | "불참" | "판단 보류";

/** 가이드라인만 놓고 본 판단 (불참 판정 회사도 이 판단은 따로 남김) */
export type GuidelineJudgment = "찬성" | "반대" | "판단 보류";

/** 개요표의 참석여부 (판단 보류 안건이 남아 있으면 판정 대기) */
export type Attendance = "참석" | "불참" | "판정 대기";

/** 안건 유형 (DESIGN 3장의 "안건 유형 → 가이드라인 장 연결표"와 같은 이름) */
export type AgendaType =
  | "재무제표·이익배당 승인"
  | "정관 변경"
  | "이사 선임"
  | "감사 선임"
  | "감사위원 선임"
  | "이사 보수한도"
  | "감사 보수한도"
  | "주식매수선택권"
  | "합병·분할·영업양수도"
  | "자본금·자기주식"
  | "그 밖의 안건";

/** 안건 유형 전체 목록 (AI에게 이 중에서만 고르게 할 때 씀) */
export const AGENDA_TYPES = [
  "재무제표·이익배당 승인",
  "정관 변경",
  "이사 선임",
  "감사 선임",
  "감사위원 선임",
  "이사 보수한도",
  "감사 보수한도",
  "주식매수선택권",
  "합병·분할·영업양수도",
  "자본금·자기주식",
  "그 밖의 안건",
] as const satisfies readonly AgendaType[];

/** 재무 변동표에 들어가는 4개 항목 */
export type FinancialItem = "매출액" | "영업이익" | "당기순이익" | "자산총계";

/** 전기가 적자일 때 증감률 대신 쓰는 표시 */
export type LossLabel = "적자 축소" | "적자 지속" | "적자 전환" | "흑자 전환";

/** "확인 필요 목록"에 모이는 경고 종류 */
export type WarningKind =
  | "판단 보류"
  | "담당자 확인 필요"
  | "적정성 추가 검토 필요"
  | "담당자 별도 검토 필요"
  | "판단 불가"
  | "조건부 안건"
  | "소유주식수 불일치"
  | "500자 초과"
  | "숫자 불일치";

// ───────────────────────── 앱에 탑재된 자료 ─────────────────────────

/** 보유주식 명세표(data/보유주식_명세표.csv)의 한 줄 */
export type Holding = {
  /** 회사 이름 (예: "다온건설") */
  companyName: string;
  /** 발행주식총수 */
  totalShares: number;
  /** 당사 보유주식수 */
  ourShares: number;
  /** 당사 지분율(%) */
  ourRatio: number;
  /** 이해관계인 이름 (예: "다온그룹㈜ 외 특수관계인 5인") */
  relatedPartyName: string;
  /** 이해관계인 보유주식수 */
  relatedShares: number;
  /** 이해관계인 지분율(%) */
  relatedRatio: number;
  /** 기준일 (예: "2026-12-31") */
  baseDate: string;
};

/** 가이드라인 조항 1개 (data/guideline.json의 한 칸) */
export type GuidelineClause = {
  /** 조항 번호. 가이드라인에 적힌 그대로 (예: "3.3.1)") 또는 표는 "3.3 표" */
  id: string;
  /** 몇 장에 속하는지 (예: 3) */
  chapter: number;
  /** 조항이 속한 소제목 (예: "사외이사의 선임") */
  title: string;
  /** 조항 본문 */
  body: string;
};

/** 보고서에 근거로 붙는 조항 (화면의 근거 박스에 원문을 보여 주기 위해 본문까지 담음. 사유 500자에 포함 안 함) */
export type CitedClause = Pick<GuidelineClause, "id" | "title" | "body">;

// ───────────────────────── 소집통지서에서 뽑은 정보 ─────────────────────────

/** 안건 1개 */
export type Agenda = {
  /** 의안 번호 (예: "제1호", "제2-1호") */
  number: string;
  /** 의안 제목 (예: "사외이사 박정우 선임의 건") */
  title: string;
  /** 안건 유형. 하위 안건을 묶기만 하는 상위 안건은 null */
  type: AgendaType | null;
  /** 통지서에 적힌 안건 설명 원문 */
  content: string;
  /** 하위 안건이면 상위 안건 번호 (예: 제2-1호 → "제2호") */
  parentNumber?: string;
  /** 하위 안건을 가진 상위 안건이면 true (의견 없이 제목줄로만 보여 줌) */
  isGroup: boolean;
  /** 다른 안건이 가결돼야 상정되는 조건부 안건이면 그 안건 번호 (예: 제3호 → "제2-1호") */
  conditionNumber?: string;
};

/** 재무 변동표의 한 줄 (단위: 백만 원) */
export type FinancialRow = {
  item: FinancialItem;
  /** 당기 값 (자료에 없으면 null) */
  current: number | null;
  /** 전기 값 (자료에 없으면 null) */
  previous: number | null;
  /** 증감액 (계산할 수 없으면 null) */
  change: number | null;
  /** 증감률(%, 소수점 첫째 자리). 전기가 적자면 null이고 lossLabel을 씀 */
  changeRate: number | null;
  /** 전기가 적자일 때의 표시 */
  lossLabel?: LossLabel;
};

/** 주당배당금 비교 (단위: 원) */
export type Dividend = {
  currentPerShare: number | null;
  previousPerShare: number | null;
  change: number | null;
};

/** 보수한도 비교 (단위: 억 원) */
export type PayLimit = {
  target: "이사" | "감사";
  current: number | null;
  previous: number | null;
  /** 보수한도 증감률(%) */
  changeRate: number | null;
  /** 이사 보수한도와 나란히 비교할 영업이익 증감률(%) */
  operatingIncomeRate?: number | null;
  /** 이사 보수한도와 나란히 비교할 당기순이익 증감률(%) */
  netIncomeRate?: number | null;
  /** 영업이익과 당기순이익의 방향이 엇갈리면 true (사유에 종합 판단 근거를 밝혀야 함) */
  mixedDirection?: boolean;
  /** 판정 결과 문구 (예: "적정성 추가 검토 필요"). 문제가 없으면 없음 */
  flag?: "적정성 추가 검토 필요" | "담당자 별도 검토 필요" | "판단 불가: 담당자 확인 필요";
};

// ───────────────────────── 보고서 ─────────────────────────

/** 확인 필요 목록에 들어가는 경고 1개 */
export type Warning = {
  kind: WarningKind;
  /** 어느 안건의 경고인지 (회사 전체에 대한 경고면 없음) */
  agendaNumber?: string;
  /** 화면에 보여 줄 문장 */
  message: string;
};

/** 안건 1개의 검토 결과 (화면의 안건 카드 1장) */
export type AgendaReview = {
  agenda: Agenda;
  /** 최종 의견 (담당자가 화면에서 바꿀 수 있음) */
  opinion: Opinion;
  /** 가이드라인만 놓고 본 판단 */
  guidelineJudgment: GuidelineJudgment;
  /** 사유 (500자 이내) */
  reason: string;
  /** 근거 조항 (최대 3개) */
  clauses: CitedClause[];
  /** 담당자 판단 필요 사항 (선임 안건에서 자료만으로 판단할 수 없는 것). 사유 500자에 포함하지 않음 */
  managerChecks: string[];
  /** 보수한도 안건일 때만 있는 비교표 */
  payLimit?: PayLimit;
};

/** 개요표 부의안건 목록의 한 줄 */
export type OverviewAgendaLine = {
  number: string;
  title: string;
  /** 하위 안건이면 true (들여 써서 보여 줌) */
  isSub: boolean;
};

/** 보고서 맨 앞의 주주총회 개요표 */
export type Overview = {
  /** 일시 (자료에 없으면 빈 문자열) */
  dateTime: string;
  /** 장소 (자료에 없으면 빈 문자열) */
  place: string;
  /** 부의안건 목록 (의안 번호 순서) */
  agendaLines: OverviewAgendaLine[];
  /** 보유지분율과 수량 (명세표에 회사가 없으면 null → "담당자 확인 필요") */
  ownership: { ratio: number; shares: number } | null;
  attendance: Attendance;
  /** 불참사유 (참석이면 "-") */
  absenceReason: string;
};

/** 회사 1곳의 보고서 1개 (검토 API가 돌려주는 결과) */
export type Report = {
  companyName: string;
  /** 이해관계인 지분이 2/3 이상이라 불참 판정된 회사인지 */
  isAbsenceCompany: boolean;
  overview: Overview;
  /**
   * 의견을 매긴 안건의 검토 결과 (의안 번호 순서).
   * 하위 안건을 묶기만 하는 상위 안건(예: 제2호)은 넣지 않고, 화면은 개요표 agendaLines와
   * 안건의 parentNumber로 제목줄을 보여 줍니다. (참석여부를 셀 때 상위 안건이 섞이지 않게)
   */
  reviews: AgendaReview[];
  /** 재무 변동표 (재무제표 안건이 없거나 표가 없으면 빈 배열) */
  financials: FinancialRow[];
  /** 주당배당금 비교 (이익배당 안건이 없으면 없음) */
  dividend?: Dividend;
  /** 확인 필요 목록 */
  warnings: Warning[];
};

// ───────────────────────── 검토 API 주고받기 ─────────────────────────

/** 검토 API 오류 코드 (DESIGN.md 7장) */
export type ErrorCode =
  | "NO_FILE"
  | "TOO_MANY_FILES"
  | "FILE_TOO_LARGE"
  | "MIXED_COMPANY"
  | "UNSUPPORTED_TYPE"
  | "BLOCKED_FILE"
  | "UNREADABLE_PDF"
  | "NO_AGENDA"
  | "DATA_MISSING"
  | "AI_BAD_RESPONSE"
  | "AI_UNAVAILABLE"
  | "INTERNAL_ERROR";

/** 검토 API 응답: 성공이면 report, 실패면 error 중 하나만 옴 */
export type ReviewResponse =
  | { report: Report }
  | { error: { code: ErrorCode; message: string } };
