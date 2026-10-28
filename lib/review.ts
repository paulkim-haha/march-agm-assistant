// 검토 단계(DESIGN.md 3장 ①~⑥)를 차례로 잇는 파일입니다.
// ② 정보 뽑기(PLAN 작업 12), 개요표 만들기(작업 13), ④ 조항 대조(작업 14), ⑤ 의견·사유(작업 15)와,
// 이 단계들을 한 번에 이어 보고서 1개를 만드는 runReview(작업 16)가 있습니다.

import { askAiJson, type FetchLike } from "./ai.ts";
import {
  absenceOpinionReason,
  absenceReason,
  buildDividend,
  buildFinancialTable,
  compareAuditorPayLimit,
  compareDirectorPayLimit,
  decideAttendance,
  isAbsenceCompany,
} from "./calc.ts";
import type { ExtractedBundle, UploadedFile } from "./extract-text.ts";
import { ReviewError, extractUploadTexts } from "./extract-text.ts";
import { checkClauseIds, clausesForType, loadGuideline } from "./guideline.ts";
import { DataMissingError, findHolding, loadHoldings, normalizeCompanyName } from "./holdings.ts";
import {
  CLAUSE_SYSTEM,
  NOTICE_SYSTEM,
  OPINION_SYSTEM,
  clauseMatchSchema,
  clauseUserPrompt,
  noticeInfoSchema,
  noticeUserPrompt,
  opinionSchema,
  opinionUserPrompt,
  shortenUserPrompt,
  type NoticeInfo,
  type OpinionAnswer,
} from "./prompts.ts";
import {
  RULES,
  type Agenda,
  type AgendaReview,
  type CitedClause,
  type Dividend,
  type FinancialRow,
  type GuidelineClause,
  type Holding,
  type Opinion,
  type Overview,
  type PayLimit,
  type Report,
  type Warning,
} from "./types.ts";

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
  /** 업로드 자료의 글자 전체 (뒤 단계에서 사유 속 숫자를 대조할 때 씀) */
  sourceText: string;
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

  return { info, agendas, warnings, sourceText: bundle.text };
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

// ───────────────────────── ④ 조항 대조 (PLAN 작업 14, must 1) ─────────────────────────

/** 안건 1개의 조항 대조 결과 */
export type AgendaClauses = {
  agendaNumber: string;
  /** 가이드라인에 실제로 있는 근거 조항 (최대 3개, 번호·소제목·원문 → 근거 박스) */
  clauses: CitedClause[];
  /** AI가 골랐지만 가이드라인에 없거나 3개를 넘어 코드가 뺀 번호 */
  removed: string[];
  /** AI가 밝힌 고른 이유 (사유 쓰기에 참고) */
  why: string;
};

/** ④ 조항 대조 결과 */
export type ClauseStep = {
  /** 의안 번호 → 조항 대조 결과 (상위 안건 제목줄은 빠짐) */
  byAgenda: Record<string, AgendaClauses>;
  /** 근거 조항이 하나도 없어 "판단 보류"가 될 안건의 경고 */
  warnings: Warning[];
};

/** 안건 판단에 참고할 사실(후보자 정보·보수한도·재무표·감사의견)을 한 줄로 모읍니다. */
function factsFor(agenda: Agenda, info: NoticeInfo): string {
  const facts: string[] = [];
  for (const c of info.candidates.filter((c) => c.agendaNumber === agenda.number)) {
    facts.push(`후보 ${c.name}(${c.role}): ${c.details}`);
  }
  for (const p of info.payLimits.filter((p) => p.agendaNumber === agenda.number)) {
    facts.push(`${p.target} 보수한도 당기 ${p.current ?? "?"}억 원, 전기 ${p.previous ?? "?"}억 원`);
  }
  if (agenda.type === "재무제표·이익배당 승인") {
    if (info.auditOpinion) facts.push(`외부감사인 감사의견: ${info.auditOpinion}`);
    if (info.dividend) {
      facts.push(`주당배당금 당기 ${info.dividend.currentPerShare ?? "?"}원, 전기 ${info.dividend.previousPerShare ?? "?"}원`);
    }
  }
  if (agenda.conditionNumber) facts.push(`${agenda.conditionNumber}이(가) 가결되는 경우에만 상정되는 안건`);
  // 재직 기간 같은 기간 기준을 따질 때 기준이 되는 날
  if (info.meetingDateTime) facts.push(`이번 주주총회 일시: ${info.meetingDateTime}`);
  return facts.join(" / ");
}

