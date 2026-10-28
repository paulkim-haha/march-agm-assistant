// 숫자 계산을 모아 둔 파일입니다. (PLAN 작업 6)
// PRD 규칙대로 숫자 계산은 AI에게 맡기지 않고 이 파일의 코드로만 합니다.
// 여기서는 증감액·증감률·지분율·배당 증감을 계산하고(작업 6), 불참을 판정하고(작업 7),
// 이사·감사 보수한도를 비교하고(작업 8), 개요표의 참석여부를 판정합니다(작업 13).

import type {
  Attendance,
  Dividend,
  FinancialItem,
  FinancialRow,
  GuidelineJudgment,
  Holding,
  LossLabel,
  Opinion,
  PayLimit,
} from "./types.ts";

/** 재무 변동표에 넣는 항목 순서 (PRD 5장) */
export const FINANCIAL_ITEMS: FinancialItem[] = ["매출액", "영업이익", "당기순이익", "자산총계"];

/**
 * 소수점 첫째 자리로 반올림합니다. 0.05는 0.1, -0.05는 -0.1이 됩니다. (사사오입)
 * 컴퓨터의 소수 계산 오차(예: 1.005가 1.00499…로 저장됨) 때문에 아주 작은 값을 더해 보정합니다.
 */
export function round1(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const rounded = Math.round(Math.abs(value) * 10 + 1e-9) / 10;
  return rounded === 0 ? 0 : sign * rounded; // -0이 나오지 않게
}

/** 증감액 = 당기 - 전기. 둘 중 하나라도 없으면 null */
export function changeAmount(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return current - previous;
}

/**
 * 증감률(%) = (당기 - 전기) ÷ 전기 × 100, 소수점 첫째 자리 반올림.
 * 전기가 0이거나 적자(마이너스)면 비율이 뜻이 없으므로 null을 돌려줍니다.
 * (전기가 적자일 때는 lossLabel의 "적자 축소" 같은 표시를 씁니다.)
 */
export function changeRate(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (previous <= 0) return null;
  return round1(((current - previous) / previous) * 100);
}

/**
 * 적자(마이너스)가 끼어 있을 때의 표시입니다. 해당 없으면 undefined.
 * - 전기 적자 → 당기 적자: 손실이 줄면 "적자 축소", 같거나 늘면 "적자 지속"
 * - 전기 적자 → 당기 0 이상: "흑자 전환"
 * - 전기 0 이상 → 당기 적자: "적자 전환"
 */
export function lossLabel(current: number | null, previous: number | null): LossLabel | undefined {
  if (current === null || previous === null) return undefined;
  if (previous < 0) {
    if (current >= 0) return "흑자 전환";
    return current > previous ? "적자 축소" : "적자 지속";
  }
  if (current < 0) return "적자 전환";
  return undefined;
}

/** 재무 변동표의 한 줄을 만듭니다. (단위: 백만 원) */
export function buildFinancialRow(
  item: FinancialItem,
  current: number | null,
  previous: number | null,
): FinancialRow {
  const row: FinancialRow = {
    item,
    current,
    previous,
    change: changeAmount(current, previous),
    changeRate: changeRate(current, previous),
  };
  const label = lossLabel(current, previous);
  if (label) row.lossLabel = label;
  return row;
}

/**
 * 4개 항목의 당기·전기 값으로 재무 변동표 전체를 만듭니다.
 * 자료에 없는 항목은 당기·전기를 null로 두어 빈칸이 되게 합니다.
 */
export function buildFinancialTable(
  values: Partial<Record<FinancialItem, { current: number | null; previous: number | null }>>,
): FinancialRow[] {
  return FINANCIAL_ITEMS.map((item) =>
    buildFinancialRow(item, values[item]?.current ?? null, values[item]?.previous ?? null),
  );
}

/** 지분율(%) = 보유주식 ÷ 발행주식총수 × 100, 소수점 첫째 자리 반올림. 발행주식이 없으면 null */
export function ownershipRatio(shares: number, totalShares: number): number | null {
  if (!(totalShares > 0)) return null;
  return round1((shares / totalShares) * 100);
}

/** 주당배당금의 전년 대비 증감 (단위: 원) */
export function buildDividend(currentPerShare: number | null, previousPerShare: number | null): Dividend {
  return {
    currentPerShare,
    previousPerShare,
    change: changeAmount(currentPerShare, previousPerShare),
  };
}

// ───────────────────────── 불참 판정 (PLAN 작업 7) ─────────────────────────

