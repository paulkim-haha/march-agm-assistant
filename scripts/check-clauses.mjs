// 조항 대조(lib/review.ts의 matchClauses)가 맞는지 확인하는 스크립트입니다. (PLAN 작업 14)
//
// 실행 1) npm run check:clauses       → 가짜 AI 답으로 "코드 검사" 규칙 확인 (비용 없음)
// 실행 2) npm run check:clauses:live  → 진짜 AI로 3개사(푸른해·다온·미래로)의 조항을 골라 채점표와 비교 (AI 6번)

import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractUploadTexts } from "../lib/extract-text.ts";
import { loadGuideline } from "../lib/guideline.ts";
import { extractNotice, matchClauses } from "../lib/review.ts";

let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const ok = a === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} ${label}: ${a}${ok ? "" : ` (기대값: ${JSON.stringify(expected)})`}`);
}
const guideline = await loadGuideline();

if (!process.argv.includes("--live")) {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "test-model";
  /** 가짜 AI: 정해 둔 답을 돌려주고, AI에게 보낸 요청 글을 기록 */
  const sent = [];
  const fakeAi = (answer) => async (url, init) => {
    sent.push(JSON.parse(init.body).messages.at(-1).content);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }), { status: 200 });
  };
  const ag = (number, title, type, extra = {}) => ({ number, title, type, content: "", isGroup: false, ...extra });
  const notice = {
    info: {
      candidates: [{ agendaNumber: "제2-1호", name: "박정우", role: "사외이사 (재선임)", details: "2021년 3월 최초 선임, 겸직 2곳, 출석률 72%" }],
      payLimits: [{ agendaNumber: "제4호", target: "이사", current: 60, previous: 45 }],
      auditOpinion: "적정",
      dividend: { currentPerShare: 400, previousPerShare: 400 },
    },
    agendas: [
      ag("제1호", "재무제표 및 이익배당 승인의 건", "재무제표·이익배당 승인"),
      ag("제2호", "이사 선임의 건", null, { isGroup: true }),
      ag("제2-1호", "사외이사 박정우 선임의 건", "이사 선임", { parentNumber: "제2호" }),
      ag("제3호", "감사위원회 위원 박정우 선임의 건", "감사위원 선임", { conditionNumber: "제2-1호" }),
      ag("제4호", "이사 보수한도 승인의 건", "이사 보수한도"),
    ],
    warnings: [],
  };
  const answer = {
    matches: [
      { agendaNumber: "제1호", clauseIds: ["1.1.1", "1.2.1)"], why: "감사의견과 배당" },
      { agendaNumber: "제2-1호 의안", clauseIds: ["3.3.1)", "3.1.2)", "3.3표", "3.3.2)"], why: "재직 기간·출석률·겸직" },
      { agendaNumber: "제3호", clauseIds: ["9.9.9)", "상법 제542조의11"], why: "지어낸 번호" },
      // 제4호는 AI가 빠뜨림
    ],
  };
  const r = await matchClauses(notice, guideline, fakeAi(answer));

  console.log("[1] 코드 검사");
  check("상위 안건(제2호)은 대조하지 않음", Object.keys(r.byAgenda), ["제1호", "제2-1호", "제3호", "제4호"]);
  check("번호 모양 맞추기 (1.1.1 → 1.1.1))", r.byAgenda["제1호"].clauses.map((c) => c.id), ["1.1.1)", "1.2.1)"]);
  check("의안 번호를 조금 다르게 적어도 찾음 (제2-1호 의안)", r.byAgenda["제2-1호"].clauses.length > 0, true);
  check("4개를 고르면 3개만 (3.3 표 포함)", r.byAgenda["제2-1호"].clauses.map((c) => c.id), ["3.3.1)", "3.1.2)", "3.3 표"]);
  check("넘친 번호는 뺌", r.byAgenda["제2-1호"].removed, ["3.3.2)"]);
  check("근거 박스용 원문이 들어 있음", r.byAgenda["제2-1호"].clauses[0].body.includes("6년 이상"), true);
  check("지어낸 번호만 고르면 조항 없음", r.byAgenda["제3호"].clauses, []);
  check("지어낸 번호는 뺀 목록에", r.byAgenda["제3호"].removed, ["9.9.9)", "상법 제542조의11"]);
  check("AI가 빠뜨린 안건도 결과에 있음 (조항 없음)", r.byAgenda["제4호"].clauses, []);
  check("판단 보류 경고는 제3호·제4호", r.warnings.map((w) => [w.kind, w.agendaNumber]), [["판단 보류", "제3호"], ["판단 보류", "제4호"]]);

  console.log("\n[2] AI에게 보낸 요청");
  const prompt = sent[0];
  check("후보자 사실이 들어감 (출석률 72%)", prompt.includes("출석률 72%"), true);
  check("조건부 안건 사실이 들어감", prompt.includes("제2-1호이(가) 가결되는 경우에만"), true);
  check("감사의견이 들어감", prompt.includes("외부감사인 감사의견: 적정"), true);
  check("보수한도 범위의 2.27.2)가 들어감", prompt.includes("[2.27.2)]"), true);
  check("필요 없는 7장(자본구조) 조항은 안 들어감", prompt.includes("[7.1.1)]"), false);
  check("안건마다 고를 수 있는 범위가 적힘 (작업 21)", prompt.includes("고를 수 있는 조항 범위: 4장, 2.25·2.26·2.27절"), true);

  sent.length = 0;
  await matchClauses({ ...notice, agendas: [ag("제1호", "지주회사 설립의 건", "그 밖의 안건")] }, guideline, fakeAi({ matches: [] }));
  check("'그 밖의 안건'이 있으면 조항 전체를 보냄", sent[0].includes("[7.1.1)]") && sent[0].includes("[1.1.1)]"), true);

  console.log("\n[3] 2번 물어 답 합치기·범위 밖 조항 지우기 (작업 21)");
  /** 부를 때마다 다른 답을 주는 가짜 AI */
  const fakeSeq = (...list) => {
    let i = 0;
    return async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(list[Math.min(i++, list.length - 1)]) } }] }), { status: 200 });
  };
  const two = await matchClauses(
    notice,
    guideline,
    fakeSeq(
      { matches: [{ agendaNumber: "제2-1호", clauseIds: ["3.3.1)", "3.3.2)"], why: "가" }, { agendaNumber: "제1호", clauseIds: ["1.1.1)", "2.11.2)"], why: "가" }] },
      { matches: [{ agendaNumber: "제2-1호", clauseIds: ["3.1.2)", "3.3.1)", "3.3 표"], why: "나" }] },
    ),
  );
  check("두 답 모두 고른 조항이 먼저, 최대 3개", two.byAgenda["제2-1호"].clauses.map((c) => c.id), ["3.3.1)", "3.3.2)", "3.1.2)"]);
  check("한쪽이 빠뜨린 안건은 다른 쪽 답으로", two.byAgenda["제1호"].clauses.map((c) => c.id), ["1.1.1)"]);
  check("재무제표 안건이 고른 2장 조항(2.11.2))은 범위 밖이라 지움", two.byAgenda["제1호"].removed, ["2.11.2)"]);
  // 갭 분석 I-2: 정관 변경에서 바뀌는 조문의 조항은 AI가 빠뜨려도 코드가 넣음
  const articles = {
    ...notice,
    agendas: [
      ag("제2호", "정관 일부 변경의 건", "정관 변경", {
        content: "제30조(이사의 수) 이사는 3명 이상 7명 이내 → 9명 이내. 제45조(배당기준일) 이사회 결의로 정한다.",
      }),
      ag("제3호", "정관 일부 변경의 건", "정관 변경", { content: "제2조(목적) 사업목적 추가" }),
    ],
  };
  const art = await matchClauses(
    articles,
    guideline,
    fakeSeq({ matches: [{ agendaNumber: "제2호", clauseIds: ["2.8.1)", "2.2.1)", "2.6.2)"], why: "가" }, { agendaNumber: "제3호", clauseIds: ["2.2.1)"], why: "가" }] }),
  );
  check("정관 변경: 빠뜨린 2.14.1)을 코드가 넣고 3개로 맞춤", art.byAgenda["제2호"].clauses.map((c) => c.id), ["2.14.1)", "2.8.1)", "2.2.1)"]);
  check("바뀌는 조문이 해당 없으면 AI 답 그대로", art.byAgenda["제3호"].clauses.map((c) => c.id), ["2.2.1)"]);

  let calls = 0;
  const halfFail = async () => {
    calls++;
    if (calls === 1) return new Response("{}", { status: 500 });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }), { status: 200 });
  };
  const half = await matchClauses(notice, guideline, halfFail);
  check("한쪽 요청이 실패해도 남은 답으로 결과를 만듦", half.byAgenda["제1호"].clauses.map((c) => c.id), ["1.1.1)", "1.2.1)"]);
} else {
  process.loadEnvFile(".env");
  console.log(`[실제 AI] 모델: ${process.env.OPENAI_MODEL}`);
  const load = async (f) => extractUploadTexts([{ name: f, bytes: new Uint8Array(await readFile(path.join("sample-data", f))) }]);

  // 채점표의 근거 조항 (안건 → 이 중 하나 이상이 나와야 함)
  const expected = {
    "02_푸른해물산_소집통지서.md": { 제2호: ["2.8.1)", "2.14.1)"], 제3호: ["4.1.1)"] },
    "04_다온건설_소집통지서.md": { "제2-1호": ["3.3.1)", "3.1.2)", "3.3 표"], 제3호: ["3.6.2)", "3.6.1)"], 제4호: ["4.1.1)"] },
    "05_미래로통신_소집통지서.md": { 제3호: ["5.1.2)"], 제4호: ["4.1.1)"] },
  };
  for (const [file, exp] of Object.entries(expected)) {
    try {
      const notice = await extractNotice(await load(file));
      const started = Date.now();
      const r = await matchClauses(notice, guideline);
      console.log(`\n[${file}] 조항 대조 ${((Date.now() - started) / 1000).toFixed(1)}초`);
      for (const a of notice.agendas.filter((x) => !x.isGroup)) {
        const m = r.byAgenda[a.number];
        const removed = m.removed.length ? `  (뺀 번호: ${m.removed.join(", ")})` : "";
        console.log(`  ${a.number} ${a.title}: ${m.clauses.map((c) => c.id).join(", ") || "판단 보류"}${removed}`);
      }
      for (const [num, want] of Object.entries(exp)) {
        const got = r.byAgenda[num]?.clauses.map((c) => c.id) ?? [];
        check(`  ${num}에 채점표 조항(${want.join("/")}) 중 하나 이상`, want.some((w) => got.includes(w)), true);
      }
      check("  모든 조항이 3개 이하", Object.values(r.byAgenda).every((m) => m.clauses.length <= 3), true);
    } catch (e) {
      failed++;
      console.log(`❌ ${file}: ${e.code ?? ""} ${e.message}`);
    }
  }
}

console.log(failed === 0 ? "\n모두 통과했습니다." : `\n${failed}개가 틀렸습니다.`);
process.exitCode = failed === 0 ? 0 : 1;
