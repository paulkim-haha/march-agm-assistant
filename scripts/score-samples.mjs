// 가상 5개사 자료를 실제 검토(AI 포함)로 돌려 채점표 기준과 맞는지 채점하는 스크립트입니다. (PLAN 작업 21)
//
// 실행: npm run score:live                 → 시나리오 8개 전부 (AI를 여러 번 불러 6~8분쯤 걸림)
//       npm run score:live -- 02 04         → 고른 시나리오만 (01·02·03·04·05·06·06a·mixed)
//
// ⚠ 채점표 파일(sample-data/00_시나리오_안내_업로드금지.md)은 이 스크립트도 읽지 않습니다.
//   아래 EXPECT의 정답은 사람이 채점표를 보고 옮겨 적은 것입니다. (AI 요청에 정답이 섞이지 않게)

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ReviewError } from "../lib/extract-text.ts";
import { runReview } from "../lib/review.ts";

process.loadEnvFile(".env");

// ───────────────────────── 채점표에서 옮겨 적은 정답 ─────────────────────────

/** 재무 변동: [항목, 증감액, 증감률] (별도재무제표, 백만 원) */
const FIN = {
  가온정밀: [["매출액", 17100, 10.3], ["영업이익", 1870, 14.4], ["당기순이익", 1150, 12.2], ["자산총계", 17500, 7.6]],
  푸른해물산: [["매출액", -46300, -10.1], ["영업이익", -13330, -61.8], ["당기순이익", -11770, -79.1], ["자산총계", -12800, -3.2]],
  다온건설: [["매출액", 88300, 7.4], ["영업이익", 4620, 8.0], ["당기순이익", 1180, 3.0], ["자산총계", 63500, 4.0]],
  미래로통신: [["매출액", 18500, 23.6], ["영업이익", 3520, 41.9], ["당기순이익", 2520, 41.2], ["자산총계", 20700, 17.0]],
};

/** 다온건설 정답 (04와 06a+06b가 같아야 함) */
const DAON = {
  company: "다온건설",
  attendance: "참석",
  ownership: [12.0, 3600000],
  fin: FIN.다온건설,
  agendas: {
    "제2-1호": { opinion: "반대", clauses: ["3.3.1)", "3.1.2)", "3.3 표"] }, // 2-4: 6년 재직·출석률 72%·겸직 2곳
    "제2-2호": { clauses: ["3.3.1)"], managerChecks: true }, // 2-5: 최지안 담당자 판단 필요 사항
    "제3호": { opinion: "반대", clauses: ["3.6.2)"] }, // 2-4: 감사위원 박정우도 반대
    "제4호": { flag: "적정성 추가 검토 필요" }, // 2-2: 45억 → 60억 (+33.3%) vs 영업이익 +8.0%
  },
};