/**
 * ④ 안건마다 가이드라인 조항을 고릅니다. (PRD 5장 must 1)
 * - AI 1번 호출: 의견을 매길 안건 전부(불참 판정 회사도 똑같이)와, 그 유형에 맞는 장의 조항 목록을 함께 보냄
 *   ("그 밖의 안건"이 있으면 조항 전체를 보냄)
 * - 코드 검사: 가이드라인에 없는 번호는 지우고, 같은 번호는 한 번만, 최대 3개 (작업 5의 checkClauseIds)
 * - 남는 조항이 없으면 "판단 보류" 경고 → 의견 칸이 "판단 보류"가 됨 (작업 15)
 */
export async function matchClauses(
  notice: NoticeStep,
  guideline: GuidelineClause[],
  fetchImpl?: FetchLike,
): Promise<ClauseStep> {
  const targets = notice.agendas.filter((a) => !a.isGroup);

  // AI에게 보여 줄 조항 범위: 안건 유형별 범위를 합침 (DESIGN.md 3장 연결표)
  const needAll = targets.some((a) => a.type === null || a.type === "그 밖의 안건");
  const scoped = needAll
    ? guideline
    : guideline.filter((c) => targets.some((a) => clausesForType(guideline, a.type).includes(c)));

  const answer = await askAiJson(
    {
      system: CLAUSE_SYSTEM,
      user: clauseUserPrompt(
        targets.map((a) => ({
          number: a.number,
          title: a.title,
          type: a.type ?? "그 밖의 안건",
          content: a.content,
          facts: factsFor(a, notice.info),
        })),
        scoped,
      ),
      schema: clauseMatchSchema,
      schemaName: "clause_match",
    },
    fetchImpl,
  );

  const byAgenda: Record<string, AgendaClauses> = {};
  const warnings: Warning[] = [];
  for (const agenda of targets) {
    // AI가 의안 번호를 조금 다르게 적어도 찾을 수 있게 번호 모양을 맞춰 비교
    const match = answer.matches.find((m) => normalizeAgendaNumber(m.agendaNumber) === agenda.number);
    const { valid, removed } = checkClauseIds(guideline, match?.clauseIds ?? []);
    byAgenda[agenda.number] = { agendaNumber: agenda.number, clauses: valid, removed, why: match?.why ?? "" };
    if (valid.length === 0) {
      warnings.push({
        kind: "판단 보류",
        agendaNumber: agenda.number,
        message: `${agenda.number} ${agenda.title}: 맞는 가이드라인 조항을 찾지 못했습니다. 담당자가 판단해 주세요.`,
      });
    }
  }
  return { byAgenda, warnings };
}

// ───────────────────────── ⑤ 의견·사유 쓰기 (PLAN 작업 15, must 2) ─────────────────────────

/** ⑤ 의견·사유 쓰기 결과 */
export type OpinionStep = {
  /** 의견을 매긴 안건의 검토 결과 (상위 안건 제목줄은 빠짐, 의안 번호 순서) */
  reviews: AgendaReview[];
  /** 재무 변동표 (별도 기준, 재무표가 없으면 빈 배열) */
  financials: FinancialRow[];
  /** 주당배당금 비교 (배당 자료가 없으면 없음) */
  dividend?: Dividend;
  /** 확인 필요 목록에 넣을 경고 */
  warnings: Warning[];
};

/** 의견·사유 AI(큰 모델)를 기다리는 최대 시간. 시험에서 회사 1곳에 약 40~55초 걸려 넉넉히 잡음 */
const OPINION_TIMEOUT_MS = 90_000;

/** 숫자를 쉼표 넣어 보여 줍니다. (빈칸이면 "?") */
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "?" : n.toLocaleString("ko-KR"));
/** 증감률을 부호와 함께 보여 줍니다. (+7.4%) */
const pct = (n: number | null | undefined) => (n === null || n === undefined ? "?" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);

