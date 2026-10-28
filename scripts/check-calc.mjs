// 숫자 계산 함수(lib/calc.ts)가 맞는지 확인하는 스크립트입니다. (PLAN 작업 6)
// 실행: npm run check:calc
// 가상 5개사 소집통지서의 재무표 숫자를 넣고, 손으로 계산해 둔 기대값과 비교합니다.

import {
  buildDividend,
  buildFinancialTable,
  changeRate,
  lossLabel,
  ownershipRatio,
  round1,
} from "../lib/calc.ts";

let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const ok = a === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} ${label}: ${a}${ok ? "" : ` (기대값: ${JSON.stringify(expected)})`}`);
}

// 1) 반올림과 특별한 경우
console.log("[1] 반올림·특별한 경우");
check("0.05 → 0.1", round1(0.05), 0.1);
check("-0.05 → -0.1", round1(-0.05), -0.1);
check("10.345 → 10.3", round1(10.345), 10.3);
check("-0.04 → 0 (마이너스 0 아님)", Object.is(round1(-0.04), 0), true);
check("전기 0이면 증감률 없음", changeRate(100, 0), null);
check("값이 없으면 증감률 없음", changeRate(null, 100), null);
check("적자 축소 (-12,300 → -9,850)", lossLabel(-9850, -12300), "적자 축소");
check("적자 지속 (-100 → -150)", lossLabel(-150, -100), "적자 지속");
check("흑자 전환 (-100 → 50)", lossLabel(50, -100), "흑자 전환");
check("적자 전환 (100 → -50)", lossLabel(-50, 100), "적자 전환");
check("둘 다 흑자면 표시 없음", lossLabel(200, 100), undefined);

// 2) 가상 5개사 재무 변동표 (단위: 백만 원, 별도재무제표)
// [당기, 전기]는 소집통지서 숫자, 기대값은 [증감액, 증감률 또는 적자 표시]
const companies = {
  가온정밀: {
    매출액: [182400, 165300, 17100, 10.3],
    영업이익: [14820, 12950, 1870, 14.4],
    당기순이익: [10560, 9410, 1150, 12.2],
    자산총계: [248700, 231200, 17500, 7.6],
  },
  푸른해물산: {
    매출액: [412600, 458900, -46300, -10.1],
    영업이익: [8240, 21570, -13330, -61.8],
    당기순이익: [3110, 14880, -11770, -79.1],
    자산총계: [389500, 402300, -12800, -3.2],
  },
  새봄바이오텍: {
    매출액: [28400, 22100, 6300, 28.5],
    영업이익: [-9850, -12300, 2450, "적자 축소"],
    당기순이익: [-10720, -13040, 2320, "적자 축소"],
    자산총계: [96300, 104800, -8500, -8.1],
  },
  다온건설: {
    매출액: [1284500, 1196200, 88300, 7.4],
    영업이익: [62300, 57680, 4620, 8.0],
    당기순이익: [41050, 39870, 1180, 3.0],
    자산총계: [1652400, 1588900, 63500, 4.0],
  },
  미래로통신: {
    매출액: [96800, 78300, 18500, 23.6],
    영업이익: [11920, 8400, 3520, 41.9],
    당기순이익: [8630, 6110, 2520, 41.2],
    자산총계: [142600, 121900, 20700, 17.0],
  },
};

for (const [name, items] of Object.entries(companies)) {
  console.log(`\n[2] ${name} 재무 변동표`);
  const input = Object.fromEntries(
    Object.entries(items).map(([item, [current, previous]]) => [item, { current, previous }]),
  );
  const table = buildFinancialTable(input);
  for (const row of table) {
    const [, , change, rateOrLabel] = items[row.item];
    check(`${row.item} 증감액`, row.change, change);
    if (typeof rateOrLabel === "string") {
      check(`${row.item} 적자 표시`, row.lossLabel, rateOrLabel);
      check(`${row.item} 증감률 (적자라 없음)`, row.changeRate, null);
    } else {
      check(`${row.item} 증감률(%)`, row.changeRate, rateOrLabel);
    }
  }
}

// 3) 자료에 없는 항목은 빈칸
console.log("\n[3] 자료에 없는 항목");
const partial = buildFinancialTable({ 매출액: { current: 100, previous: 80 } });
check("항목 수는 항상 4개", partial.length, 4);
check("없는 항목(영업이익)의 증감액", partial[1].change, null);

// 4) 지분율과 배당
console.log("\n[4] 지분율·배당");
check("새봄바이오텍 당사 지분율", ownershipRatio(135000, 45000000), 0.3);
check("새봄바이오텍 이해관계인 지분율", ownershipRatio(31050000, 45000000), 69.0);
check("가온정밀 당사 지분율", ownershipRatio(1800000, 10000000), 18.0);
check("발행주식 0이면 없음", ownershipRatio(100, 0), null);
check("푸른해물산 주당배당 600원 → 300원", buildDividend(300, 600).change, -300);
check("다온건설 주당배당 400원 → 400원", buildDividend(400, 400).change, 0);

console.log(failed === 0 ? "\n모두 통과했습니다." : `\n${failed}개가 틀렸습니다.`);
process.exitCode = failed === 0 ? 0 : 1;