const SCENARIOS = {
  "01": {
    files: ["01_가온정밀_소집통지서.md"],
    company: "가온정밀",
    attendance: "참석",
    ownership: [18.0, 1800000],
    fin: FIN.가온정밀,
    allOpinion: "찬성", // 기본 정상 사례
    agendas: { "제3호": { flag: null } }, // 2-3: 이사 보수한도 동결 → 경고 없음
  },
  "02": {
    files: ["02_푸른해물산_소집통지서.md"],
    company: "푸른해물산",
    attendance: "참석",
    ownership: [25.0, 5000000],
    fin: FIN.푸른해물산,
    agendas: {
      "제1호": { clauses: ["1.1.1)", "1.2.1)"] },
      "제2호": { clauses: ["2.8.1)", "2.14.1)"] }, // 2-7
      "제3호": { clauses: ["4.1.1)"], flag: "적정성 추가 검토 필요" }, // 2-2: 40억 → 50억 vs 실적 감소
    },
  },
  "03": {
    files: ["03_새봄바이오텍_소집통지서.md"],
    company: "새봄바이오텍",
    attendance: "불참",
    ownership: [0.3, 135000],
    allOpinion: "불참",
    absence: ["69.0%", "0.3%", "영향"], // 2-1: 이해관계인 지분율·당사 지분율·"결과에 영향을 미치지 못함"
    agendas: { "제1호": { clauses: ["1.1.1)"] }, "제3호": { clauses: ["4.1.1)"] } },
  },
  "04": { files: ["04_다온건설_소집통지서.md"], ...DAON },
  "05": {
    files: ["05_미래로통신_소집통지서.md"],
    company: "미래로통신",
    attendance: "참석",
    ownership: [30.0, 2400000],
    fin: FIN.미래로통신,
    agendas: {
      "제2호": { notOpinion: "반대", clauses: ["2.2.1)"] }, // 2-6: 전자주총 병행 방식 → 2.6.2) 해당 없음
      "제3호": { notOpinion: "반대", clauses: ["5.1.2)"] }, // 2-6: 스톡옵션 2.0%는 "초과" 아님
      "제4호": { flag: null }, // 2-3: 보수한도 +25.0% < 영업이익 +41.9%
      "제5호": { flag: null }, // 2-3: 감사 보수한도 동결
    },
  },
  "06": { files: ["06a_다온건설_소집통지서_본문.md", "06b_다온건설_안건설명서.md"], ...DAON },
  "06a": {
    files: ["06a_다온건설_소집통지서_본문.md"],
    company: "다온건설",
    noFinancials: true, // 세부내용이 없으니 재무표는 "담당자 확인 필요"
    agendas: { "제4호": { flagStartsWith: "판단 불가" } },
  },
  mixed: { files: ["06b_다온건설_안건설명서.md", "01_가온정밀_소집통지서.md"], error: "MIXED_COMPANY" },
};

// ───────────────────────── 채점 ─────────────────────────

const score = { pass: 0, fail: 0 };
const clauseScore = { hit: 0, total: 0 }; // 2-8: 안건 단위 근거 조항 일치율
const failures = [];

