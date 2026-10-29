// 보고서를 복사용 글자로 바꾸는 파일입니다. (PLAN 작업 20, DESIGN.md 6장 "보고서 전체 복사")
// 같은 표 데이터로 두 가지를 만듭니다.
// - 한글·엑셀용 표 형식: HTML 표 (붙여 넣으면 표 모양 그대로)
// - 메모장용 글자: 칸은 탭, 줄은 줄바꿈으로 구분
// 근거는 조항 번호와 원문을 함께 넣고, 확인 필요 목록은 넣지 않습니다.
// 이 파일은 화면(브라우저)에서 쓰므로 서버 전용 기능은 넣지 않습니다. 숫자 보여 주기 함수는 화면 카드와 같이 씁니다.

import type { PayLimit, Report } from "./types.ts";

/** 숫자를 쉼표 넣어 보여 줍니다. 빈칸이면 "-" */
export const formatNumber = (n: number | null | undefined) => (n === null || n === undefined ? "-" : n.toLocaleString("ko-KR"));
/** 증감률을 부호와 함께 (+7.4%) */
export const formatRate = (n: number | null | undefined) => (n === null || n === undefined ? "-" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);
/**
 * 재무 변동표 한 줄의 증감률 칸. 비율이 있으면 비율 (+7.4%), 전기 적자라 비율이 없으면 "적자 축소" 같은 표시.
 * 전기 흑자 → 당기 적자는 비율(-150.0%)과 "적자 전환" 표시를 함께 보여 줍니다. (갭 분석 M-3)
 */
export function formatRateCell(row: { changeRate: number | null; lossLabel?: string }): string {
  if (row.changeRate === null) return row.lossLabel ?? "-";
  const rate = formatRate(row.changeRate);
  return row.lossLabel ? `${rate} (${row.lossLabel})` : rate;
}
/** 증감액을 부호와 함께 (+88,300) */
export const formatSigned = (n: number | null | undefined) =>
  n === null || n === undefined ? "-" : `${n > 0 ? "+" : ""}${n.toLocaleString("ko-KR")}`;

/** 보수한도 비교를 한 줄 글로 (예: "이사 보수한도 30억 원 → 40억 원 (+33.3%)") */
export function payLimitText(pay: PayLimit): string {
  const lines = [`${pay.target} 보수한도 ${formatNumber(pay.previous)}억 원 → ${formatNumber(pay.current)}억 원 (${formatRate(pay.changeRate)})`];
  if (pay.target === "이사") {
    lines.push(
      `영업이익 ${formatRate(pay.operatingIncomeRate)} · 당기순이익 ${formatRate(pay.netIncomeRate)}${pay.mixedDirection ? " · 두 지표의 방향이 엇갈림" : ""}`,
    );
  }
  if (pay.flag) lines.push(`⚠ ${pay.flag}`);
  return lines.join("\n");
}

/** 복사할 표 1개. 칸 안의 줄바꿈은 그대로 두고, 만들 때 형식에 맞게 바꿉니다. */
export type CopyTable = {
  title: string;
  /** 첫 줄을 머리글(회색 칸)로 보일지 */
  header: boolean;
  rows: string[][];
};