/** 재무 변동표를 AI에게 넘길 한 줄 글로 바꿉니다. */
function financialText(rows: FinancialRow[]): string {
  return rows
    .filter((r) => r.current !== null || r.previous !== null)
    .map((r) => {
      const rate = r.lossLabel && r.changeRate === null ? r.lossLabel : `${pct(r.changeRate)}${r.lossLabel ? `, ${r.lossLabel}` : ""}`;
      return `${r.item} ${fmt(r.previous)} → ${fmt(r.current)} (증감 ${r.change !== null && r.change > 0 ? "+" : ""}${fmt(r.change)}, ${rate})`;
    })
    .join("; ");
}

/** 보수한도 비교 결과를 AI에게 넘길 한 줄 글로 바꿉니다. */
function payLimitText(p: PayLimit): string {
  let s = `${p.target} 보수한도 ${fmt(p.previous)}억 원 → ${fmt(p.current)}억 원 (${pct(p.changeRate)})`;
  if (p.target === "이사") s += `, 영업이익 ${pct(p.operatingIncomeRate)}, 당기순이익 ${pct(p.netIncomeRate)}`;
  if (p.mixedDirection) s += ", 영업이익과 당기순이익의 방향이 엇갈림";
  s += p.flag ? ` → 표시: ${p.flag}` : " → 표시 없음";
  return s;
}

/**
 * 사유에 나온 숫자가 자료·조항·계산 결과 어딘가에 있는지 확인합니다. 없는 숫자 목록을 돌려줍니다.
 * 지어내면 문제가 되는 "금액·비율" 모양의 숫자만 봅니다: 쉼표가 있거나(1,284,500), 소수점이 있거나(33.3),
 * 네 자리 이상인 숫자. 연도(2027)·날짜(2027.3)와 작은 정수(3호, 6년, 75%)는 보지 않습니다.
 */
function unknownNumbers(reason: string, allowedText: string): string[] {
  const withoutDates = reason.replace(/(19|20)\d{2}[.년\-/]\s?\d{1,2}(?:[.월\-/]\s?\d{1,2})?/g, " ");
  const found = (withoutDates.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).filter((n) => {
    const plain = n.replace(/,/g, "");
    if (/^(19|20)\d{2}$/.test(plain)) return false; // 연도
    return n.includes(",") || n.includes(".") || plain.length >= 4;
  });
  return [...new Set(found)].filter((n) => {
    const plain = n.replace(/,/g, "");
    return !numberAppears(Number(plain), allowedText) && !allowedText.includes(n);
  });
}

/**
 * ⑤ 안건마다 의견과 사유 초안을 만듭니다. (PRD 5장 must 2)
 * - 코드가 먼저 계산: 재무 변동표·배당(작업 6), 보수한도 비교(작업 8)
 * - AI 1번 호출: 근거 조항이 있는 안건만 보냄 (조항이 없는 안건은 "판단 보류"로 담당자에게 넘김)
 *   이 단계만 큰 모델(.env의 OPENAI_MODEL_OPINION)을 씀. 500자 줄이기는 간단한 일이라 기본 모델을 씀
 *   AI는 찬성/반대만 고르고, 500자 이내 사유·판단 요지·담당자 판단 필요 사항을 씀
 * - 코드 검사
 *   · 500자 넘는 사유는 1번 다시 쓰게 하고, 그래도 넘으면 자르지 않고 "500자 초과" 경고
 *   · 사유 속 숫자가 자료·조항·계산 결과에 없으면 "숫자 불일치" 경고
 *   · 불참 판정 회사: 의견을 모두 "불참"으로 바꾸고, 정해진 틀의 불참 문장으로 사유를 만듦 (작업 7)
 *   · 조건이 된 안건이 반대면 딸린 안건에 "조건부 안건" 경고
 *   · 보수한도 표시(적정성 추가 검토 필요 등)는 경고로도 모음
 */
