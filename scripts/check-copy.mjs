// 사유 고치기와 보고서 전체 복사가 맞는지 확인하는 스크립트입니다. (PLAN 작업 20)
// 실행: npm run check:copy   (AI를 부르지 않아 바로 끝남)

import { reapplyOpinions } from "../lib/calc.ts";
import { reportToHtml, reportToTables, reportToText } from "../lib/report-copy.ts";

let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const ok = a === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} ${label}: ${a.length > 120 ? `${a.slice(0, 120)}…` : a}${ok ? "" : ` (기대값: ${JSON.stringify(expected)})`}`);
}

const review = (number, title, opinion, extra = {}) => ({
  agenda: { number, title, type: "그 밖의 안건", content: "", isGroup: false, ...extra.agenda },
  opinion,
  guidelineJudgment: extra.judgment ?? opinion,
  reason: extra.reason ?? `${number} 사유`,
  clauses: extra.clauses ?? [],
  managerChecks: extra.managerChecks ?? [],
  ...(extra.payLimit ? { payLimit: extra.payLimit } : {}),
});

const longReason = "가".repeat(510);
const base = {
  companyName: "다온건설",
  isAbsenceCompany: false,
  overview: {
    dateTime: "2027년 3월 26일 오전 10시",
    place: "서울 <본사> 대회의실",
    agendaLines: [
      { number: "제1호", title: "재무제표 승인의 건", isSub: false },
      { number: "제2호", title: "이사 선임의 건", isSub: false },
      { number: "제2-1호", title: "사외이사 박정우 선임의 건", isSub: true },
      { number: "제3호", title: "이사 보수한도 승인의 건", isSub: false },
    ],
    ownership: { ratio: 1.2, shares: 120000 },
    attendance: "참석",
    absenceReason: "-",
  },
  reviews: [
    review("제1호", "재무제표 승인의 건", "찬성"),
    review("제2-1호", "사외이사 박정우 선임의 건", "반대", {
      reason: "재직 기간이\n10년을 넘습니다.",
      clauses: [{ id: "3.3.1)", title: "사외이사의 선임", body: "사외이사 선임시\t관련법령 및 …" }],
      managerChecks: ["독립성 확인"],
    }),
    review("제3호", "이사 보수한도 승인의 건", "찬성", {
      reason: longReason,
      payLimit: { target: "이사", previous: 30, current: 40, changeRate: 33.3, operatingIncomeRate: -5, netIncomeRate: 2, mixedDirection: true, flag: "적정성 추가 검토 필요" },
    }),
  ],
  financials: [
    { item: "매출액", previous: 1196200, current: 1284500, change: 88300, changeRate: 7.4 },
    { item: "영업이익", previous: -1000, current: 500, change: 1500, changeRate: null, lossLabel: "흑자 전환" },
  ],
  dividend: { previousPerShare: 500, currentPerShare: 600, change: 100 },
  warnings: [
    { kind: "500자 초과", agendaNumber: "제3호", message: "제3호: 사유가 510자로 500자를 넘습니다. 줄여 주세요." },
    { kind: "숫자 불일치", agendaNumber: "제2-1호", message: "제2-1호: 사유의 숫자(10)를 …" },
    { kind: "적정성 추가 검토 필요", agendaNumber: "제3호", message: "제3호 이사 보수한도 승인의 건: 적정성 추가 검토 필요" },
  ],
};
const kinds = (r) => r.warnings.map((w) => `${w.kind}:${w.agendaNumber}`);

console.log("[1] 사유 고치기");
const same = reapplyOpinions(base, {}, { 제1호: "제1호 사유" });
check("처음과 같은 글이면 고친 것으로 보지 않음 (경고 그대로)", kinds(same), ["500자 초과:제3호", "숫자 불일치:제2-1호", "적정성 추가 검토 필요:제3호"]);
const short = reapplyOpinions(base, {}, { 제3호: "보수한도가 33.3% 올랐으나 …" });
check("사유를 줄이면 500자 초과 경고가 사라짐", kinds(short).includes("500자 초과:제3호"), false);
check("보수한도 경고는 그대로 남음", kinds(short).includes("적정성 추가 검토 필요:제3호"), true);
check("고친 사유가 보고서에 들어감", short.reviews[2].reason, "보수한도가 33.3% 올랐으나 …");
const longer = reapplyOpinions(base, {}, { 제1호: "나".repeat(501) });
check("고친 사유가 500자를 넘으면 경고가 새로 생김", kinds(longer).filter((k) => k.startsWith("500자")), ["500자 초과:제3호", "500자 초과:제1호"]);
check("새 경고 문구에 글자 수가 들어감", longer.warnings.find((w) => w.agendaNumber === "제1호").message, "제1호: 사유가 501자로 500자를 넘습니다. 줄여 주세요.");
const fixedNumber = reapplyOpinions(base, {}, { "제2-1호": "독립성에 문제가 있습니다." });
check("사유를 고친 안건의 숫자 불일치 경고는 지움", kinds(fixedNumber).includes("숫자 불일치:제2-1호"), false);
const both = reapplyOpinions(base, { 제1호: "반대" }, { 제1호: "반대 사유" });
check("의견과 사유를 함께 고칠 수 있음", [both.reviews[0].opinion, both.reviews[0].reason], ["반대", "반대 사유"]);
check("처음 보고서는 바뀌지 않음", [base.reviews[2].reason.length, base.warnings.length], [510, 3]);

console.log("\n[2] 복사할 표");
const tables = reportToTables(short);
check("표 순서: 개요 → 재무 변동표 → 안건별 검토", tables.map((t) => t.title), ["주주총회 개요", "재무 변동표 (별도재무제표, 단위: 백만 원)", "안건별 검토"]);
check("개요표 부의안건은 하위 안건을 └ 로 표시", tables[0].rows[2][1].split("\n"), ["제1호 재무제표 승인의 건", "제2호 이사 선임의 건", "└ 제2-1호 사외이사 박정우 선임의 건", "제3호 이사 보수한도 승인의 건"]);
check("재무 변동표 숫자는 쉼표·부호", tables[1].rows[1], ["매출액", "1,196,200", "1,284,500", "+88,300", "+7.4%"]);
check("전기 적자면 증감률 대신 표시 글", tables[1].rows[2][4], "흑자 전환");
check("주당배당금 줄", tables[1].rows[3], ["주당배당금(원)", "500", "600", "+100", "-"]);
const agendaRows = tables[2].rows;
check("상위 안건은 제목만", agendaRows[2], ["제2호", "이사 선임의 건", "", "", "", ""]);
check("근거는 조항 번호와 원문을 함께", agendaRows[3][4], "[3.3.1) 사외이사의 선임]\n사외이사 선임시\t관련법령 및 …");
check("담당자 판단 필요 사항 칸", agendaRows[3][5], "· 독립성 확인");
check("보수한도 비교가 안건 칸에 들어감", agendaRows[4][1].includes("이사 보수한도 30억 원 → 40억 원 (+33.3%)"), true);
check("고친 사유가 복사됨", agendaRows[4][3], "보수한도가 33.3% 올랐으나 …");

console.log("\n[3] 한글·엑셀용 표 (HTML)");
const html = reportToHtml(short);
check("표가 3개", (html.match(/<table/g) ?? []).length, 3);
check("< > 기호는 안전하게 바뀜", html.includes("서울 &lt;본사&gt; 대회의실"), true);
check("칸 안 줄바꿈은 같은 칸 안 줄바꿈으로", html.includes('재직 기간이<br style="mso-data-placement:same-cell">10년을 넘습니다.'), true);
check("확인 필요 목록은 넣지 않음", html.includes("숫자 불일치") || html.includes("확인 필요 목록"), false);

console.log("\n[4] 메모장용 글자");
const text = reportToText(short);
const lines = text.split("\n");
check("첫 줄은 보고서 제목", lines[0], "다온건설 검토 보고서");
check("칸은 탭으로 나뉨", lines.find((l) => l.startsWith("일시")), "일시\t2027년 3월 26일 오전 10시");
const row21 = lines.find((l) => l.startsWith("제2-1호"));
check("한 안건은 한 줄 (칸 안 줄바꿈·탭은 띄어쓰기로)", row21.split("\t"), ["제2-1호", "사외이사 박정우 선임의 건", "반대", "재직 기간이 10년을 넘습니다.", "[3.3.1) 사외이사의 선임] 사외이사 선임시 관련법령 및 …", "· 독립성 확인"]);
check("확인 필요 목록은 넣지 않음", text.includes("숫자 불일치"), false);

console.log("\n[5] 불참 회사");
const absent = reapplyOpinions(
  { ...base, isAbsenceCompany: true, overview: { ...base.overview, attendance: "불참", absenceReason: "이해관계인이 69.0%를 보유 …" }, reviews: base.reviews.map((r) => ({ ...r, opinion: "불참" })) },
  {},
);
const absentRows = reportToTables(absent)[2].rows;
check("의견 칸에 가이드라인 기준 판단도 함께", absentRows[3][2], "불참\n(가이드라인 기준 판단: 반대)");
check("불참사유가 개요에 들어감", reportToTables(absent)[0].rows[5], ["불참사유", "이해관계인이 69.0%를 보유 …"]);

console.log(failed === 0 ? "\n모두 통과했습니다." : `\n${failed}개가 틀렸습니다.`);
process.exitCode = failed === 0 ? 0 : 1;
