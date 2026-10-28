// 의견·사유 쓰기(lib/review.ts의 writeOpinions)가 맞는지 확인하는 스크립트입니다. (PLAN 작업 15)
//
// 실행 1) npm run check:opinions       → 가짜 AI 답으로 "코드 검사" 규칙 확인 (비용 없음)
// 실행 2) npm run check:opinions:live  → 진짜 AI로 4개사를 처음부터(정보 뽑기→조항→의견) 돌려 채점표와 비교 (AI 12번쯤)

import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractUploadTexts } from "../lib/extract-text.ts";
import { loadGuideline } from "../lib/guideline.ts";
import { loadHoldings } from "../lib/holdings.ts";
import { buildOverview, extractNotice, matchClauses, writeOpinions } from "../lib/review.ts";

let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const ok = a === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} ${label}: ${a}${ok ? "" : ` (기대값: ${JSON.stringify(expected)})`}`);
}
const guideline = await loadGuideline();
const holdings = await loadHoldings();
const sample = (f) => readFile(path.join("sample-data", f), "utf8");

/** 검토 결과를 보기 좋게 출력합니다. */
function show(reviews) {
  for (const r of reviews) {
    console.log(`  ${r.agenda.number} ${r.agenda.title}`);
    console.log(`    의견: ${r.opinion}  (기준 판단: ${r.guidelineJudgment})  근거: ${r.clauses.map((c) => c.id).join(", ") || "-"}`);
    console.log(`    사유(${r.reason.length}자): ${r.reason}`);
    if (r.payLimit) console.log(`    보수한도: ${r.payLimit.previous}억 → ${r.payLimit.current}억 (${r.payLimit.changeRate}%) ${r.payLimit.flag ?? ""}`);
    for (const m of r.managerChecks) console.log(`    담당자 판단 필요: ${m}`);
  }
}

if (!process.argv.includes("--live")) {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "test-model";
  /** 가짜 AI: 부를 때마다 다음 답을 돌려줌 */
  const fakeAi = (answers) => {
    let i = 0;
    const fn = async () => {
      const a = answers[Math.min(i++, answers.length - 1)];
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(a) } }] }), { status: 200 });
    };
    fn.count = () => i;
    return fn;
  };
  const ag = (number, title, type, extra = {}) => ({ number, title, type, content: "", isGroup: false, ...extra });
  const cite = (...ids) => ids.map((id) => guideline.find((c) => c.id === id));

  // 다온건설 자료를 흉내 낸 앞 단계 결과
  const daonNotice = {
    info: {
      companyName: "다온건설",
      candidates: [],
      payLimits: [{ agendaNumber: "제4호", target: "이사", current: 60, previous: 45 }],
      auditOpinion: "적정",
      dividend: { currentPerShare: 400, previousPerShare: 400 },
      financials: {
        label: "별도",
        rows: [
          { item: "매출액", current: 1284500, previous: 1196200 },
          { item: "영업이익", current: 62300, previous: 57680 },
          { item: "당기순이익", current: 41050, previous: 39870 },
          { item: "자산총계", current: 1652400, previous: 1588900 },
        ],
      },
      meetingDateTime: "2027년 3월 29일(월) 오전 10시",
      place: "다온타워",
      ownedShares: 3600000,
      totalShares: 30000000,
    },
    agendas: [
      ag("제1호", "재무제표 및 이익배당 승인의 건", "재무제표·이익배당 승인"),
      ag("제2호", "이사 선임의 건", null, { isGroup: true }),
      ag("제2-1호", "사외이사 박정우 선임의 건", "이사 선임", { parentNumber: "제2호" }),
      ag("제2-2호", "사외이사 최지안 선임의 건", "이사 선임", { parentNumber: "제2호" }),
      ag("제3호", "감사위원회 위원 박정우 선임의 건", "감사위원 선임", { conditionNumber: "제2-1호" }),
      ag("제4호", "이사 보수한도 승인의 건", "이사 보수한도"),
    ],
    warnings: [],
    sourceText: await sample("04_다온건설_소집통지서.md"),
  };
  const daonClauses = {
    byAgenda: {
      제1호: { clauses: cite("1.1.1)", "1.2.1)"), removed: [], why: "" },
      "제2-1호": { clauses: cite("3.3.1)", "3.1.2)"), removed: [], why: "" },
      "제2-2호": { clauses: [], removed: [], why: "" }, // 조항 없음 → 판단 보류
      제3호: { clauses: cite("3.6.2)"), removed: [], why: "" },
      제4호: { clauses: cite("4.1.1)"), removed: [], why: "" },
    },
    warnings: [],
  };
  const daonOverview = buildOverview(daonNotice, holdings);
  const longReason = "가".repeat(520);
  const fake = fakeAi([
    {
      opinions: [
        { agendaNumber: "제1호", judgment: "찬성", reason: "1.1.1)에 따라 감사의견이 적정이고 매출액이 7.4% 늘어 찬성한다.", summary: "감사의견 적정", managerChecks: ["재무제표 안건에는 담당자 확인 칸을 쓰지 않음"] },
        { agendaNumber: "제2-1호", judgment: "반대", reason: longReason, summary: "재직 6년", managerChecks: ["다른 회사 겸직 현황 확인"] },
        { agendaNumber: "제3호", judgment: "찬성", reason: "3.6.2)를 검토한 결과 찬성한다.", summary: "", managerChecks: [] },
        { agendaNumber: "제4호", judgment: "반대", reason: "4.1.1)에 따라 한도가 33.3% 늘었으나 영업이익은 77.7% 증가에 그쳐 반대한다.", summary: "", managerChecks: [] },
      ],
    },
    { opinions: [{ agendaNumber: "제2-1호", judgment: "찬성", reason: "3.3.1)에 따라 당사 사외이사로 6년 재직해 독립성 요건을 충족하지 못하므로 반대한다.", summary: "", managerChecks: [] }] },
  ]);
  const r = await writeOpinions(daonNotice, daonClauses, daonOverview, guideline, fake);
  const get = (n) => r.reviews.find((x) => x.agenda.number === n);
  const warn = (kind, n) => r.warnings.some((w) => w.kind === kind && w.agendaNumber === n);

  console.log("[1] 계산 결과");
  check("상위 안건(제2호)은 빠짐", r.reviews.map((x) => x.agenda.number), ["제1호", "제2-1호", "제2-2호", "제3호", "제4호"]);
  check("재무 변동표 4줄 (매출액 +7.4%)", [r.financials.length, r.financials[0].changeRate], [4, 7.4]);
  check("배당 증감 0원", r.dividend?.change, 0);
  check("제4호 보수한도 표시", get("제4호").payLimit?.flag, "적정성 추가 검토 필요");
  check("제4호 보수한도 경고", warn("적정성 추가 검토 필요", "제4호"), true);

  console.log("\n[2] 의견·사유 검사");
  check("제1호 찬성", get("제1호").opinion, "찬성");
  check("500자 넘은 사유는 다시 쓰게 함 (AI 2번)", fake.count(), 2);
  check("다시 쓴 사유로 바뀜 (판단은 그대로 반대)", [get("제2-1호").opinion, get("제2-1호").reason.length <= 500], ["반대", true]);
  check("조항 없는 제2-2호는 판단 보류", [get("제2-2호").opinion, get("제2-2호").guidelineJudgment], ["판단 보류", "판단 보류"]);
  check("제4호 사유의 지어낸 숫자(77.7) 경고", r.warnings.find((w) => w.kind === "숫자 불일치")?.message.includes("77.7"), true);
  check("자료·계산에 있는 숫자(7.4, 33.3)는 경고 안 함", r.warnings.filter((w) => w.kind === "숫자 불일치").length, 1);
  check("선임 안건만 담당자 판단 필요 사항", [get("제1호").managerChecks.length, get("제2-1호").managerChecks], [0, ["다른 회사 겸직 현황 확인"]]);
  check("제2-1호 반대 → 제3호 조건부 경고", warn("조건부 안건", "제3호"), true);
  check("근거 박스용 원문이 그대로", get("제2-1호").clauses[0].body.includes("6년 이상"), true);

  console.log("\n[3] 불참 판정 회사 (새봄바이오텍)");
  const saebomNotice = {
    ...daonNotice,
    info: { ...daonNotice.info, companyName: "새봄바이오텍", payLimits: [], financials: null, dividend: null },
    agendas: [ag("제1호", "재무제표 승인의 건", "재무제표·이익배당 승인"), ag("제2호", "사외이사 정하람 선임의 건", "이사 선임")],
    sourceText: await sample("03_새봄바이오텍_소집통지서.md"),
  };
  const saebomOverview = buildOverview(saebomNotice, holdings);
  const s = await writeOpinions(
    saebomNotice,
    { byAgenda: { 제1호: { clauses: cite("1.1.1)"), removed: [], why: "" }, 제2호: { clauses: [], removed: [], why: "" } }, warnings: [] },
    saebomOverview,
    guideline,
    fakeAi([{ opinions: [{ agendaNumber: "제1호", judgment: "찬성", reason: "(쓰이지 않음)", summary: "외부감사인의 감사의견이 적정이므로 재무제표 승인", managerChecks: [] }] }]),
  );
  check("모든 안건이 불참", s.reviews.map((x) => x.opinion), ["불참", "불참"]);
  check("기준 판단은 남김", s.reviews.map((x) => x.guidelineJudgment), ["찬성", "판단 보류"]);
  check("사유가 판단 요지로 시작", s.reviews[0].reason.startsWith("의결권 행사기준에 따르면 외부감사인의"), true);
  check("사유가 '불참한다.'로 끝남", s.reviews.every((x) => x.reason.endsWith("불참한다.")), true);
  check("사유에 이해관계인 지분율", s.reviews[0].reason.includes("69.0%"), true);
} else {
  process.loadEnvFile(".env");
  console.log(`[실제 AI] 모델: ${process.env.OPENAI_MODEL}`);
  const load = async (f) => extractUploadTexts([{ name: f, bytes: new Uint8Array(await readFile(path.join("sample-data", f))) }]);

  const files = ["02_푸른해물산_소집통지서.md", "03_새봄바이오텍_소집통지서.md", "04_다온건설_소집통지서.md", "05_미래로통신_소집통지서.md"];
  for (const file of files) {
    try {
      const started = Date.now();
      const notice = await extractNotice(await load(file));
      const overview = buildOverview(notice, holdings);
      const clauses = await matchClauses(notice, guideline);
      const r = await writeOpinions(notice, clauses, overview, guideline);
      console.log(`\n[${file}] 전체 ${((Date.now() - started) / 1000).toFixed(1)}초`);
      show(r.reviews);
      const warnings = [...notice.warnings, ...overview.warnings, ...clauses.warnings, ...r.warnings];
      if (warnings.length) console.log(`  ⚠ 확인 필요: ${warnings.map((w) => `[${w.kind}] ${w.message}`).join("\n             ")}`);
      const get = (n) => r.reviews.find((x) => x.agenda.number === n);
      const findBy = (word) => r.reviews.find((x) => x.agenda.title.includes(word));

      check("  사유가 모두 500자 이내", r.reviews.every((x) => x.reason.length <= 500), true);
      if (file.startsWith("02")) {
        check("  이사 보수한도: 적정성 추가 검토 필요", findBy("보수한도")?.payLimit?.flag, "적정성 추가 검토 필요");
      }
      if (file.startsWith("03")) {
        check("  모든 안건 불참", r.reviews.every((x) => x.opinion === "불참"), true);
        check("  불참 사유에 69.0%와 '불참한다.'", r.reviews.every((x) => x.reason.includes("69.0%") && x.reason.endsWith("불참한다.")), true);
      }
      if (file.startsWith("04")) {
        check("  박정우 사외이사(제2-1호) 반대", get("제2-1호")?.opinion, "반대");
        check("  박정우 감사위원(제3호) 반대", get("제3호")?.opinion, "반대");
        check("  최지안(제2-2호) 담당자 판단 필요 사항 있음", (get("제2-2호")?.managerChecks.length ?? 0) > 0, true);
        check("  이사 보수한도: 적정성 추가 검토 필요", findBy("보수한도")?.payLimit?.flag, "적정성 추가 검토 필요");
      }
      if (file.startsWith("05")) {
        check("  스톡옵션(2.0%)은 반대 아님", findBy("주식매수선택권")?.opinion !== "반대", true);
        check("  정관 변경(전자주총 병행)은 반대 아님", findBy("정관")?.opinion !== "반대", true);
        check("  이사 보수한도 경고 없음", findBy("이사 보수한도")?.payLimit?.flag, undefined);
        check("  감사 보수한도 경고 없음", findBy("감사 보수한도")?.payLimit?.flag, undefined);
      }
    } catch (e) {
      failed++;
      console.log(`❌ ${file}: ${e.code ?? ""} ${e.message}`);
    }
  }
}

console.log(failed === 0 ? "\n모두 통과했습니다." : `\n${failed}개가 틀렸습니다.`);
process.exitCode = failed === 0 ? 0 : 1;
