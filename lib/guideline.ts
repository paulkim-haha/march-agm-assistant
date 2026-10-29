// 앱에 탑재된 가이드라인 조항 데이터(data/guideline.json)를 다루는 파일입니다. (PLAN 작업 5)
// 1) 조항 번호로 원문 찾기  2) AI가 말한 번호가 실제로 있는지 검사하기
// 3) 안건 유형에 맞는 장의 조항만 골라 주기 (DESIGN.md 3장 연결표)

import { readFile } from "node:fs/promises";
import path from "node:path";
import { DataMissingError } from "./holdings.ts";
import { RULES, type AgendaType, type CitedClause, type GuidelineClause } from "./types.ts";

/** 조항 데이터 파일 위치 (app1 폴더 기준) */
export const GUIDELINE_FILE = path.join(process.cwd(), "data", "guideline.json");

/** 앱에 탑재된 가이드라인 조항 전체를 읽습니다. */
export async function loadGuideline(): Promise<GuidelineClause[]> {
  let text: string;
  try {
    text = await readFile(GUIDELINE_FILE, "utf8");
  } catch {
    throw new DataMissingError(
      "가이드라인 조항 데이터(data/guideline.json)를 찾지 못했습니다. npm run build:guideline을 먼저 실행해 주세요.",
    );
  }
  let clauses: GuidelineClause[];
  try {
    clauses = JSON.parse(text) as GuidelineClause[];
  } catch {
    // 파일이 망가진 경우도 "탑재 자료 없음"으로 안내 (갭 분석 M-6)
    throw new DataMissingError("가이드라인 조항 데이터(data/guideline.json)를 읽지 못했습니다. npm run build:guideline을 다시 실행해 주세요.");
  }
  if (!Array.isArray(clauses) || clauses.length === 0) {
    throw new DataMissingError("가이드라인 조항 데이터가 비어 있습니다.");
  }
  return clauses;
}

/**
 * 조항 번호를 가이드라인에 적힌 모양으로 맞춥니다. 맞출 수 없으면 null.
 * AI가 "3.3.1", "제3.3.1)항", "3.3표"처럼 조금 다르게 말해도 "3.3.1)", "3.3 표"로 바꿔 줍니다.
 */
export function normalizeClauseId(raw: string): string | null {
  const s = raw.replace(/\s+/g, "").replace(/^제/, "").replace(/항$/, "");
  const table = s.match(/^(\d+\.\d+|사례[A-H])\.?표$/);
  if (table) return `${table[1].replace(/^사례/, "사례 ")} 표`;
  const clause = s.match(/^(\d+\.\d+\.\d+|[A-H]\.\d+)\)?$/);
  if (clause) return `${clause[1]})`;
  return null;
}

/** 조항 번호로 조항을 찾습니다. 없으면 null. */
export function findClause(clauses: GuidelineClause[], id: string): GuidelineClause | null {
  const key = normalizeClauseId(id);
  if (!key) return null;
  return clauses.find((c) => c.id === key) ?? null;
}

/** 보고서의 근거 박스에 넣을 모양(번호·소제목·원문)으로 바꿉니다. */
export function toCited(clause: GuidelineClause): CitedClause {
  return { id: clause.id, title: clause.title, body: clause.body };
}

/**
 * AI가 고른 조항 번호들을 검사합니다.
 * - 가이드라인에 실제로 있는 번호만 남기고(없는 번호는 removed로), 같은 번호는 한 번만 셉니다.
 * - 최대 3개까지만 남깁니다(넘치는 것도 removed로).
 * valid가 비어 있으면 그 안건은 "판단 보류"가 됩니다. (이 판단은 의견을 정하는 쪽에서 함)
 */
export function checkClauseIds(
  clauses: GuidelineClause[],
  ids: string[],
): { valid: CitedClause[]; removed: string[] } {
  const valid: CitedClause[] = [];
  const removed: string[] = [];
  for (const raw of ids) {
    const found = findClause(clauses, raw);
    if (!found) {
      removed.push(raw);
    } else if (valid.some((v) => v.id === found.id)) {
      continue; // 같은 조항을 두 번 말한 경우
    } else if (valid.length >= RULES.maxClauses) {
      removed.push(raw);
    } else {
      valid.push(toCited(found));
    }
  }
  return { valid, removed };
}