export async function writeOpinions(
  notice: NoticeStep,
  clauseStep: ClauseStep,
  overviewStep: OverviewStep,
  guideline: GuidelineClause[],
  fetchImpl?: FetchLike,
): Promise<OpinionStep> {
  const { info } = notice;
  const warnings: Warning[] = [];
  const targets = notice.agendas.filter((a) => !a.isGroup);

  // 1) 코드가 먼저 계산
  const financials = info.financials
    ? buildFinancialTable(Object.fromEntries(info.financials.rows.map((r) => [r.item, { current: r.current, previous: r.previous }])))
    : [];
  const dividend = info.dividend ? buildDividend(info.dividend.currentPerShare, info.dividend.previousPerShare) : undefined;
  const payByAgenda: Record<string, PayLimit> = {};
  for (const a of targets) {
    const p = info.payLimits.find((x) => x.agendaNumber === a.number);
    if (a.type === "이사 보수한도") payByAgenda[a.number] = compareDirectorPayLimit(p?.current ?? null, p?.previous ?? null, financials);
    if (a.type === "감사 보수한도") payByAgenda[a.number] = compareAuditorPayLimit(p?.current ?? null, p?.previous ?? null);
  }
  if (targets.some((a) => a.type === "재무제표·이익배당 승인") && financials.every((r) => r.current === null)) {
    warnings.push({ kind: "담당자 확인 필요", message: "재무표를 찾지 못해 재무 변동표를 만들지 못했습니다." });
  }

  // 안건마다 AI에게 줄 계산 결과 글
  const computedFor = (a: Agenda): string => {
    const parts: string[] = [];
    if (a.type === "재무제표·이익배당 승인") {
      if (financials.length) parts.push(`재무 변동(별도, 단위 백만 원): ${financialText(financials)}`);
      if (dividend) parts.push(`주당배당금 ${fmt(dividend.previousPerShare)}원 → ${fmt(dividend.currentPerShare)}원 (증감 ${fmt(dividend.change)}원)`);
    }
    if (payByAgenda[a.number]) parts.push(payLimitText(payByAgenda[a.number]));
    return parts.join(" / ");
  };

  // 2) AI 1번 호출 (근거 조항이 있는 안건만)
  const withClauses = targets.filter((a) => clauseStep.byAgenda[a.number]?.clauses.length);
  let answer: OpinionAnswer = { opinions: [] };
  if (withClauses.length) {
    answer = await askAiJson(
      {
        system: OPINION_SYSTEM,
        user: opinionUserPrompt(
          withClauses.map((a) => ({
            number: a.number,
            title: a.title,
            type: a.type ?? "그 밖의 안건",
            content: a.content,
            facts: factsFor(a, info),
            computed: computedFor(a),
            clauses: clauseStep.byAgenda[a.number].clauses,
          })),
        ),
        schema: opinionSchema,
        schemaName: "agenda_opinions",
        // 의견·사유는 기준 비교가 정확해야 해서 큰 모델(.env의 OPENAI_MODEL_OPINION)을 씁니다.
        // 큰 모델은 답이 느려 기다리는 시간을 늘립니다.
        modelEnv: "OPENAI_MODEL_OPINION",
        timeoutMs: OPINION_TIMEOUT_MS,
      },
      fetchImpl,
    );
  }
  const byNumber = new Map(answer.opinions.map((o) => [normalizeAgendaNumber(o.agendaNumber) ?? o.agendaNumber, o]));

  // 3) 500자를 넘은 사유는 1번 다시 쓰게 함 (불참 회사는 정해진 틀을 쓰므로 판단 요지만 쓰여 해당 없음)
  const tooLong = [...byNumber.entries()].filter(([, o]) => o.reason.length > RULES.maxReasonLength);
  if (tooLong.length && !overviewStep.isAbsenceCompany) {
    const retry = await askAiJson(
      {
        system: OPINION_SYSTEM,
        user: shortenUserPrompt(tooLong.map(([number, o]) => ({ number, reason: o.reason }))),
        schema: opinionSchema,
        schemaName: "agenda_opinions",
      },
      fetchImpl,
    );
    for (const o of retry.opinions) {
      const key = normalizeAgendaNumber(o.agendaNumber) ?? o.agendaNumber;
      const prev = byNumber.get(key);
      if (prev && o.reason.length < prev.reason.length) prev.reason = o.reason; // 판단은 그대로, 사유만 바꿈
    }
  }

  // 숫자 대조에 쓸 글: 자료 + 근거 조항 원문·번호 + 계산 결과
  const allowedText = numberSource(
    [
      notice.sourceText,
      ...guideline.map((c) => `${c.id} ${c.body}`),
      ...targets.map(computedFor),
      // 불참 문장에 코드가 넣는 명세표 숫자(이해관계인·당사 주식수와 지분율)
      overviewStep.holding
        ? [
            overviewStep.holding.ourRatio.toFixed(1),
            overviewStep.holding.relatedRatio.toFixed(1),
            overviewStep.holding.ourShares.toLocaleString("en-US"),
            overviewStep.holding.relatedShares.toLocaleString("en-US"),
          ].join(" ")
        : "",
    ].join("\n"),
  );

  // 4) 안건마다 결과 정리
  const reviews: AgendaReview[] = targets.map((agenda) => {
    const cited = clauseStep.byAgenda[agenda.number]?.clauses ?? [];
    const ai = cited.length ? byNumber.get(agenda.number) : undefined;
    const isElection = agenda.type === "이사 선임" || agenda.type === "감사 선임" || agenda.type === "감사위원 선임";

    let opinion: Opinion;
    let judgment: AgendaReview["guidelineJudgment"];
    let reason: string;
    if (!ai) {
      // 근거 조항이 없거나 AI가 답하지 않은 안건 → 담당자가 판단
      opinion = "판단 보류";
      judgment = "판단 보류";
      reason = "가이드라인에서 이 안건에 맞는 조항을 찾지 못해 판단을 보류합니다. 담당자가 의견을 정해 주세요.";
      if (cited.length) {
        warnings.push({ kind: "판단 보류", agendaNumber: agenda.number, message: `${agenda.number} ${agenda.title}: AI가 의견을 쓰지 않았습니다. 담당자가 판단해 주세요.` });
      }
    } else {
      opinion = ai.judgment;
      judgment = ai.judgment;
      reason = ai.reason.trim();
    }

    // 불참 판정 회사: 기준 판단은 남기고 의견은 불참, 사유는 정해진 틀 (PRD 5장)
    if (overviewStep.isAbsenceCompany && overviewStep.holding) {
      opinion = "불참";
      reason = absenceOpinionReason(overviewStep.holding, judgment, ai?.summary ?? "");
    }

    if (reason.length > RULES.maxReasonLength) {
      warnings.push({ kind: "500자 초과", agendaNumber: agenda.number, message: `${agenda.number}: 사유가 ${reason.length}자로 500자를 넘습니다. 줄여 주세요.` });
    }
    const unknown = ai ? unknownNumbers(reason, allowedText) : [];
    if (unknown.length) {
      warnings.push({
        kind: "숫자 불일치",
        agendaNumber: agenda.number,
        message: `${agenda.number}: 사유의 숫자(${unknown.join(", ")})를 자료·조항·계산 결과에서 찾지 못했습니다. 확인해 주세요.`,
      });
    }

    const pay = payByAgenda[agenda.number];
    if (pay?.flag) warnings.push({ kind: pay.flag.startsWith("판단 불가") ? "판단 불가" : pay.flag === "담당자 별도 검토 필요" ? "담당자 별도 검토 필요" : "적정성 추가 검토 필요", agendaNumber: agenda.number, message: `${agenda.number} ${agenda.title}: ${pay.flag}` });

    const managerChecks = isElection && ai ? ai.managerChecks.map((s) => s.trim()).filter(Boolean) : [];
    for (const m of managerChecks) {
      warnings.push({ kind: "담당자 확인 필요", agendaNumber: agenda.number, message: `${agenda.number} 담당자 판단 필요: ${m}` });
    }

    return {
      agenda,
      opinion,
      guidelineJudgment: judgment,
      reason,
      clauses: cited,
      managerChecks,
      ...(pay ? { payLimit: pay } : {}),
    };
  });

  // 5) 조건부 안건: 조건이 된 안건이 반대면 경고 (불참 회사는 모두 불참이라 해당 없음)
  for (const r of reviews) {
    const cond = r.agenda.conditionNumber;
    if (!cond) continue;
    const base = reviews.find((x) => x.agenda.number === cond);
    if (base?.opinion === "반대") {
      warnings.push({
        kind: "조건부 안건",
        agendaNumber: r.agenda.number,
        message: `${r.agenda.number}은(는) ${cond}이(가) 가결돼야 상정됩니다. ${cond}에 반대하므로 두 의견이 서로 맞는지 확인해 주세요.`,
      });
    }
  }

  return { reviews, financials, ...(dividend ? { dividend } : {}), warnings };
}

