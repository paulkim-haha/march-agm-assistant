// 검토 API(app/api/review)가 맞는지, 켜져 있는 개발 서버에 실제로 파일을 보내 확인하는 스크립트입니다. (PLAN 작업 16)
//
// 준비: 다른 창에서 npm run dev 로 개발 서버를 켜 둡니다.
// 실행: npm run check:api
//       서버 주소가 3000이 아니면: (PowerShell) $env:BASE_URL="http://localhost:3001"; npm run check:api
// 오류 경우 5가지는 금방 끝나고, 정상 검토 2건은 AI를 불러 1~2분쯤 걸립니다.

import { readFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const ok = a === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} ${label}: ${a}${ok ? "" : ` (기대값: ${JSON.stringify(expected)})`}`);
}

/** 파일들을 화면과 똑같은 방식(multipart/form-data, 칸 이름 files)으로 보냅니다. */
async function post(files) {
  const form = new FormData();
  for (const f of files) form.append("files", new Blob([f.bytes]), f.name);
  const started = Date.now();
  const res = await fetch(`${BASE}/api/review`, { method: "POST", body: form });
  const body = await res.json();
  return { status: res.status, body, seconds: ((Date.now() - started) / 1000).toFixed(1) };
}
const sample = async (f) => ({ name: f, bytes: await readFile(path.join("sample-data", f)) });

console.log(`[검토 API] ${BASE}/api/review\n`);
try {
  await fetch(BASE);
} catch {
  console.log(`❌ ${BASE} 에 연결하지 못했습니다. npm run dev 로 서버를 먼저 켜 주세요.`);
  process.exit(1);
}

console.log("[1] 잘못된 요청 (AI를 부르기 전에 막힘)");
const none = await post([]);
check("파일 없음 → 400 NO_FILE", [none.status, none.body.error?.code], [400, "NO_FILE"]);
const key = await post([await sample("00_시나리오_안내_업로드금지.md")]);
check("채점표 → 400 BLOCKED_FILE", [key.status, key.body.error?.code], [400, "BLOCKED_FILE"]);
const docx = await post([{ name: "소집통지서.docx", bytes: Buffer.from("PK..") }]);
check("워드 파일 → 415 UNSUPPORTED_TYPE", [docx.status, docx.body.error?.code], [415, "UNSUPPORTED_TYPE"]);
const six = await post(Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.txt`, bytes: Buffer.from(`내용${i}`) })));
check("파일 6개 → 400 TOO_MANY_FILES", [six.status, six.body.error?.code], [400, "TOO_MANY_FILES"]);
check("오류 응답에 안내 문구", typeof none.body.error?.message === "string" && none.body.error.message.length > 0, true);

console.log("\n[2] 다른 회사 파일 섞기 (AI 1번)");
const mixed = await post([await sample("06b_다온건설_안건설명서.md"), await sample("01_가온정밀_소집통지서.md")]);
check(`06b + 01 → 400 MIXED_COMPANY (${mixed.seconds}초)`, [mixed.status, mixed.body.error?.code], [400, "MIXED_COMPANY"]);

console.log("\n[3] 정상 검토: 나뉜 파일 06a + 06b 다온건설 (AI 3번)");
const daon = await post([await sample("06a_다온건설_소집통지서_본문.md"), await sample("06b_다온건설_안건설명서.md")]);
const r = daon.body.report;
check(`200 성공 (${daon.seconds}초)`, daon.status, 200);
if (r) {
  check("회사 이름", r.companyName.replace(/주식회사|㈜|\s/g, ""), "다온건설");
  check("상위 안건(제2호)은 검토 목록에 없음", r.reviews.some((x) => x.agenda.number === "제2호"), false);
  check("검토한 안건 5개", r.reviews.length, 5);
  check("개요표 부의안건에는 제2호 포함 (하위 2개 들여쓰기)", [r.overview.agendaLines.some((l) => l.number === "제2호"), r.overview.agendaLines.filter((l) => l.isSub).length], [true, 2]);
  check("의견이 정해져 참석여부 '참석'", r.overview.attendance, "참석");
  check("보유지분율 12.0% (3,600,000주)", r.overview.ownership, { ratio: 12, shares: 3600000 });
  check("재무 변동표 4줄", r.financials.length, 4);
  check("근거 박스용 조항 원문 있음", r.reviews.every((x) => x.clauses.every((c) => c.body.length > 0)), true);
  check("사유 모두 500자 이내", r.reviews.every((x) => x.reason.length <= 500), true);
  check("박정우 사외이사(제2-1호) 반대", r.reviews.find((x) => x.agenda.number === "제2-1호")?.opinion, "반대");
  console.log(`  경고 ${r.warnings.length}개: ${r.warnings.map((w) => `[${w.kind}]${w.agendaNumber ?? ""}`).join(" ")}`);
}

console.log("\n[4] 정상 검토: 03 새봄바이오텍 (불참 회사, AI 3번)");
const saebom = await post([await sample("03_새봄바이오텍_소집통지서.md")]);
const s = saebom.body.report;
check(`200 성공 (${saebom.seconds}초)`, saebom.status, 200);
if (s) {
  check("불참 회사", s.isAbsenceCompany, true);
  check("참석여부 '불참'", s.overview.attendance, "불참");
  check("불참사유에 69.0%", s.overview.absenceReason.includes("69.0%"), true);
  check("모든 안건 의견 '불참'", s.reviews.every((x) => x.opinion === "불참"), true);
}

console.log(failed === 0 ? "\n모두 통과했습니다." : `\n${failed}개가 틀렸습니다.`);
process.exitCode = failed === 0 ? 0 : 1;