// 안건 유형 → AI에게 보여 줄 가이드라인 범위 (DESIGN.md 3장 연결표)
// chapters: 이 장 전체, extraSections: 다른 장에서 함께 볼 절(예: 보수한도는 2.25~2.27)
const SCOPE_BY_TYPE: Record<AgendaType, { chapters: number[]; extraSections?: string[] }> = {
  "재무제표·이익배당 승인": { chapters: [1] },
  "정관 변경": { chapters: [2] },
  "이사 선임": { chapters: [3] },
  "감사 선임": { chapters: [3] },
  "감사위원 선임": { chapters: [3] },
  "이사 보수한도": { chapters: [4], extraSections: ["2.25", "2.26", "2.27"] },
  "감사 보수한도": { chapters: [4] },
  "주식매수선택권": { chapters: [5] },
  "합병·분할·영업양수도": { chapters: [6] },
  "자본금·자기주식": { chapters: [7] },
  "그 밖의 안건": { chapters: [8] },
};

/** 조항 번호가 어느 절(예: "3.3.1)" → "3.3", "3.3 표" → "3.3")에 속하는지 */
function sectionOf(id: string): string {
  return id.replace(/ 표$/, "").split(".").slice(0, 2).join(".").replace(/\)$/, "");
}

/**
 * 정관 변경 안건의 글에 이 말이 있으면 반드시 근거에 넣을 조항 (갭 분석 I-2)
 * AI가 가끔 빠뜨리는 것을 코드로 보완합니다. 안건 글에 해당 조문이 있을 때만 넣고, 번호 검사는 쓰는 쪽(checkClauseIds)이 합니다.
 */
const AMENDMENT_RULES: { pattern: RegExp; clauseId: string }[] = [
  { pattern: /이사의\s*수|이사\s*수|이사회\s*규모/, clauseId: "2.14.1)" },
  { pattern: /배당\s*기준일/, clauseId: "2.8.1)" },
];

export function requiredAmendmentClauses(agenda: { type: AgendaType | null; title: string; content: string }): string[] {
  if (agenda.type !== "정관 변경") return [];
  const text = `${agenda.title} ${agenda.content}`;
  return AMENDMENT_RULES.filter((r) => r.pattern.test(text)).map((r) => r.clauseId);
}

/**
 * 글 속에 적힌 조항 번호를 모두 찾아 가이드라인 모양("3.3.1)", "3.3 표")으로 돌려줍니다. (갭 분석 M-2)
 * 날짜(2026.12.31))나 비율(2.0%)을 조항 번호로 착각하지 않도록, 앞에 숫자나 점이 붙은 것은 뺍니다.
 */
export function clauseIdsInText(text: string): string[] {
  const found = text.match(/(?<![\d.])\d{1,2}\.\d{1,2}\.\d{1,2}\)|(?<![\d.])\d{1,2}\.\d{1,2}\s?표/g) ?? [];
  return [...new Set(found.map((raw) => normalizeClauseId(raw)).filter((id): id is string => id !== null))];
}

/** 안건 유형의 조항 범위를 AI에게 보여 줄 글로 (예: "4장, 2.25·2.26·2.27절"). 유형을 모르면 "전체" (PLAN 작업 21) */
export function scopeText(type: AgendaType | null): string {
  if (!type) return "전체";
  const scope = SCOPE_BY_TYPE[type];
  const chapters = scope.chapters.map((c) => `${c}장`).join("·");
  return scope.extraSections?.length ? `${chapters}, ${scope.extraSections.join("·")}절` : chapters;
}

/**
 * 안건 유형에 맞는 조항만 골라 줍니다. (④ 조항 고르기에서 AI에게 보여 줄 범위)
 * 유형을 모르면(null) 전체를 돌려줍니다. "그 밖의 안건"에서 못 찾으면 쓰는 쪽이 allClauses로 다시 부릅니다.
 */
export function clausesForType(clauses: GuidelineClause[], type: AgendaType | null): GuidelineClause[] {
  if (!type) return clauses;
  const scope = SCOPE_BY_TYPE[type];
  return clauses.filter(
    (c) => scope.chapters.includes(c.chapter) || (scope.extraSections ?? []).includes(sectionOf(c.id)),
  );
}