/** 숫자에 천 단위 쉼표를 넣습니다. (31050000 → "31,050,000") */
function withCommas(n: number): string {
  return n.toLocaleString("ko-KR");
}

/** 지분율을 소수점 첫째 자리까지 보여 줍니다. (69 → "69.0") */
function percent(n: number): string {
  return round1(n).toFixed(1);
}

/**
 * 불참 판정 회사인지 정합니다. (PRD 5장 must 2)
 * 이해관계인 보유주식만으로 보통결의(출석 과반수 + 발행주식 1/4)와 특별결의(출석 2/3 + 발행주식 1/3)
 * 요건을 모두 충족하면, 당사가 어떻게 행사해도 결과가 바뀌지 않으므로 불참합니다.
 * 주주 전원이 출석해도 충족해야 하므로 기준은 "발행주식총수의 2/3 이상"입니다.
 * 소수 오차가 생기지 않게 나눗셈 대신 "이해관계인 주식 × 3 ≥ 발행주식총수 × 2"로 비교합니다.
 */
export function isAbsenceCompany(holding: Holding): boolean {
  if (!(holding.totalShares > 0)) return false;
  return holding.relatedShares * 3 >= holding.totalShares * 2;
}

/** 이해관계인 보유 현황 문구 (불참 문장들이 함께 씀) */
function relatedPartyPhrase(holding: Holding): string {
  return `이해관계인(${holding.relatedPartyName})이 ${withCommas(holding.relatedShares)}주(${percent(holding.relatedRatio)}%)를 보유하고 있어`;
}

/**
 * 개요표 "불참사유" 칸에 들어갈 문장을 정해진 틀로 만듭니다.
 * 예: 이해관계인(새봄제약㈜ 외 특수관계인 4인)이 31,050,000주(69.0%)를 보유하고 있어
 *     상법상 보통결의·특별결의 요건을 단독으로 충족하므로, 당사 지분(0.3%)의 의결권 행사가
 *     결과에 영향을 미치지 못함
 */
export function absenceReason(holding: Holding): string {
  return (
    `${relatedPartyPhrase(holding)} 상법상 보통결의·특별결의 요건을 단독으로 충족하므로, ` +
    `당사 지분(${percent(holding.ourRatio)}%)의 의결권 행사가 결과에 영향을 미치지 못함`
  );
}

/**
 * 불참 판정 회사의 안건 사유를 정해진 틀로 만듭니다. (PRD 5장, DESIGN 3장 "불참 판정 회사의 사유 틀")
 * AI가 쓴 "가이드라인 기준 판단의 요지"를 앞에 넣고, 불참하는 이유를 뒤에 붙입니다.
 * - judgment: 가이드라인만 놓고 본 판단 (찬성/반대/판단 보류)
 * - summary: AI가 쓴 판단 요지 (예: "외부감사인의 감사의견이 적정이므로 찬성")
 */
export function absenceOpinionReason(
  holding: Holding,
  judgment: GuidelineJudgment,
  summary: string,
): string {
  const tail =
    `${relatedPartyPhrase(holding)} 당사 지분(${percent(holding.ourRatio)}%)의 ` +
    `의결권 행사가 결과에 영향을 미치지 못하므로 불참한다.`;
  const gist = summary.trim().replace(/[.。]$/, "");

  if (judgment === "판단 보류") {
    // 근거 조항을 찾지 못한 경우: 담당자가 볼 수 있게 그 사실을 남김
    return `의결권 행사기준상 해당 조항을 찾지 못해 판단을 보류하나(담당자 확인 필요), ${tail}`;
  }
  if (gist === "") {
    return `의결권 행사기준에 따르면 ${judgment} 사유에 해당하나, ${tail}`;
  }
  return `의결권 행사기준에 따르면 ${gist}(${judgment} 사유)에 해당하나, ${tail}`;
}

/**
 * 개요표의 참석여부를 정합니다. (PRD 5장 must 2)
 * - 판단 보류 안건이 하나라도 남아 있으면 "판정 대기" (담당자가 의견을 고르면 다시 판정)
 * - 모든 안건이 불참이면 "불참"
 * - 하나라도 찬성·반대가 있으면 "참석"
 * 안건이 없으면(아직 의견을 정하기 전) "판정 대기"입니다.
 */
export function decideAttendance(opinions: Opinion[]): Attendance {
  if (opinions.length === 0 || opinions.includes("판단 보류")) return "판정 대기";
  if (opinions.every((o) => o === "불참")) return "불참";
  return "참석";
}

