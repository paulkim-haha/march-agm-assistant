// 소집통지서 정보 뽑기(lib/review.ts의 extractNotice)가 맞는지 확인하는 스크립트입니다. (PLAN 작업 12)
//
// 실행 1) npm run check:notice       → 가짜 AI 답으로 "코드 검사" 규칙만 확인 (비용 없음)
// 실행 2) npm run check:notice:live  → 진짜 AI로 가상 자료 7가지를 뽑아 기대값과 비교 (AI 7번 호출)

import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractUploadTexts } from "../lib/extract-text.ts";
import { extractNotice, normalizeAgendaNumber, numberAppears, numberSource } from "../lib/review.ts";

let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const ok = a === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} ${label}: ${a}${ok ? "" : ` (기대값: ${JSON.stringify(expected)})`}`);
}
const dir = "sample-data";
const load = async (...names) =>
  extractUploadTexts(
    await Promise.all(names.map(async (f) => ({ name: f, bytes: new Uint8Array(await readFile(path.join(dir, f))) }))),
  );
async function tryExtract(bundle, fetchImpl) {
  try {
    return { ok: true, ...(await extractNotice(bundle, fetchImpl)) };
  } catch (e) {
    return { ok: false, code: e.code ?? String(e), message: e.message };
  }
}

if (!process.argv.includes("--live")) {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "test-model";
  /** 정해 둔 답을 돌려주는 가짜 AI */
  const fakeAi = (answer) => async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }), { status: 200 });

  const daon = await load("04_다온건설_소집통지서.md");
  // 다온건설 자료를 AI가 "제대로" 뽑았다고 가정한 답 (일부러 틀린 숫자 1개 포함)
  const base = {
    files: [{ fileName: "", companyName: "다온건설" }],
    companyName: "다온건설",
    meetingDateTime: "2027년 3월 29일(월) 오전 10시",
    place: "가상시 건설구 다온대로 47, 다온타워 20층 대강당",
    ownedShares: 3600000,
    totalShares: 30000000,
    agendas: [
      { number: "제1호", title: "재무제표 및 이익배당 승인의 건", type: "재무제표·이익배당 승인", content: "", parentNumber: null, isGroup: false, conditionNumber: null },
      { number: "제2호", title: "이사 선임의 건", type: null, content: "", parentNumber: null, isGroup: true, conditionNumber: null },
      { number: "제2-1호", title: "사외이사 박정우 선임의 건", type: "이사 선임", content: "", parentNumber: "제2호", isGroup: false, conditionNumber: null },
      { number: "제3호", title: "감사위원회 위원 박정우 선임의 건", type: "감사위원 선임", content: "", parentNumber: null, isGroup: false, conditionNumber: "제2-1호" },
    ],
    financials: {
      label: "별도",
      rows: [
        { item: "매출액", current: 1284500, previous: 1196200 },
        { item: "영업이익", current: 62300, previous: 99999 }, // ← 자료에 없는 숫자 (지어낸 값)
      ],
    },
    auditOpinion: "적정",
    dividend: { currentPerShare: 400, previousPerShare: 400 },
    payLimits: [{ agendaNumber: "제4호", target: "이사", current: 60, previous: 45 }],
    candidates: [],
  };

  console.log("[1] 숫자 대조 도우미");
  const src = numberSource("| 매출액 | 1,284,500 | 1,196,200 |\n보수한도 60억 원\n| 영업이익 | -9,850 |");
  check("표 칸이 붙지 않음", src.includes("1,284,500 1,196,200"), true);
  check("쉼표 있는 숫자 찾기", numberAppears(1284500, src), true);
  check("마이너스 숫자 찾기", numberAppears(-9850, src), true);
  check("다른 숫자의 일부는 인정 안 함 (84)", numberAppears(84, src), false);
  check("억 단위 찾기 (60억)", numberAppears(60, src, "억"), true);
  check("없는 숫자", numberAppears(99999, src), false);

  console.log("\n[1-2] 의안 번호 모양 맞추기");
  check('"제2-1호 의안이 가결되는 경우에 한하여 상정"', normalizeAgendaNumber("제2-1호 의안이 가결되는 경우에 한하여 상정"), "제2-1호");
  check('"제 1 호 의안"', normalizeAgendaNumber("제 1 호 의안"), "제1호");
  check('"2-2호"', normalizeAgendaNumber("2-2호"), "제2-2호");
  check("번호가 없으면 null", normalizeAgendaNumber("해당 없음"), null);

  console.log("\n[2] 정상 자료 + 지어낸 숫자 1개");
  const r1 = await tryExtract(daon, fakeAi(base));
  check("성공", r1.ok, true);
  check("지어낸 영업이익(전기)은 빈칸으로", r1.info?.financials?.rows[1].previous, null);
  check("진짜 숫자는 그대로", r1.info?.financials?.rows[0].current, 1284500);
  check("숫자 불일치 경고 1개", r1.warnings?.filter((w) => w.kind === "숫자 불일치").length, 1);
  check("보수한도 60억은 자료에 있음", r1.info?.payLimits[0].current, 60);
  check("상위 안건(제2호)은 유형 없음", r1.agendas?.find((a) => a.number === "제2호")?.type, null);
  check("하위 안건의 상위 번호", r1.agendas?.find((a) => a.number === "제2-1호")?.parentNumber, "제2호");
  check("조건부 안건", r1.agendas?.find((a) => a.number === "제3호")?.conditionNumber, "제2-1호");

  console.log("\n[3] 일시·장소가 자료와 다름");
  const r2 = await tryExtract(daon, fakeAi({ ...base, meetingDateTime: "2027년 4월 1일", place: "" }));
  check("다른 일시는 빈칸으로", r2.info?.meetingDateTime, "");
  check("일시·장소 확인 경고 2개", r2.warnings?.filter((w) => w.kind === "담당자 확인 필요").length, 2);

  console.log("\n[4] 연결재무제표만 있음");
  const r3 = await tryExtract(daon, fakeAi({ ...base, financials: { ...base.financials, label: "연결" } }));
  check("재무표를 쓰지 않음", r3.info?.financials, null);
  check("연결재무제표 경고", r3.warnings?.some((w) => w.message.includes("연결재무제표")), true);

  console.log("\n[5] 멈춰야 하는 경우");
  check("안건이 없음 → NO_AGENDA", (await tryExtract(daon, fakeAi({ ...base, agendas: [] }))).code, "NO_AGENDA");
  const two = await load("06a_다온건설_소집통지서_본문.md", "01_가온정밀_소집통지서.md");
  const mixed = {
    ...base,
    files: [
      { fileName: "06a_다온건설_소집통지서_본문.md", companyName: "주식회사 다온건설" },
      { fileName: "01_가온정밀_소집통지서.md", companyName: "㈜가온정밀" },
    ],
  };
  check("서로 다른 회사 → MIXED_COMPANY", (await tryExtract(two, fakeAi(mixed))).code, "MIXED_COMPANY");
  const same = { ...base, files: [{ fileName: "a", companyName: "주식회사 다온건설" }, { fileName: "b", companyName: "㈜다온건설" }] };
  const split = await load("06a_다온건설_소집통지서_본문.md", "06b_다온건설_안건설명서.md");
  check("표기만 다른 같은 회사는 통과", (await tryExtract(split, fakeAi(same))).ok, true);
} else {
  // ───── 진짜 AI로 가상 자료 7가지 ─────
  process.loadEnvFile(".env");
  console.log(`[실제 AI] 모델: ${process.env.OPENAI_MODEL}\n`);

  // 회사별 기대값: [안건 수(상위 안건 제외), 재무표 매출액 당기, 이사 보수한도 당기(억), 조건부 안건]
  const expected = {
    "01_가온정밀_소집통지서.md": ["가온정밀", 4, 182400, 30, null],
    "02_푸른해물산_소집통지서.md": ["푸른해물산", 3, 412600, 50, null],
    "03_새봄바이오텍_소집통지서.md": ["새봄바이오텍", 3, 28400, 15, null],
    "04_다온건설_소집통지서.md": ["다온건설", 5, 1284500, 60, ["제3호", "제2-1호"]],
    "05_미래로통신_소집통지서.md": ["미래로통신", 5, 96800, 25, null],
  };
  const cases = [
    ...Object.keys(expected).map((f) => [f]),
    ["06a_다온건설_소집통지서_본문.md", "06b_다온건설_안건설명서.md"],
  ];

  for (const files of cases) {
    const label = files.join(" + ");
    const exp = expected[files[0]] ?? expected["04_다온건설_소집통지서.md"];
    const started = Date.now();
    const r = await tryExtract(await load(...files));
    console.log(`[${label}] (${((Date.now() - started) / 1000).toFixed(1)}초)`);
    if (!r.ok) {
      failed++;
      console.log(`❌ 실패: ${r.code} ${r.message}\n`);
      continue;
    }
    const [company, agendaCount, sales, payLimit, cond] = exp;
    check("  회사 이름", r.info.companyName.replace(/주식회사|㈜|\s/g, ""), company);
    check("  안건 수 (상위 안건 제외)", r.agendas.filter((a) => !a.isGroup).length, agendaCount);
    check("  재무표 매출액(당기)", r.info.financials?.rows.find((x) => x.item === "매출액")?.current, sales);
    check(
      "  이사 보수한도(당기, 억 원)",
      r.info.payLimits.find((p) => p.target === "이사")?.current,
      payLimit,
    );
    if (cond) {
      check(`  조건부 안건 ${cond[0]} → ${cond[1]}`, r.agendas.find((a) => a.number === cond[0])?.conditionNumber, cond[1]);
    }
    check("  일시 빈칸 아님", r.info.meetingDateTime !== "", true);
    check("  숫자 불일치 경고 없음", r.warnings.filter((w) => w.kind === "숫자 불일치").map((w) => w.message), []);
    console.log("");
  }

  // 다른 회사 섞기: 06b(다온건설) + 01(가온정밀)
  const mixed = await tryExtract(await load("06b_다온건설_안건설명서.md", "01_가온정밀_소집통지서.md"));
  console.log("[06b + 01 (다른 회사 섞기)]");
  check("  MIXED_COMPANY로 멈춤", mixed.code, "MIXED_COMPANY");
}

console.log(failed === 0 ? "\n모두 통과했습니다." : `\n${failed}개가 틀렸습니다.`);
process.exitCode = failed === 0 ? 0 : 1;
