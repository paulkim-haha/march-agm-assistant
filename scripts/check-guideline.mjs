// 가이드라인 조항 찾기(lib/guideline.ts)가 제대로 되는지 확인하는 스크립트입니다. (PLAN 작업 5)
// 실행: npm run check:guideline
// 맞으면 ✅, 틀리면 ❌가 찍히고, 하나라도 틀리면 마지막에 실패로 끝납니다.

import {
  checkClauseIds,
  clausesForType,
  findClause,
  loadGuideline,
  normalizeClauseId,
} from "../lib/guideline.ts";

let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const ok = a === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} ${label}: ${a}${ok ? "" : ` (기대값: ${JSON.stringify(expected)})`}`);
}

const clauses = await loadGuideline();
console.log(`조항 ${clauses.length}개를 읽었습니다.`);

// 1) AI가 조금 다르게 말한 번호도 가이드라인 모양으로 맞추는지
console.log("\n[1] 조항 번호 맞추기");
check('"3.3.1"', normalizeClauseId("3.3.1"), "3.3.1)");
check('"3.3.1)"', normalizeClauseId("3.3.1)"), "3.3.1)");
check('"제5.1.2)항"', normalizeClauseId("제5.1.2)항"), "5.1.2)");
check('"3.3표"', normalizeClauseId("3.3표"), "3.3 표");
check('"3.3 표"', normalizeClauseId("3.3 표"), "3.3 표");
check('"A.1)"', normalizeClauseId("A.1)"), "A.1)");
check('"상법 제382조" (가이드라인 번호가 아님)', normalizeClauseId("상법 제382조"), null);

// 2) 번호로 원문 찾기 (근거 박스에 들어갈 내용)
console.log("\n[2] 번호로 원문 찾기");
const c512 = findClause(clauses, "5.1.2");
check("5.1.2) 소제목", c512?.title, "주식매수선택권(스톡옵션) 부여");
check("5.1.2) 원문에 '2%를 초과' 있음", c512?.body.includes("2%를 초과"), true);
check("3.3 표 찾기", findClause(clauses, "3.3표")?.id, "3.3 표");
check("없는 번호 9.9.9)", findClause(clauses, "9.9.9)"), null);

// 3) AI가 고른 번호 검사: 없는 번호는 지우고, 같은 번호는 한 번만, 최대 3개
console.log("\n[3] AI가 고른 번호 검사");
const r1 = checkClauseIds(clauses, ["3.3.1)", "3.1.2", "3.3 표"]);
check("박정우 예시: 남는 번호", r1.valid.map((v) => v.id), ["3.3.1)", "3.1.2)", "3.3 표"]);
check("박정우 예시: 지운 번호", r1.removed, []);
check("근거 박스에 원문이 들어 있음", r1.valid.every((v) => v.body.length > 0), true);

const r2 = checkClauseIds(clauses, ["9.9.9)", "3.3.1", "3.3.1)", "상법 제382조"]);
check("지어낸 번호 지우기: 남는 번호", r2.valid.map((v) => v.id), ["3.3.1)"]);
check("지어낸 번호 지우기: 지운 번호", r2.removed, ["9.9.9)", "상법 제382조"]);

const r3 = checkClauseIds(clauses, ["1.1.1)", "1.2.1)", "1.2.2)", "1.2.3)"]);
check("4개를 고르면 3개만 남김", r3.valid.length, 3);
check("넘친 번호", r3.removed, ["1.2.3)"]);

const r4 = checkClauseIds(clauses, ["없는조항"]);
check("남는 게 없으면 빈 목록 (→ 판단 보류)", r4.valid, []);

// 4) 안건 유형에 맞는 장만 골라 주기 (DESIGN.md 3장 연결표)
console.log("\n[4] 안건 유형별 조항 범위");
const ids = (type) => clausesForType(clauses, type).map((c) => c.id);
check("재무제표 → 모두 1장", clausesForType(clauses, "재무제표·이익배당 승인").every((c) => c.chapter === 1), true);
check("이사 선임 → 3.3 표 포함", ids("이사 선임").includes("3.3 표"), true);
check("이사 보수한도 → 4.1.1) 포함", ids("이사 보수한도").includes("4.1.1)"), true);
check("이사 보수한도 → 2.27.2) 포함", ids("이사 보수한도").includes("2.27.2)"), true);
check("이사 보수한도 → 2.24.1) 불포함", ids("이사 보수한도").includes("2.24.1)"), false);
check("감사 보수한도 → 2.27.2) 불포함", ids("감사 보수한도").includes("2.27.2)"), false);
check("주식매수선택권 → 5.1.2) 포함", ids("주식매수선택권").includes("5.1.2)"), true);
check("정관 변경 → 2.8.1)·2.14.1) 포함", ["2.8.1)", "2.14.1)"].every((id) => ids("정관 변경").includes(id)), true);
check("유형을 모르면 전체", clausesForType(clauses, null).length, clauses.length);

console.log(failed === 0 ? "\n모두 통과했습니다." : `\n${failed}개가 틀렸습니다.`);
process.exitCode = failed === 0 ? 0 : 1;
