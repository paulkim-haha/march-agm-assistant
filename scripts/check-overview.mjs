// 주주총회 개요표 만들기(lib/review.ts의 buildOverview)가 맞는지 확인하는 스크립트입니다. (PLAN 작업 13)
//
// 실행 1) npm run check:overview       → 미리 만든 정보로 규칙 확인 (AI 안 부름, 비용 없음)
// 실행 2) npm run check:overview:live  → 진짜 AI로 정보를 뽑아 개요표까지 만들어 보기 (AI 2번 호출)

import { readFile } from "node:fs/promises";
import path from "node:path";
import { decideAttendance } from "../lib/calc.ts";
import { extractUploadTexts } from "../lib/extract-text.ts";
import { loadHoldings } from "../lib/holdings.ts";
import { buildOverview, extractNotice } from "../lib/review.ts";

let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const ok = a === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} ${label}: ${a}${ok ? "" : ` (기대값: ${JSON.stringify(expected)})`}`);
}
const holdings = await loadHoldings();

/** 개요표를 표 모양으로 보여 줍니다. */
function show(title, overview) {
  console.log(`\n  ┌ ${title} 개요표`);
  console.log(`  │ 일시: ${overview.dateTime || "(빈칸)"}`);
  console.log(`  │ 장소: ${overview.place || "(빈칸)"}`);
  console.log("  │ 부의안건:");
  for (const l of overview.agendaLines) console.log(`  │   ${l.isSub ? "  └ " : ""}${l.number} ${l.title}`);
  const own = overview.ownership;
  console.log(`  │ 보유지분율: ${own ? `${own.ratio.toFixed(1)}% (수량 ${own.shares.toLocaleString("ko-KR")}주)` : "담당자 확인 필요"}`);
  console.log(`  │ 참석여부: ${overview.attendance}`);
  console.log(`  └ 불참사유: ${overview.absenceReason}\n`);
}

// 정보 뽑기(작업 12) 결과를 흉내 낸 자료
const noticeStep = (companyName, agendas, ownedShares = null, totalShares = null) => ({
  info: { companyName, meetingDateTime: "2027년 3월 29일(월) 오전 10시", place: "다온타워 20층 대강당", ownedShares, totalShares },
  agendas,
  warnings: [],
});
const ag = (number, title, parentNumber) => ({ number, title, type: null, content: "", isGroup: false, ...(parentNumber ? { parentNumber } : {}) });

if (!process.argv.includes("--live")) {
  console.log("[1] 참석여부 판정");
  check("의견이 아직 없음", decideAttendance([]), "판정 대기");
  check("모두 불참", decideAttendance(["불참", "불참"]), "불참");
  check("찬성이 하나라도 있음", decideAttendance(["불참", "찬성"]), "참석");
  check("반대만 있음", decideAttendance(["반대", "반대"]), "참석");
  check("판단 보류가 남아 있음", decideAttendance(["찬성", "판단 보류"]), "판정 대기");

  console.log("\n[2] 다온건설: 하위 안건 들여쓰기, 보유지분율");
  const daonAgendas = [
    ag("제1호", "재무제표 및 이익배당 승인의 건"),
    ag("제2호", "이사 선임의 건"),
    ag("제2-1호", "사외이사 박정우 선임의 건", "제2호"),
    ag("제2-2호", "사외이사 최지안 선임의 건", "제2호"),
    ag("제3호", "감사위원회 위원 박정우 선임의 건"),
  ];
  const daon = buildOverview(noticeStep("다온건설", daonAgendas, 3600000, 30000000), holdings);
  show("다온건설", daon.overview);
  check("부의안건 순서", daon.overview.agendaLines.map((l) => l.number), ["제1호", "제2호", "제2-1호", "제2-2호", "제3호"]);
  check("하위 안건만 들여쓰기", daon.overview.agendaLines.map((l) => l.isSub), [false, false, true, true, false]);
  check("보유지분율 12.0% (3,600,000주)", daon.overview.ownership, { ratio: 12, shares: 3600000 });
  check("불참 회사 아님", daon.isAbsenceCompany, false);
  check("의견 전이라 참석여부는 판정 대기", daon.overview.attendance, "판정 대기");
  check("불참사유는 '-'", daon.overview.absenceReason, "-");
  check("주식 수가 같으면 경고 없음", daon.warnings, []);
  check(
    "의견이 정해지면 참석",
    buildOverview(noticeStep("다온건설", daonAgendas), holdings, ["찬성", "반대", "반대", "찬성"]).overview.attendance,
    "참석",
  );

  console.log("\n[3] 새봄바이오텍: 불참 판정 회사");
  const saebom = buildOverview(noticeStep("㈜새봄바이오텍", [ag("제1호", "재무제표 승인의 건")]), holdings, ["찬성"]);
  show("새봄바이오텍", saebom.overview);
  check("불참 회사", saebom.isAbsenceCompany, true);
  check("참석여부 불참 (의견과 상관없이)", saebom.overview.attendance, "불참");
  check("불참사유에 이해관계인 지분율", saebom.overview.absenceReason.includes("31,050,000주(69.0%)"), true);
  check("보유지분율 0.3% (135,000주)", saebom.overview.ownership, { ratio: 0.3, shares: 135000 });

  console.log("\n[4] 경고가 필요한 경우");
  const mismatch = buildOverview(noticeStep("다온건설", daonAgendas, 3500000, 30000000), holdings);
  check("소유주식수가 다르면 경고", mismatch.warnings.map((w) => w.kind), ["소유주식수 불일치"]);
  check("경고 문구에 두 숫자가 나옴", mismatch.warnings[0]?.message.includes("3,500,000주") && mismatch.warnings[0].message.includes("3,600,000주"), true);
  const unknown = buildOverview(noticeStep("없는회사", [ag("제1호", "재무제표 승인의 건")]), holdings);
  check("명세표에 없는 회사: 보유지분율 빈칸", unknown.overview.ownership, null);
  check("명세표에 없는 회사: 담당자 확인 필요", unknown.warnings.map((w) => w.kind), ["담당자 확인 필요"]);
  check("명세표에 없는 회사: 불참으로 정하지 않음", unknown.overview.attendance, "판정 대기");
} else {
  process.loadEnvFile(".env");
  console.log(`[실제 AI] 모델: ${process.env.OPENAI_MODEL}`);
  const load = async (...names) =>
    extractUploadTexts(
      await Promise.all(names.map(async (f) => ({ name: f, bytes: new Uint8Array(await readFile(path.join("sample-data", f))) }))),
    );
  for (const files of [["03_새봄바이오텍_소집통지서.md"], ["06a_다온건설_소집통지서_본문.md", "06b_다온건설_안건설명서.md"]]) {
    try {
      const notice = await extractNotice(await load(...files));
      const r = buildOverview(notice, holdings);
      show(files.join(" + "), r.overview);
      check("  일시 빈칸 아님", r.overview.dateTime !== "", true);
      check("  보유지분율 있음", r.overview.ownership !== null, true);
      check("  경고 없음", [...notice.warnings, ...r.warnings].map((w) => w.message), []);
      if (files[0].startsWith("03")) check("  새봄바이오텍은 불참", r.overview.attendance, "불참");
      else check("  다온건설 하위 안건 2개 들여쓰기", r.overview.agendaLines.filter((l) => l.isSub).length, 2);
    } catch (e) {
      failed++;
      console.log(`❌ ${files.join(" + ")}: ${e.code ?? ""} ${e.message}`);
    }
  }
}

console.log(failed === 0 ? "\n모두 통과했습니다." : `\n${failed}개가 틀렸습니다.`);
process.exitCode = failed === 0 ? 0 : 1;
