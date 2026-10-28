// 의견을 바꾼 뒤 다시 판정하기(lib/calc.ts의 reapplyOpinions)가 맞는지 확인하는 스크립트입니다. (PLAN 작업 19)
// 실행: npm run check:reapply   (AI를 부르지 않아 바로 끝남)

import { MANUAL_ABSENCE_REASON, reapplyOpinions } from "../lib/calc.ts";

let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const ok = a === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} ${label}: ${a}${ok ? "" : ` (기대값: ${JSON.stringify(expected)})`}`);
}

const review = (number, opinion, extra = {}) => ({
  agenda: { number, title: `${number} 안건`, type: "그 밖의 안건", content: "", isGroup: false, ...extra },
  opinion,
  guidelineJudgment: opinion === "판단 보류" ? "판단 보류" : opinion,
  reason: "사유",
  clauses: [],
  managerChecks: [],
});

// 다온건설과 비슷한 보고서: 제2-1호 반대 → 제3호(조건부) 경고, 제4호는 판단 보류
const base = {
  companyName: "다온건설",
  isAbsenceCompany: false,
  overview: { dateTime: "", place: "", agendaLines: [], ownership: null, attendance: "판정 대기", absenceReason: "-" },
  reviews: [
    review("제1호", "찬성"),
    review("제2-1호", "반대"),
    review("제3호", "반대", { conditionNumber: "제2-1호" }),
    review("제4호", "판단 보류"),
  ],
  financials: [],
  warnings: [
    { kind: "판단 보류", agendaNumber: "제4호", message: "제4호: 조항을 찾지 못했습니다." },
    { kind: "조건부 안건", agendaNumber: "제3호", message: "옛 조건부 경고" },
    { kind: "적정성 추가 검토 필요", agendaNumber: "제4호", message: "제4호: 적정성 추가 검토 필요" },
  ],
};
const kinds = (r) => r.warnings.map((w) => `${w.kind}:${w.agendaNumber}`);

console.log("[1] 아무것도 안 바꿨을 때");
const r0 = reapplyOpinions(base, {});
check("판단 보류가 남아 있어 판정 대기", r0.overview.attendance, "판정 대기");
check("경고 그대로 (조건부 경고는 새로 만듦)", kinds(r0), ["판단 보류:제4호", "적정성 추가 검토 필요:제4호", "조건부 안건:제3호"]);

console.log("\n[2] 판단 보류 안건(제4호)의 의견을 정함");
const r1 = reapplyOpinions(base, { 제4호: "찬성" });
check("참석여부가 참석으로", r1.overview.attendance, "참석");
check("제4호 판단 보류 경고는 사라짐 (다른 경고는 남음)", kinds(r1), ["적정성 추가 검토 필요:제4호", "조건부 안건:제3호"]);
check("의견만 바뀌고 사유는 그대로", [r1.reviews[3].opinion, r1.reviews[3].reason], ["찬성", "사유"]);

console.log("\n[3] 조건이 된 안건(제2-1호)을 찬성으로 바꿈");
const r2 = reapplyOpinions(base, { 제4호: "찬성", "제2-1호": "찬성" });
check("조건부 안건 경고가 사라짐", kinds(r2).includes("조건부 안건:제3호"), false);
const r3 = reapplyOpinions(base, { 제4호: "찬성", "제2-1호": "찬성", 제3호: "찬성" });
check("다시 반대로 바꾸면 경고가 돌아옴", kinds(reapplyOpinions(base, { 제4호: "찬성", "제2-1호": "반대" })).includes("조건부 안건:제3호"), true);
check("모두 찬성이면 참석", r3.overview.attendance, "참석");

console.log("\n[4] 불참");
const allAbsent = { 제1호: "불참", "제2-1호": "불참", 제3호: "불참", 제4호: "불참" };
const r4 = reapplyOpinions(base, allAbsent);
check("담당자가 모두 불참으로 정하면 불참", r4.overview.attendance, "불참");
check("불참사유는 담당자 확인 안내", r4.overview.absenceReason, MANUAL_ABSENCE_REASON);

const absenceBase = {
  ...base,
  isAbsenceCompany: true,
  overview: { ...base.overview, attendance: "불참", absenceReason: "이해관계인이 69.0%를 보유하고 있어 …" },
  reviews: base.reviews.map((r) => ({ ...r, opinion: "불참" })),
  warnings: [],
};
check("불참 판정 회사는 처음 불참사유를 그대로", reapplyOpinions(absenceBase, {}).overview.absenceReason, "이해관계인이 69.0%를 보유하고 있어 …");
const r5 = reapplyOpinions(absenceBase, { 제1호: "찬성" });
check("불참 회사라도 담당자가 찬성을 고르면 참석", [r5.overview.attendance, r5.overview.absenceReason], ["참석", "-"]);

console.log("\n[5] 처음 보고서는 바뀌지 않음");
check("처음 보고서의 제4호 의견", base.reviews[3].opinion, "판단 보류");
check("처음 보고서의 경고 수", base.warnings.length, 3);

console.log(failed === 0 ? "\n모두 통과했습니다." : `\n${failed}개가 틀렸습니다.`);
process.exitCode = failed === 0 ? 0 : 1;
