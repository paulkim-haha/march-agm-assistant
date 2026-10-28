// 보수한도 비교 함수(lib/calc.ts의 작업 8 부분)가 맞는지 확인하는 스크립트입니다. (PLAN 작업 8)
// 실행: npm run check:paylimit
// 가상 5개사 소집통지서의 보수한도·재무 숫자를 넣고 표시 결과를 확인합니다.

import { buildFinancialTable, compareAuditorPayLimit, compareDirectorPayLimit } from "../lib/calc.ts";

let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const ok = a === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} ${label}: ${a}${ok ? "" : ` (기대값: ${JSON.stringify(expected)})`}`);
}

// 영업이익·당기순이익 [당기, 전기]로 재무 변동표를 만듭니다. (단위: 백만 원)
const fin = (op, net) =>
  buildFinancialTable({
    영업이익: { current: op[0], previous: op[1] },
    당기순이익: { current: net[0], previous: net[1] },
  });

// 1) 가상 5개사 이사 보수한도 (단위: 억 원)
console.log("[1] 가상 5개사 이사 보수한도");
const cases = [
  // [회사, 당기 한도, 전기 한도, 영업이익, 당기순이익, 기대 표시, 기대 한도 증감률]
  ["가온정밀 (동결, 실적 증가)", 30, 30, [14820, 12950], [10560, 9410], undefined, 0],
  ["푸른해물산 (실적 감소인데 +25%)", 50, 40, [8240, 21570], [3110, 14880], "적정성 추가 검토 필요", 25],
  ["새봄바이오텍 (동결, 적자 축소)", 15, 15, [-9850, -12300], [-10720, -13040], undefined, 0],
  ["다온건설 (+33.3% > 실적 +8.0%·+3.0%)", 60, 45, [62300, 57680], [41050, 39870], "적정성 추가 검토 필요", 33.3],
  ["미래로통신 (+25% < 실적 +41.9%·+41.2%)", 25, 20, [11920, 8400], [8630, 6110], undefined, 25],
];
for (const [name, cur, prev, op, net, flag, rate] of cases) {
  const r = compareDirectorPayLimit(cur, prev, fin(op, net));
  check(`${name} 표시`, r.flag, flag);
  check(`${name} 한도 증감률(%)`, r.changeRate, rate);
}

// 나란히 보여 줄 실적 증감률이 함께 들어 있는지 (PRD: "나란히 비교")
const daon = compareDirectorPayLimit(60, 45, fin([62300, 57680], [41050, 39870]));
check("다온건설 영업이익 증감률 함께 표시", daon.operatingIncomeRate, 8.0);
check("다온건설 당기순이익 증감률 함께 표시", daon.netIncomeRate, 3.0);

// 2) 특별한 경우
console.log("\n[2] 특별한 경우");
check(
  "재무표가 없으면 판단 불가",
  compareDirectorPayLimit(50, 40, buildFinancialTable({})).flag,
  "판단 불가: 담당자 확인 필요",
);
check("보수한도 자료가 없으면 판단 불가", compareDirectorPayLimit(null, 40, fin([10, 5], [10, 5])).flag, "판단 불가: 담당자 확인 필요");
const mixed = compareDirectorPayLimit(55, 50, fin([120, 100], [80, 100])); // 영업이익 +20%, 순이익 -20%, 한도 +10%
check("방향이 엇갈리면 표시", mixed.mixedDirection, true);
check("방향이 엇갈리고 한도 증가율이 둘보다 높지 않으면 경고 없음", mixed.flag, undefined);
check(
  "동결 한도는 실적이 줄어도 '증가율 비교' 경고 없음",
  compareDirectorPayLimit(30, 30, fin([80, 100], [70, 100])).flag,
  undefined,
);
check(
  "한도 감소는 경고 없음",
  compareDirectorPayLimit(25, 30, fin([80, 100], [70, 100])).flag,
  undefined,
);
check(
  "적자 지속인데 한도 증가 → 검토 필요",
  compareDirectorPayLimit(20, 15, fin([-200, -100], [-300, -100])).flag,
  "적정성 추가 검토 필요",
);

// 3) 감사 보수한도: 감소했을 때만 표시
console.log("\n[3] 감사 보수한도");
check("미래로통신 3억 → 3억 (동결)", compareAuditorPayLimit(3, 3).flag, undefined);
check("증가", compareAuditorPayLimit(4, 3).flag, undefined);
check("감소", compareAuditorPayLimit(2, 3).flag, "담당자 별도 검토 필요");
check("자료 없음", compareAuditorPayLimit(null, 3).flag, "판단 불가: 담당자 확인 필요");

console.log(failed === 0 ? "\n모두 통과했습니다." : `\n${failed}개가 틀렸습니다.`);
process.exitCode = failed === 0 ? 0 : 1;
