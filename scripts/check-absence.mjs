// 불참 판정 함수(lib/calc.ts의 작업 7 부분)가 맞는지 확인하는 스크립트입니다. (PLAN 작업 7)
// 실행: npm run check:absence
// 실제 탑재된 보유주식 명세표로 5개사를 판정하고, 경계값과 불참 문장도 확인합니다.

import { absenceOpinionReason, absenceReason, isAbsenceCompany } from "../lib/calc.ts";
import { findHolding, loadHoldings } from "../lib/holdings.ts";

let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const ok = a === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} ${label}: ${a}${ok ? "" : ` (기대값: ${JSON.stringify(expected)})`}`);
}

// 1) 가상 5개사 판정: 새봄바이오텍(이해관계인 69.0%)만 불참
console.log("[1] 가상 5개사 불참 판정 (기준: 이해관계인 2/3 이상)");
const holdings = await loadHoldings();
const expected = {
  가온정밀: false,
  푸른해물산: false,
  새봄바이오텍: true,
  다온건설: false,
  미래로통신: false,
};
for (const [name, absent] of Object.entries(expected)) {
  const h = findHolding(holdings, name);
  check(`${name} (이해관계인 ${h.relatedRatio}%)`, isAbsenceCompany(h), absent);
}

// 2) 경계값: 정확히 2/3이면 불참, 1주라도 모자라면 참석
console.log("\n[2] 경계값");
const make = (relatedShares, totalShares) => ({
  companyName: "시험회사",
  totalShares,
  ourShares: 100,
  ourRatio: 1,
  relatedPartyName: "시험㈜",
  relatedShares,
  relatedRatio: (relatedShares / totalShares) * 100,
  baseDate: "2026-12-31",
});
check("정확히 2/3 (2주/3주)", isAbsenceCompany(make(2, 3)), true);
check("66.67% (6,667주/10,000주)", isAbsenceCompany(make(6667, 10000)), true);
check("66.66% (6,666주/10,000주)", isAbsenceCompany(make(6666, 10000)), false);
check("발행주식 0주면 판정하지 않음", isAbsenceCompany(make(0, 0)), false);

// 3) 불참 문장 (정해진 틀)
console.log("\n[3] 불참 문장");
const saebom = findHolding(holdings, "주식회사 새봄바이오텍");

const overview = absenceReason(saebom);
console.log(`  개요표 불참사유: ${overview}`);
check("이해관계인 이름이 들어 있음", overview.includes("새봄제약㈜ 외 특수관계인 4인"), true);
check("이해관계인 주식수·지분율", overview.includes("31,050,000주(69.0%)"), true);
check("당사 지분율", overview.includes("당사 지분(0.3%)"), true);
check("'영향을 미치지 못함' 문구", overview.includes("결과에 영향을 미치지 못함"), true);

const agenda = absenceOpinionReason(saebom, "찬성", "외부감사인의 감사의견이 적정이므로 재무제표 승인");
console.log(`  안건 사유(찬성 판단): ${agenda}`);
check("가이드라인 기준 판단이 앞에 옴 (개조식 \"- \"로 시작)", agenda.startsWith("- 의결권 행사기준 판단: 외부감사인의"), true);
check("판단 종류 표시", agenda.includes("(찬성 사유)"), true);
check("결론 불참으로 끝남", agenda.endsWith("- 결론: 불참"), true);
check("항목 4개가 줄바꿈으로 나뉨", agenda.split("\n").length, 4);
check("모든 줄이 \"- \"로 시작", agenda.split("\n").every((l) => l.startsWith("- ")), true);
check("영향을 미치지 못함 문구", agenda.includes("결과에 영향을 미치지 못함"), true);
check("500자 이내", agenda.length <= 500, true);

const hold = absenceOpinionReason(saebom, "판단 보류", "");
console.log(`  안건 사유(판단 보류): ${hold}`);
check("판단 보류면 담당자 확인 표시", hold.includes("담당자 확인 필요"), true);
check("판단 보류여도 결론 불참으로 끝남", hold.endsWith("- 결론: 불참"), true);

console.log(failed === 0 ? "\n모두 통과했습니다." : `\n${failed}개가 틀렸습니다.`);
process.exitCode = failed === 0 ? 0 : 1;
