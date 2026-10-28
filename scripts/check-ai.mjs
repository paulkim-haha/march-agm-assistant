// AI 연결 함수(lib/ai.ts)가 맞는지 확인하는 스크립트입니다. (PLAN 작업 11)
//
// 실행 1) npm run check:ai       → 진짜 AI를 부르지 않고 "가짜 응답"으로 규칙만 검사 (비용 없음)
// 실행 2) npm run check:ai:live  → .env의 키와 모델로 진짜 AI를 1번 불러 연결을 확인 (아주 적은 비용)
//
// lib/ai.ts는 "server-only"로 보호되어 있어, 이 스크립트는 서버 모드(--conditions=react-server)로 실행합니다.
// API 키 값은 화면에 절대 찍지 않습니다.

import { readFile } from "node:fs/promises";
import { z } from "zod";
import { askAiJson } from "../lib/ai.ts";

let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const ok = a === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} ${label}: ${a}${ok ? "" : ` (기대값: ${JSON.stringify(expected)})`}`);
}

const schema = z.object({ companyName: z.string(), meetingDate: z.string() });
const request = {
  system: "너는 주주총회 소집통지서에서 정보를 뽑는 도우미다.",
  user: "회사 이름과 주주총회 일시를 뽑아 줘.",
  schema,
  schemaName: "notice_basic",
};

/** 정해 둔 답을 차례로 돌려주는 가짜 fetch. 몇 번 불렸는지도 셉니다. */
function fakeFetch(answers) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (a instanceof Error) throw a;
    if (typeof a === "number") return new Response("{}", { status: a });
    return new Response(JSON.stringify({ choices: [{ message: { content: a } }] }), { status: 200 });
  };
  fn.calls = calls;
  return fn;
}

async function tryAsk(fetchImpl) {
  try {
    return { ok: true, value: await askAiJson(request, fetchImpl) };
  } catch (e) {
    return { ok: false, code: e.code ?? String(e), message: e.message };
  }
}

const live = process.argv.includes("--live");

if (!live) {
  // 가짜 응답 시험에는 진짜 키가 필요 없으므로 시험용 값을 씁니다.
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "test-model";

  console.log("[1] 정상 답");
  const good = fakeFetch([JSON.stringify({ companyName: "가온정밀", meetingDate: "2027-03-24 10:00" })]);
  const r1 = await tryAsk(good);
  check("모양이 맞으면 그대로 돌려줌", r1.value, { companyName: "가온정밀", meetingDate: "2027-03-24 10:00" });
  check("한 번만 부름", good.calls.length, 1);
  check("요청에 모델 이름이 들어감", good.calls[0].model, "test-model");
  check("요청에 답 모양(JSON 스키마)이 들어감", good.calls[0].response_format?.type, "json_schema");

  console.log("\n[2] 답 모양이 틀리면 한 번 다시 요청");
  const retry = fakeFetch(["이건 JSON이 아님", JSON.stringify({ companyName: "다온건설", meetingDate: "2027-03-29" })]);
  const r2 = await tryAsk(retry);
  check("두 번째 답으로 성공", r2.value?.companyName, "다온건설");
  check("두 번 부름", retry.calls.length, 2);
  check(
    "다시 요청할 때 무엇이 틀렸는지 알려 줌",
    retry.calls[1].messages.at(-1).content.includes("정해진 JSON 모양과 맞지 않습니다"),
    true,
  );

  const missingField = fakeFetch([JSON.stringify({ companyName: "가온정밀" })]);
  const r3 = await tryAsk(missingField);
  check("칸이 빠진 답이 두 번 오면 AI_BAD_RESPONSE", r3.code, "AI_BAD_RESPONSE");
  check("그래도 두 번까지만 부름", missingField.calls.length, 2);

  console.log("\n[3] 연결 문제");
  check("키가 틀림(401) → AI_UNAVAILABLE", (await tryAsk(fakeFetch([401]))).code, "AI_UNAVAILABLE");
  check("사용량 초과(429) → AI_UNAVAILABLE", (await tryAsk(fakeFetch([429]))).code, "AI_UNAVAILABLE");
  check("AI 서비스 오류(500) → AI_UNAVAILABLE", (await tryAsk(fakeFetch([500]))).code, "AI_UNAVAILABLE");
  check("인터넷 끊김 → AI_UNAVAILABLE", (await tryAsk(fakeFetch([new TypeError("fetch failed")]))).code, "AI_UNAVAILABLE");
  const unavailable = await tryAsk(fakeFetch([401]));
  check("안내 문구에 키가 들어 있지 않음", unavailable.message.includes("test-key"), false);

  delete process.env.OPENAI_API_KEY;
  check("키가 없으면 AI_UNAVAILABLE", (await tryAsk(fakeFetch([]))).code, "AI_UNAVAILABLE");
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.OPENAI_MODEL;
  check("모델 이름이 없으면 AI_UNAVAILABLE", (await tryAsk(fakeFetch([]))).code, "AI_UNAVAILABLE");
} else {
  // 진짜 AI 연결 시험: .env를 읽고, 가상 소집통지서 01로 회사 이름과 일시를 뽑아 봅니다.
  process.loadEnvFile(".env");
  console.log(`[실제 연결] OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? "값 있음" : "없음"}, 모델: ${process.env.OPENAI_MODEL}`);
  const notice = await readFile("sample-data/01_가온정밀_소집통지서.md", "utf8");
  const started = Date.now();
  try {
    const answer = await askAiJson({
      system:
        "너는 주주총회 소집통지서에서 정보를 뽑는 도우미다. 자료에 적힌 그대로 옮기고, 지어내지 않는다.",
      user: `아래 소집통지서에서 회사 이름(주식회사 등은 빼고)과 주주총회 일시를 뽑아 줘.\n\n${notice}`,
      schema,
      schemaName: "notice_basic",
    });
    console.log(`  AI 답: ${JSON.stringify(answer)} (${((Date.now() - started) / 1000).toFixed(1)}초)`);
    check("회사 이름", answer.companyName.includes("가온정밀"), true);
    check("일시에 2027년 3월 24일이 들어 있음", /2027.*3.*24/.test(answer.meetingDate), true);
  } catch (e) {
    failed++;
    console.log(`❌ 실제 연결 실패: ${e.code ?? ""} ${e.message}`);
  }
}

console.log(failed === 0 ? "\n모두 통과했습니다." : `\n${failed}개가 틀렸습니다.`);
process.exitCode = failed === 0 ? 0 : 1;
