// 가이드라인 PDF를 조항 단위 데이터(data/guideline.json)로 바꾸는 스크립트입니다. (PLAN 작업 4)
// 한 번만 실행하면 되고, 가이드라인 PDF가 바뀌었을 때만 다시 실행합니다.
// 실행: npm run build:guideline
//
// 만드는 방법
// 1) PDF의 글자 조각을 쪽마다 "화면 위치(위→아래, 왼쪽→오른쪽)" 순서로 다시 줄 세웁니다.
//    (PDF 안의 저장 순서대로 읽으면 표 글자가 엉뚱한 곳에 끼어들기 때문.
//     업로드 파일 읽기와 같은 함수 lib/extract-text.ts의 readPdfPages를 씁니다.)
// 2) 줄을 보며 장(1. 재무제표의 승인), 절(1.1. 외부감사인…), 조항(1.1.1)…)을 나눕니다.
// 3) "※"로 시작하는 참고 문구와 그 아래 표는 조항 본문과 섞이지 않게
//    그 절의 "표" 항목(예: "3.3 표")으로 따로 모읍니다.
// 4) 꼭 있어야 하는 조항이 빠졌거나 내용이 잘렸으면 실패로 끝냅니다.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readPdfPages } from "../lib/extract-text.ts";

const PDF_FILE = path.join("data", "23.10.25 _ 자산운용사의 의결권행사가이드라인(개정안).pdf");
const OUT_FILE = path.join("data", "guideline.json");

// 본문이 시작하는 쪽 (앞쪽은 표지·목차·원칙이라 조항이 없음)
const FIRST_BODY_PAGE = 8;

// 장 제목 (목차와 같은 이름). 이 이름과 정확히 맞는 줄만 장으로 인정합니다.
const CHAPTERS = {
  1: "재무제표의 승인",
  2: "정관의 변경",
  3: "이사, 감사 및 감사위원회 위원의 선임(해임)",
  4: "이사 및 감사의 보수한도 승인",
  5: "주식매수선택권의 부여",
  6: "합병 및 영업양수도 등",
  7: "자본구조의 변경",
  8: "기타 주주총회의 목적사항",
};

// 꼭 들어 있어야 하는 조항과, 그 본문에 반드시 있어야 하는 말 (잘림 검사용)
const REQUIRED = [
  ["1.1.1)", "적정"],
  ["1.2.1)", "배당"],
  ["2.6.2)", "전자수단"],
  ["2.8.1)", "배당기준일"],
  ["2.14.1)", "이사의 숫자"],
  ["3.1.2)", "3/4"],
  ["3.3.1)", "6년 이상"],
  ["3.3 표", "2개 이상의 다른"],
  ["3.6.2)", "결격사유"],
  ["4.1.1)", "경영 성과"],
  ["5.1.2)", "2%를 초과"],
];

// 띄어쓰기 차이 때문에 검사가 틀리지 않도록 공백을 모두 지우고 비교합니다.
const squash = (s) => s.replace(/\s+/g, "");

/** 본문 쪽들의 줄을 화면에 보이는 순서대로 모읍니다. */
async function readPdfLines() {
  const pages = await readPdfPages(new Uint8Array(await readFile(PDF_FILE)));
  const lines = [];
  for (const pageLines of pages.slice(FIRST_BODY_PAGE - 1)) {
    for (const line of pageLines) {
      if (/^-\s*\d+\s*-$/.test(line)) continue; // 쪽 번호 "- 7 -" 제외
      lines.push(line);
    }
  }
  return lines;
}