/** 보고서를 복사할 표 목록으로 바꿉니다: 개요 → (재무 변동표) → 안건별 검토 */
export function reportToTables(report: Report): CopyTable[] {
  const { overview, reviews, financials, dividend } = report;
  const tables: CopyTable[] = [];

  // ■ 주주총회 개요
  tables.push({
    title: "주주총회 개요",
    header: false,
    rows: [
      ["일시", overview.dateTime || "담당자 확인 필요"],
      ["장소", overview.place || "담당자 확인 필요"],
      ["부의안건", overview.agendaLines.map((l) => `${l.isSub ? "└ " : ""}${l.number} ${l.title}`).join("\n")],
      [
        "보유지분율",
        overview.ownership
          ? `${overview.ownership.ratio.toFixed(1)}% (수량 ${overview.ownership.shares.toLocaleString("ko-KR")}주)`
          : "담당자 확인 필요",
      ],
      ["참석여부", overview.attendance],
      ["불참사유", overview.absenceReason],
    ],
  });

  // ■ 재무 변동표 (재무제표 안건이 있고 숫자가 있을 때만)
  if (financials.some((r) => r.current !== null || r.previous !== null)) {
    const rows = [["항목", "전기", "당기", "증감액", "증감률"]];
    for (const r of financials) {
      rows.push([
        r.item,
        formatNumber(r.previous),
        formatNumber(r.current),
        formatSigned(r.change),
        formatRateCell(r),
      ]);
    }
    if (dividend) {
      rows.push(["주당배당금(원)", formatNumber(dividend.previousPerShare), formatNumber(dividend.currentPerShare), formatSigned(dividend.change), "-"]);
    }
    tables.push({ title: "재무 변동표 (별도재무제표, 단위: 백만 원)", header: true, rows });
  }

  // ■ 안건별 검토 (개요표 부의안건 순서, 상위 안건은 제목만)
  const byNumber = new Map(reviews.map((r) => [r.agenda.number, r]));
  const rows = [["의안 번호", "안건", "의견", "사유", "근거 조항", "담당자 판단 필요 사항"]];
  for (const line of overview.agendaLines) {
    const review = byNumber.get(line.number);
    if (!review) {
      rows.push([line.number, line.title, "", "", "", ""]);
      continue;
    }
    const { agenda, opinion, guidelineJudgment, reason, clauses, managerChecks, payLimit } = review;
    const title = [agenda.title];
    if (agenda.conditionNumber) title.push(`※ ${agenda.conditionNumber}이(가) 가결되는 경우에만 상정되는 안건`);
    if (payLimit) title.push(payLimitText(payLimit));
    const opinionText =
      guidelineJudgment !== "판단 보류" && guidelineJudgment !== opinion && opinion !== "판단 보류"
        ? `${opinion}\n(가이드라인 기준 판단: ${guidelineJudgment})`
        : opinion;
    rows.push([
      agenda.number,
      title.join("\n"),
      opinionText,
      reason,
      clauses.map((c) => `[${c.id} ${c.title}]\n${c.body}`).join("\n\n"),
      managerChecks.map((m) => `· ${m}`).join("\n"),
    ]);
  }
  tables.push({ title: "안건별 검토", header: true, rows });

  return tables;
}

/** HTML 글자로 넣을 수 없는 기호를 바꿉니다. (<, > 같은 기호가 표를 깨뜨리지 않게) */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 칸 안 줄바꿈. mso-data-placement는 엑셀에서 줄바꿈해도 같은 칸에 남게 하는 설정 */
const CELL_BREAK = '<br style="mso-data-placement:same-cell">';
const CELL_STYLE = "border:1px solid #999;padding:4px 6px;vertical-align:top;";

/** 한글·엑셀용 표 형식 (HTML) */
export function reportToHtml(report: Report): string {
  const parts = [`<p><b>${escapeHtml(report.companyName)} 검토 보고서</b></p>`];
  for (const t of reportToTables(report)) {
    parts.push(`<p><b>■ ${escapeHtml(t.title)}</b></p>`);
    const body = t.rows
      .map((row, i) => {
        const isHead = t.header && i === 0;
        const cells = row.map((cell, j) => {
          const tag = isHead || (!t.header && j === 0) ? "th" : "td";
          const bg = tag === "th" ? "background:#f0f0f0;" : "";
          return `<${tag} style="${CELL_STYLE}${bg}">${escapeHtml(cell).split("\n").join(CELL_BREAK)}</${tag}>`;
        });
        return `<tr>${cells.join("")}</tr>`;
      })
      .join("");
    parts.push(`<table style="border-collapse:collapse;">${body}</table>`);
  }
  return `<meta charset="utf-8">${parts.join("")}`;
}

/** 메모장용 글자: 칸은 탭으로, 줄은 줄바꿈으로 나눕니다. 칸 안 줄바꿈·탭은 띄어쓰기로 바꿈 */
export function reportToText(report: Report): string {
  const cell = (s: string) => s.replace(/[\t\r\n]+/g, " ").trim();
  const blocks = [`${report.companyName} 검토 보고서`];
  for (const t of reportToTables(report)) {
    blocks.push([`■ ${t.title}`, ...t.rows.map((row) => row.map(cell).join("\t"))].join("\n"));
  }
  return blocks.join("\n\n");
}
