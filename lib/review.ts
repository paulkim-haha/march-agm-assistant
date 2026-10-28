// 검토 단계(DESIGN.md 3장 ①~⑥)를 차례로 잇는 파일입니다.
// 지금은 ② 정보 뽑기(PLAN 작업 12)와 개요표 만들기(작업 13)가 있고, 나머지 단계는 작업 14~16에서 이어서 추가합니다.

import { askAiJson, type FetchLike } from "./ai.ts";
import { absenceReason, decideAttendance, isAbsenceCompany } from "./calc.ts";
import type { ExtractedBundle } from "./extract-text.ts";
import { ReviewError } from "./extract-text.ts";
import { findHolding, normalizeCompanyName } from "./holdings.ts";
import { NOTICE_SYSTEM, noticeInfoSchema, noticeUserPrompt, type NoticeInfo } from "./prompts.ts";
import type { Agenda, Holding, Opinion, Overview, Warning } from "./types.ts";

// ───────────────────────── 원문 대조 도우미 ─────────────────────────

/** 글자(일시·장소) 비교용: 띄어쓰기와 마크다운 꾸밈표(**, |, #)를 모두 지웁니다. */
function squash(s: string): string {
  return s.replace(/[\s*|#>`]/g, "");
}

/**
 * 숫자 비교용: 꾸밈표는 지우되, 표의 칸 구분(|)과 띄어쓰기는 빈칸 하나로 남깁니다.
 * (칸 구분까지 지우면 "1,284,500 | 1,196,200"이 "1,284,5001,196,200"처럼 붙어 버림)
 */
export function numberSource(s: string): string {
  return s.replace(/[*#>`]/g, "").replace(/[|\s]+/g, " ");
}

/**
 * AI가 뽑은 숫자가 자료에 실제로 적혀 있는지 확인합니다. (자료는 numberSource로 정리한 글자)
 * "1284500"은 "1,284,500"으로, "60"(억 원)은 "60억"으로도 찾아봅니다. 마이너스는 부호를 떼고 찾습니다.
 */
export function numberAppears(n: number, sourceText: string, unit: "" | "억" = ""): boolean {
  const sourceSquashed = sourceText.replace(/(\d)\s+억/g, "$1억"); // "60 억"도 "60억"으로
  const abs = Math.abs(n);
  const forms = new Set([
    String(abs),
    abs.toLocaleString("en-US", { maximumFractionDigits: 4 }), // 1,284,500
  ]);
  for (const f of forms) {
    if (containsNumber(sourceSquashed, unit === "억" ? `${f}억` : f)) return true;
  }
  return false;
}

/** 숫자가 다른 숫자의 일부로만 들어 있는 경우(예: "84"가 "1,284,500" 안에)는 인정하지 않습니다. */
function containsNumber(source: string, form: string): boolean {
  let from = 0;
  while (true) {
    const i = source.indexOf(form, from);
    if (i === -1) return false;
    const before = source[i - 1] ?? "";
    const after = source[i + form.length] ?? "";
    if (!/[\d.,]/.test(before) && !/\d/.test(after) && !(after === "," && /\d/.test(source[i + form.length + 1] ?? ""))) {
      return true;
    }
    from = i + 1;
  }
}

/**
 * 의안 번호를 "제1호", "제2-1호" 모양으로 맞춥니다. 찾지 못하면 null.
 * AI가 "제2-1호 의안이 가결되는 경우에 한하여 상정"처럼 문장째 적어도 번호만 골라냅니다.
 */
export function normalizeAgendaNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.replace(/\s+/g, "").match(/제?(\d+)(?:[-－–](\d+))?호/);
  if (!m) return null;
  return m[2] ? `제${m[1]}-${m[2]}호` : `제${m[1]}호`;
}

// ───────────────────────── ② 정보 뽑기 ─────────────────────────

/** ② 정보 뽑기 결과 */
export type NoticeStep = {
  /** AI가 뽑고 코드가 검사·정리한 정보 (자료에 없는 숫자는 null로 바뀜) */
  info: NoticeInfo;
  /** 앱 공통 모양으로 바꾼 안건 목록 */
  agendas: Agenda[];
  /** 확인 필요 목록에 넣을 경고 */
  warnings: Warning[];
};

/**
 * ② 소집통지서 정보 뽑기 (PLAN 작업 12)
 * 1) AI가 정해진 모양으로 정보를 뽑습니다.
 * 2) 코드가 검사합니다: 회사 섞임, 안건 유무, 일시·장소·숫자가 원문에 있는지, 연결재무제표 여부
 */
export async function extractNotice(bundle: ExtractedBundle, fetchImpl?: FetchLike): Promise<NoticeStep> {
  const raw = await askAiJson(
    {
      system: NOTICE_SYSTEM,
      user: noticeUserPrompt(bundle.text),
      schema: noticeInfoSchema,
      schemaName: "notice_info",
    },
    fetchImpl,
  );
  const info: NoticeInfo = structuredClone(raw);
  const warnings: Warning[] = [];
  const source = squash(bundle.text); // 일시·장소 비교용
  const numbers = numberSource(bundle.text); // 숫자 비교용

  // 1) 여러 파일이면 서로 다른 회사가 섞였는지 확인
  if (bundle.files.length > 1) {
    const names = new Set(
      info.files
        .map((f) => f.companyName)
        .filter((n): n is string => !!n && n.trim() !== "")
        .map(normalizeCompanyName),
    );
    if (names.size > 1) throw new ReviewError("MIXED_COMPANY");
  }

  // 2) 안건이 하나도 없으면 소집통지서가 아닌 것으로 봄
  if (info.agendas.filter((a) => !a.isGroup).length === 0) throw new ReviewError("NO_AGENDA");

  // 3) 일시·장소가 원문에 그대로 있는지 (없으면 빈칸 + 확인 요청)
  for (const [key, label] of [
    ["meetingDateTime", "일시"],
    ["place", "장소"],
  ] as const) {
    const value = info[key].trim();
    if (value === "") {
      warnings.push({ kind: "담당자 확인 필요", message: `주주총회 ${label}을(를) 자료에서 찾지 못했습니다.` });
    } else if (!source.includes(squash(value))) {
      warnings.push({
        kind: "담당자 확인 필요",
        message: `주주총회 ${label}("${value}")이 자료의 글자와 달라 빈칸으로 두었습니다.`,
      });
      info[key] = "";
    }
  }

  // 숫자 하나를 원문과 대조하고, 없으면 null로 바꾸며 경고를 남기는 도우미
  const verify = (n: number | null, where: string, agendaNumber?: string, unit: "" | "억" = ""): number | null => {
    if (n === null) return null;
    if (numberAppears(n, numbers, unit)) return n;
    warnings.push({
      kind: "숫자 불일치",
      agendaNumber,
      message: `${where} 값(${n.toLocaleString("ko-KR")}${unit})이 자료에 없어 빈칸으로 두었습니다.`,
    });
    return null;
  };

  // 4) 통지서의 소유주식수·발행주식총수
  info.ownedShares = verify(info.ownedShares, "소유주식수");
  info.totalShares = verify(info.totalShares, "발행주식총수");

  // 5) 재무표: 연결재무제표는 쓰지 않음 (PRD: 별도만 기준, 표시 없는 표는 별도로 봄)
  const finAgenda = info.agendas.find((a) => a.type === "재무제표·이익배당 승인")?.number;
  if (info.financials?.label === "연결") {
    warnings.push({
      kind: "담당자 확인 필요",
      agendaNumber: finAgenda,
      message: "자료에 연결재무제표만 있어 재무 변동표를 만들지 않았습니다. 별도재무제표를 확인해 주세요.",
    });
    info.financials = null;
  } else if (info.financials) {
    for (const row of info.financials.rows) {
      row.current = verify(row.current, `재무표 ${row.item}(당기)`, finAgenda);
      row.previous = verify(row.previous, `재무표 ${row.item}(전기)`, finAgenda);
    }
  }

  // 6) 배당
  if (info.dividend) {
    info.dividend.currentPerShare = verify(info.dividend.currentPerShare, "당기 주당배당금", finAgenda);
    info.dividend.previousPerShare = verify(info.dividend.previousPerShare, "전기 주당배당금", finAgenda);
  }

  // 7) 보수한도 (억 원)
  for (const p of info.payLimits) {
    p.current = verify(p.current, `${p.target} 보수한도(당기)`, p.agendaNumber, "억");
    p.previous = verify(p.previous, `${p.target} 보수한도(전기)`, p.agendaNumber, "억");
  }

  // 8) 앱 공통 안건 모양으로 바꾸기 (의안 번호는 코드가 모양을 맞춤)
  const agendas: Agenda[] = info.agendas.map((a) => {
    const parent = normalizeAgendaNumber(a.parentNumber);
    const condition = normalizeAgendaNumber(a.conditionNumber);
    return {
      number: normalizeAgendaNumber(a.number) ?? a.number,
      title: a.title,
      type: a.isGroup ? null : (a.type ?? "그 밖의 안건"),
      content: a.content,
      isGroup: a.isGroup,
      ...(parent ? { parentNumber: parent } : {}),
      ...(condition ? { conditionNumber: condition } : {}),
    };
  });
  // 보수한도·후보자가 가리키는 의안 번호도 같은 모양으로
  for (const p of info.payLimits) p.agendaNumber = normalizeAgendaNumber(p.agendaNumber) ?? p.agendaNumber;
  for (const c of info.candidates) c.agendaNumber = normalizeAgendaNumber(c.agendaNumber) ?? c.agendaNumber;

  return { info, agendas, warnings };
}

// ───────────────────────── 개요표 만들기 (PLAN 작업 13) ─────────────────────────

/** 개요표 만들기 결과 */
export type OverviewStep = {
  overview: Overview;
  /** 보유주식 명세표에서 찾은 이 회사의 줄 (없으면 null) */
  holding: Holding | null;
  /** 이해관계인 지분 2/3 이상이라 불참 판정된 회사인지 */
  isAbsenceCompany: boolean;
  /** 확인 필요 목록에 넣을 경고 */
  warnings: Warning[];
};

/**
 * 보고서 맨 앞의 주주총회 개요표를 만듭니다. (PRD 5장 must 2, PLAN 작업 13)
 * - 일시·장소·부의안건: ② 정보 뽑기 결과에서 (하위 안건은 들여 쓰기 표시)
 * - 보유지분율(수량): 앱에 탑재된 보유주식 명세표에서. 명세표에 없으면 빈칸 + "담당자 확인 필요"
 * - 통지서의 소유주식수·발행주식총수가 명세표와 다르면 "소유주식수 불일치" 경고
 * - 참석여부·불참사유: 불참 판정 회사면 "불참" + 정해진 틀의 불참사유
 *   그 밖의 회사는 안건 의견이 정해진 뒤(작업 16) 다시 판정하므로, opinions를 주면 그 결과로 판정
 */
export function buildOverview(
  notice: NoticeStep,
  holdings: Holding[],
  opinions: Opinion[] = [],
): OverviewStep {
  const warnings: Warning[] = [];
  const { info, agendas } = notice;

  const holding = findHolding(holdings, info.companyName);
  if (!holding) {
    warnings.push({
      kind: "담당자 확인 필요",
      message: `보유주식 명세표에서 "${info.companyName}"을(를) 찾지 못해 보유지분율과 불참 여부를 정하지 못했습니다.`,
    });
  } else {
    // 통지서에 적힌 주식 수와 명세표의 주식 수가 다르면 알려 줌
    const pairs: [number | null, number, string][] = [
      [info.ownedShares, holding.ourShares, "당사 소유주식수"],
      [info.totalShares, holding.totalShares, "발행주식총수"],
    ];
    for (const [inNotice, inTable, label] of pairs) {
      if (inNotice !== null && inNotice !== inTable) {
        warnings.push({
          kind: "소유주식수 불일치",
          message: `${label}가 소집통지서(${inNotice.toLocaleString("ko-KR")}주)와 보유주식 명세표(${inTable.toLocaleString("ko-KR")}주)에서 다릅니다.`,
        });
      }
    }
  }

  const absent = holding !== null && isAbsenceCompany(holding);
  const attendance = absent ? "불참" : decideAttendance(opinions);

  const overview: Overview = {
    dateTime: info.meetingDateTime,
    place: info.place,
    agendaLines: agendas.map((a) => ({ number: a.number, title: a.title, isSub: !!a.parentNumber })),
    ownership: holding ? { ratio: holding.ourRatio, shares: holding.ourShares } : null,
    attendance,
    absenceReason: attendance === "불참" && holding ? absenceReason(holding) : "-",
  };

  return { overview, holding, isAbsenceCompany: absent, warnings };
}