// ───────────────────────── 보수한도 비교 (PLAN 작업 8) ─────────────────────────

/** 실적 지표가 좋아졌는지(up), 나빠졌는지(down), 그대로인지(flat), 알 수 없는지(null) */
type Direction = "up" | "down" | "flat" | null;

/** 재무 변동표의 한 줄이 어느 방향으로 움직였는지 봅니다. 적자 표시도 방향으로 바꿉니다. */
function directionOf(row: FinancialRow | undefined): Direction {
  if (!row || row.change === null) return null;
  if (row.lossLabel === "적자 축소" || row.lossLabel === "흑자 전환") return "up";
  if (row.lossLabel === "적자 지속" || row.lossLabel === "적자 전환") return "down";
  if (row.change > 0) return "up";
  if (row.change < 0) return "down";
  return "flat";
}

/**
 * 이사 보수한도를 경영성과(영업이익·당기순이익)와 나란히 비교합니다. (PRD 5장 must 2)
 * - current·previous: 당기·전기 보수한도 (단위: 억 원)
 * - financials: 같은 회사의 재무 변동표 (작업 6의 buildFinancialTable 결과)
 *
 * 표시 규칙
 * 1) 보수한도나 두 실적 지표 중 하나라도 자료가 없으면 → "판단 불가: 담당자 확인 필요"
 * 2) 두 지표가 모두 나빠졌는데 한도가 늘었으면 → "적정성 추가 검토 필요"
 * 3) 한도가 늘었고, 한도 증가율이 두 지표의 증가율보다 모두 높으면 → "적정성 추가 검토 필요"
 *    (동결·감소한 한도에는 3번을 적용하지 않습니다. "증가율"을 비교하는 규칙이기 때문)
 * 두 지표의 방향이 엇갈리면 mixedDirection을 true로 두어, 사유에 종합 판단 근거를 쓰게 합니다.
 */
export function compareDirectorPayLimit(
  current: number | null,
  previous: number | null,
  financials: FinancialRow[],
): PayLimit {
  const op = financials.find((r) => r.item === "영업이익");
  const net = financials.find((r) => r.item === "당기순이익");
  const result: PayLimit = {
    target: "이사",
    current,
    previous,
    changeRate: changeRate(current, previous),
    operatingIncomeRate: op?.changeRate ?? null,
    netIncomeRate: net?.changeRate ?? null,
  };

  const limitChange = changeAmount(current, previous);
  const opDir = directionOf(op);
  const netDir = directionOf(net);

  // 1) 비교할 자료가 없음
  if (limitChange === null || opDir === null || netDir === null) {
    result.flag = "판단 불가: 담당자 확인 필요";
    return result;
  }

  // 두 지표의 방향이 엇갈림 (하나는 좋아지고 하나는 나빠짐)
  const dirs = [opDir, netDir];
  if (dirs.includes("up") && dirs.includes("down")) result.mixedDirection = true;

  // 2) 두 지표가 모두 나빠졌는데 한도는 늘어남
  if (opDir === "down" && netDir === "down" && limitChange > 0) {
    result.flag = "적정성 추가 검토 필요";
    return result;
  }

  // 3) 한도가 늘었고, 한도 증가율이 두 지표의 증가율보다 모두 높음
  const rate = result.changeRate;
  const opRate = result.operatingIncomeRate;
  const netRate = result.netIncomeRate;
  if (
    limitChange > 0 &&
    rate !== null &&
    opRate !== null &&
    opRate !== undefined &&
    netRate !== null &&
    netRate !== undefined &&
    rate > opRate &&
    rate > netRate
  ) {
    result.flag = "적정성 추가 검토 필요";
  }
  return result;
}

/**
 * 감사 보수한도를 비교합니다. (PRD 5장 must 2)
 * 전년보다 줄었을 때만 "담당자 별도 검토 필요"를 표시하고, 동결·증가면 표시하지 않습니다.
 * (가이드라인 4.1.2)는 감사 보수가 너무 적으면 감사가 제 역할을 하기 어렵다고 봄)
 * 자료가 없으면 "판단 불가: 담당자 확인 필요"를 표시합니다.
 */
export function compareAuditorPayLimit(current: number | null, previous: number | null): PayLimit {
  const result: PayLimit = {
    target: "감사",
    current,
    previous,
    changeRate: changeRate(current, previous),
  };
  const change = changeAmount(current, previous);
  if (change === null) result.flag = "판단 불가: 담당자 확인 필요";
  else if (change < 0) result.flag = "담당자 별도 검토 필요";
  return result;
}