// ───────────────────────── ①~⑥ 한 번에 실행 (PLAN 작업 16) ─────────────────────────

/** 단계별 걸린 시간 (서버 기록용, 밀리초) */
export type ReviewTimings = Record<"read" | "notice" | "clauses" | "opinions" | "total", number>;

/**
 * 업로드 파일로 검토 전체를 실행해 보고서 1개를 만듭니다. (DESIGN.md 3장 ①~⑥)
 * ① 글자 뽑기 → ② 정보 뽑기(AI) → 개요표 → ④ 조항 대조(AI) → ⑤ 의견·사유(AI)
 * → ⑥ 의견으로 참석여부를 다시 판정하고, 단계마다 나온 경고를 모아 보고서로 조립
 * 문제가 있으면 ReviewError를 냅니다. (탑재 자료가 없으면 DATA_MISSING)
 */
export async function runReview(
  files: UploadedFile[],
  fetchImpl?: FetchLike,
): Promise<{ report: Report; timings: ReviewTimings }> {
  const t0 = Date.now();
  const mark = () => Date.now() - t0;

  // ① 글자 뽑기 (파일 문제는 AI를 부르기 전에 바로 안내)
  const bundle = await extractUploadTexts(files);

  // 앱에 탑재된 자료 읽기
  let holdings: Holding[];
  let guideline: GuidelineClause[];
  try {
    [holdings, guideline] = await Promise.all([loadHoldings(), loadGuideline()]);
  } catch (e) {
    if (e instanceof DataMissingError) {
      console.error(`[review] 탑재 자료 오류: ${e.message}`);
      throw new ReviewError("DATA_MISSING");
    }
    throw e;
  }
  const read = mark();

  // ② 정보 뽑기 + 개요표 (불참 판정 포함)
  const notice = await extractNotice(bundle, fetchImpl);
  const first = buildOverview(notice, holdings);
  const noticeDone = mark();

  // ④ 조항 대조
  const clauseStep = await matchClauses(notice, guideline, fetchImpl);
  const clausesDone = mark();

  // ⑤ 의견·사유
  const opinionStep = await writeOpinions(notice, clauseStep, first, guideline, fetchImpl);
  const opinionsDone = mark();

  // ⑥ 의견이 정해졌으니 참석여부를 다시 판정 (불참 회사는 그대로 불참)
  const final = buildOverview(
    notice,
    holdings,
    opinionStep.reviews.map((r) => r.opinion),
  );

  // 경고 모으기: 같은 문구는 한 번만, 회사 전체 경고 → 안건 경고(의안 번호 순) 순서
  const order = new Map(notice.agendas.map((a, i) => [a.number, i]));
  const seen = new Set<string>();
  const warnings = [...notice.warnings, ...final.warnings, ...clauseStep.warnings, ...opinionStep.warnings]
    .filter((w) => {
      const key = `${w.kind}|${w.agendaNumber ?? ""}|${w.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.agendaNumber ? order.get(a.agendaNumber) ?? 999 : -1) - (b.agendaNumber ? order.get(b.agendaNumber) ?? 999 : -1));

  const report: Report = {
    companyName: notice.info.companyName,
    isAbsenceCompany: final.isAbsenceCompany,
    overview: final.overview,
    reviews: opinionStep.reviews,
    financials: opinionStep.financials,
    ...(opinionStep.dividend ? { dividend: opinionStep.dividend } : {}),
    warnings,
  };
  return {
    report,
    timings: { read, notice: noticeDone - read, clauses: clausesDone - noticeDone, opinions: opinionsDone - clausesDone, total: mark() },
  };
}