function check(scenario, label, ok, detail) {
  if (ok) score.pass++;
  else score.fail++;
  if (!ok) failures.push(`[${scenario}] ${label}: ${detail}`);
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? `: ${detail}` : ""}`);
}

async function load(names) {
  return Promise.all(names.map(async (name) => ({ name, bytes: new Uint8Array(await readFile(path.join("sample-data", name))) })));
}

async function scoreScenario(key, ex) {
  console.log(`\n■ ${key}: ${ex.files.join(" + ")}`);
  let result;
  try {
    result = await runReview(await load(ex.files));
  } catch (e) {
    if (ex.error) return check(key, `오류 안내 ${ex.error}`, e instanceof ReviewError && e.code === ex.error, e.code ?? String(e));
    return check(key, "검토 완료", false, String(e?.code ?? e));
  }
  if (ex.error) return check(key, `오류 안내 ${ex.error}`, false, "오류 없이 보고서가 나옴");

  const { report, timings } = result;
  const { overview, reviews, financials, warnings } = report;
  console.log(`  (${(timings.total / 1000).toFixed(1)}초, 경고 ${warnings.length}건)`);

  check(key, "회사 이름", report.companyName === ex.company, report.companyName);
  if (ex.attendance) check(key, "참석여부", overview.attendance === ex.attendance, overview.attendance);
  if (ex.ownership) {
    const [ratio, shares] = ex.ownership;
    check(key, "보유지분율·수량", overview.ownership?.ratio === ratio && overview.ownership?.shares === shares, JSON.stringify(overview.ownership));
  }
  for (const [item, change, rate] of ex.fin ?? []) {
    const row = financials.find((r) => r.item === item);
    check(key, `재무 ${item}`, row?.change === change && row?.changeRate === rate, `${row?.change} (${row?.changeRate}%)`);
  }
  if (ex.noFinancials) check(key, "재무표 없음", financials.every((r) => r.current === null), `${financials.filter((r) => r.current !== null).length}줄 있음`);
  if (ex.allOpinion) {
    const wrong = reviews.filter((r) => r.opinion !== ex.allOpinion);
    check(key, `모든 안건 ${ex.allOpinion}`, wrong.length === 0, wrong.map((r) => `${r.agenda.number} ${r.opinion}`).join(", "));
  }
  if (ex.absence) {
    const missing = ex.absence.filter((w) => !overview.absenceReason.includes(w));
    check(key, "불참사유 문구", missing.length === 0, missing.length ? `없음: ${missing.join(", ")}` : "");
    const noJudge = reviews.filter((r) => r.guidelineJudgment === "판단 보류" || r.clauses.length === 0);
    check(key, "불참이어도 안건마다 기준 판단·근거", noJudge.length === 0, noJudge.map((r) => r.agenda.number).join(", "));
  }

  for (const [num, a] of Object.entries(ex.agendas ?? {})) {
    const r = reviews.find((x) => x.agenda.number === num);
    if (!r) {
      check(key, `${num} 있음`, false, "안건을 못 찾음");
      continue;
    }
    const ids = r.clauses.map((c) => c.id);
    if (a.opinion) check(key, `${num} 의견 ${a.opinion}`, r.opinion === a.opinion, r.opinion);
    if (a.notOpinion) check(key, `${num} ${a.notOpinion} 아님`, r.opinion !== a.notOpinion, r.opinion);
    if (a.clauses) {
      const missing = a.clauses.filter((c) => !ids.includes(c));
      clauseScore.total++;
      if (missing.length === 0) clauseScore.hit++;
      check(key, `${num} 근거 ${a.clauses.join("·")}`, missing.length === 0, `실제 ${ids.join(", ") || "-"}`);
    }
    if (a.flag !== undefined) check(key, `${num} 보수한도 경고 ${a.flag ?? "없음"}`, (r.payLimit?.flag ?? null) === a.flag, r.payLimit?.flag ?? "없음");
    if (a.flagStartsWith) check(key, `${num} 보수한도 ${a.flagStartsWith}`, (r.payLimit?.flag ?? "").startsWith(a.flagStartsWith), r.payLimit?.flag ?? "없음");
    if (a.managerChecks) check(key, `${num} 담당자 판단 필요 사항`, r.managerChecks.length > 0, `${r.managerChecks.length}개`);
  }

  // 공통 확인: 근거 3개 이하, 사유 500자 이하
  const tooMany = reviews.filter((r) => r.clauses.length > 3);
  check(key, "근거 조항 안건당 3개 이하", tooMany.length === 0, tooMany.map((r) => r.agenda.number).join(", "));
  const tooLong = reviews.filter((r) => r.reason.length > 500);
  check(key, "사유 500자 이하", tooLong.length === 0, tooLong.map((r) => `${r.agenda.number} ${r.reason.length}자`).join(", "));

  // 경고 양을 보기 위한 요약 (채점에는 넣지 않음)
  const byKind = {};
  for (const w of warnings) byKind[w.kind] = (byKind[w.kind] ?? 0) + 1;
  console.log(`  경고 종류: ${JSON.stringify(byKind)}`);
  for (const r of reviews) {
    console.log(`  · ${r.agenda.number} ${r.opinion} [${r.clauses.map((c) => c.id).join(", ")}] 담당자 판단 ${r.managerChecks.length}개`);
    if (process.argv.includes("--reason")) console.log(`      사유: ${r.reason}`);
  }
}

const picked = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const keys = picked.length ? picked : Object.keys(SCENARIOS);
for (const key of keys) {
  if (!SCENARIOS[key]) {
    console.log(`\n알 수 없는 시나리오: ${key} (고를 수 있는 것: ${Object.keys(SCENARIOS).join(", ")})`);
    continue;
  }
  await scoreScenario(key, SCENARIOS[key]);
}

console.log("\n═══════════ 채점 결과 ═══════════");
console.log(`항목: ${score.pass}개 맞음 / ${score.fail}개 틀림`);
if (clauseScore.total) {
  const rate = (clauseScore.hit / clauseScore.total) * 100;
  console.log(`근거 조항 일치율 (안건 단위, 목표 90% 이상): ${clauseScore.hit}/${clauseScore.total} = ${rate.toFixed(1)}%`);
}
for (const f of failures) console.log(`❌ ${f}`);
process.exitCode = score.fail === 0 ? 0 : 1;