/** 줄 목록을 조항 목록으로 나눕니다. */
function parseClauses(lines) {
  const clauses = [];
  const boxes = new Map(); // 절 번호 → 참고 문구·표 줄들

  let chapter = 0;
  let section = null; // { id: "3.3", title: "사외이사의 선임" }
  let current = null; // 지금 본문을 모으는 조항
  let inBox = false; // "※" 참고 문구·표를 모으는 중인지

  const startSection = (id, title) => {
    section = { id, title };
    current = null;
    inBox = false;
  };

  for (const line of lines) {
    // 장: "1. 재무제표의 승인"
    const ch = line.match(/^([1-8])\s*\.\s*(.+)$/);
    if (ch && squash(ch[2]) === squash(CHAPTERS[ch[1]] ?? "")) {
      chapter = Number(ch[1]);
      section = null;
      current = null;
      inBox = false;
      continue;
    }
    if (chapter === 0) continue; // 1장 시작 전("Ⅲ. 의결권 행사 가이드라인" 등)은 건너뜀

    // 조항: "3.3.1) …" 또는 사례 조항 "A.1) …"
    const cl = line.match(/^(\d+\.\d+\.\d+|[A-H]\.\d+)\s*\)\s*(.*)$/);
    if (cl) {
      current = {
        id: `${cl[1]})`,
        chapter,
        title: section?.title ?? CHAPTERS[chapter],
        body: cl[2],
      };
      clauses.push(current);
      inBox = false;
      continue;
    }

    // 절: "3.3. 사외이사의 선임", "1.2 배당정책" (앞 숫자가 지금 장 번호와 같아야 함)
    const sec = line.match(/^(\d+)\.(\d+)\.?\s*([^\d).].*)$/);
    if (sec && Number(sec[1]) === chapter) {
      startSection(`${sec[1]}.${sec[2]}`, sec[3].trim());
      continue;
    }

    // 사례 묶음: "<사례 A : 환경 이슈>"
    const ex = line.match(/^<\s*사례\s*([A-H])\s*:\s*(.+?)\s*>$/);
    if (ex) {
      startSection(`사례 ${ex[1]}`, ex[2]);
      continue;
    }

    // 참고 문구 "※ …"가 나오면 그 아래 표까지 절의 "표" 항목으로 모읍니다.
    if (line.startsWith("※")) inBox = true;
    // 표 뒤에 조항의 글머리표(∙)가 다시 나오면 표가 끝나고 조항 본문이 이어지는 것입니다.
    // (예: 3.3.1)은 "※ 관련 법령" 표가 끼어든 뒤 다음 쪽에서 글머리표가 계속됨)
    else if (inBox && current && /^[∙•]/.test(line)) inBox = false;

    if (inBox && section) {
      if (!boxes.has(section.id)) boxes.set(section.id, { section, lines: [] });
      boxes.get(section.id).lines.push(line);
    } else if (current) {
      current.body += ` ${line}`;
    }
  }

  // 절마다 모은 참고 문구·표를 "3.3 표" 같은 항목으로 추가합니다.
  for (const { section: s, lines: boxLines } of boxes.values()) {
    clauses.push({
      id: `${s.id} 표`,
      chapter: Number.parseInt(s.id, 10) || 8, // 사례 묶음은 8장(주주제안) 뒤에 있어 8장으로 둠
      title: `${s.title} (참고 법령·표)`,
      body: boxLines.join(" "),
    });
  }

  for (const c of clauses) c.body = c.body.replace(/\s+/g, " ").trim();
  return clauses;
}

function checkRequired(clauses) {
  const problems = [];
  for (const [id, mustHave] of REQUIRED) {
    const c = clauses.find((x) => x.id === id);
    if (!c) problems.push(`❌ ${id} 조항이 없습니다.`);
    else if (!squash(c.body).includes(squash(mustHave)))
      problems.push(`❌ ${id} 본문에 "${mustHave}"가 없습니다. (잘렸을 수 있음)`);
    else console.log(`✅ ${id} (${c.title})`);
  }
  const ids = clauses.map((c) => c.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) problems.push(`❌ 같은 번호가 두 번 나옵니다: ${[...new Set(dup)].join(", ")}`);
  return problems;
}

const clauses = parseClauses(await readPdfLines());
console.log(`\n조항 ${clauses.length}개를 찾았습니다. (표·참고 ${clauses.filter((c) => c.id.endsWith("표")).length}개 포함)\n`);
console.log("[필수 조항 검사]");
const problems = checkRequired(clauses);

if (problems.length) {
  console.log(`\n${problems.join("\n")}\n\n파일을 만들지 않았습니다.`);
  process.exitCode = 1;
} else {
  await writeFile(OUT_FILE, `${JSON.stringify(clauses, null, 2)}\n`, "utf8");
  console.log(`\n모두 통과했습니다. ${OUT_FILE} 파일을 만들었습니다.`);
}
