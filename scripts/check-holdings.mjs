// 보유주식 명세표 읽기(lib/holdings.ts)가 제대로 되는지 확인하는 스크립트입니다. (PLAN 작업 3)
// 실행: npm run check:holdings
// 맞으면 ✅, 틀리면 ❌가 찍히고, 하나라도 틀리면 마지막에 실패로 끝납니다.

import { findHolding, loadHoldings, normalizeCompanyName } from "../lib/holdings.ts";

let failed = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} ${label}: ${actual}${ok ? "" : ` (기대값: ${expected})`}`);
}

// 1) 명세표를 읽어 5개 회사가 다 들어왔는지
const holdings = await loadHoldings();
console.log("\n[1] 명세표 읽기");
check("회사 수", holdings.length, 5);
console.table(
  holdings.map((h) => ({
    회사명: h.companyName,
    발행주식총수: h.totalShares,
    당사지분율: h.ourRatio,
    이해관계인지분율: h.relatedRatio,
  })),
);

// 2) 회사 이름 다듬기
console.log("\n[2] 회사 이름 다듬기");
check('"주식회사 다온건설"', normalizeCompanyName("주식회사 다온건설"), "다온건설");
check('"㈜새봄바이오텍"', normalizeCompanyName("㈜새봄바이오텍"), "새봄바이오텍");
check('"미래로통신(주)"', normalizeCompanyName("미래로통신(주)"), "미래로통신");
check('"주식회사 푸른해 물산"', normalizeCompanyName("주식회사 푸른해 물산"), "푸른해물산");

// 3) 소집통지서에 적힌 이름으로 찾기 (통지서 제목은 "주식회사 ○○" 형식)
console.log("\n[3] 소집통지서 이름으로 찾기");
const expected = [
  ["주식회사 가온정밀", 1800000, 18.0, 41.2],
  ["주식회사 푸른해물산", 5000000, 25.0, 43.0],
  ["주식회사 새봄바이오텍", 135000, 0.3, 69.0],
  ["주식회사 다온건설", 3600000, 12.0, 39.5],
  ["주식회사 미래로통신", 2400000, 30.0, 41.0],
];
for (const [name, shares, ratio, relatedRatio] of expected) {
  const h = findHolding(holdings, name);
  check(`${name} 당사 보유주식`, h?.ourShares, shares);
  check(`${name} 당사 지분율`, h?.ourRatio, ratio);
  check(`${name} 이해관계인 지분율`, h?.relatedRatio, relatedRatio);
  // 명세표의 지분율이 주식 수로 계산한 값과 맞는지도 확인
  check(
    `${name} 지분율 계산 일치`,
    Math.round((h.ourShares / h.totalShares) * 1000) / 10,
    ratio,
  );
}

// 4) 없는 회사는 null
console.log("\n[4] 명세표에 없는 회사");
check('"주식회사 없는회사"', findHolding(holdings, "주식회사 없는회사"), null);

console.log(failed === 0 ? "\n모두 통과했습니다." : `\n${failed}개가 틀렸습니다.`);
process.exitCode = failed === 0 ? 0 : 1;
