// 숫자 계산을 모아 둔 파일입니다. (PLAN 작업 6)
// PRD 규칙대로 숫자 계산은 AI에게 맡기지 않고 이 파일의 코드로만 합니다.
// 여기서는 증감액·증감률·지분율·배당 증감을 계산합니다.
// (불참 판정과 보수한도 비교는 PLAN 작업 7·8에서 이 파일에 이어서 추가합니다.)

import type { Dividend, FinancialItem, FinancialRow, LossLabel } from "./types.ts";

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
