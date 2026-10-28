// 업로드 파일 읽기(lib/extract-text.ts)가 맞는지 확인하는 스크립트입니다. (PLAN 작업 10)
// 실행: npm run check:extract
// 가상 소집통지서 5개, 채점표, 여러 가지 잘못된 파일을 넣어 보고 결과를 확인합니다.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { extractUploadText, extractUploadTexts, isBlockedFileName } from "../lib/extract-text.ts";

let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const ok = a === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} ${label}: ${a}${ok ? "" : ` (기대값: ${JSON.stringify(expected)})`}`);
}

/** 글자 뽑기를 해 보고, 성공이면 결과를, 실패면 오류 코드를 돌려줍니다. */
async function tryExtract(name, bytes) {
  try {
    return { ok: true, ...(await extractUploadText(bytes === null ? null : { name, bytes })) };
  } catch (e) {
    return { ok: false, code: e.code ?? String(e) };
  }
}
const enc = (s) => new TextEncoder().encode(s);

// 1) 가상 소집통지서 5개 (.md)
console.log("[1] 가상 소집통지서 읽기");
const dir = "sample-data";
const notices = (await readdir(dir)).filter((f) => /^0[1-5]_/.test(f)).sort();
check("소집통지서 파일 수", notices.length, 5);
for (const f of notices) {
  const r = await tryExtract(f, new Uint8Array(await readFile(path.join(dir, f))));
  const company = f.split("_")[1];
  check(`${f}: 텍스트로 읽음`, r.kind, "text");
  check(`${f}: 회사 이름·소집통지서 글자 있음`, r.text?.includes(company) && r.text.includes("소집통지서"), true);
}

// 2) 채점표 막기
console.log("\n[2] 채점표 막기");
const keyFile = (await readdir(dir)).find((f) => f.startsWith("00_"));
const keyResult = await tryExtract(keyFile, new Uint8Array(await readFile(path.join(dir, keyFile))));
check(`${keyFile}`, keyResult.code, "BLOCKED_FILE");
check("이름에 '업로드금지'가 있으면 막음", isBlockedFileName("정답표_업로드금지.pdf"), true);
check("맥 방식 한글 이름도 막음", isBlockedFileName("업로드금지.md".normalize("NFD")), true);
check("폴더 경로가 붙어도 '00_'로 시작하면 막음", isBlockedFileName("sample-data/00_안내.md"), true);
check("보통 이름은 통과", isBlockedFileName("01_가온정밀_소집통지서.md"), false);

// 3) 잘못된 파일
console.log("\n[3] 잘못된 파일");
check("파일 없음", (await tryExtract("x.md", null)).code, "NO_FILE");
check("빈 파일", (await tryExtract("x.md", new Uint8Array(0))).code, "NO_FILE");
check("4MB 넘는 파일", (await tryExtract("x.txt", new Uint8Array(4 * 1024 * 1024 + 1).fill(65))).code, "FILE_TOO_LARGE");
check("워드 파일(.docx)", (await tryExtract("소집통지서.docx", enc("PK..."))).code, "UNSUPPORTED_TYPE");
check("그림 파일(.png)", (await tryExtract("스캔.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).code, "UNSUPPORTED_TYPE");
check("이름만 .pdf인 가짜 파일", (await tryExtract("가짜.pdf", enc("hello"))).code, "UNREADABLE_PDF");

// 글자가 하나도 없는 PDF (스캔본처럼 그림만 있는 경우를 흉내)
const emptyPdf = enc(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
    "trailer<</Root 1 0 R>>\n%%EOF",
);
check("글자 없는 PDF", (await tryExtract("빈쪽.pdf", emptyPdf)).code, "UNREADABLE_PDF");

// 4) 글자가 들어 있는 진짜 PDF (탑재된 가이드라인 PDF로 시험)
console.log("\n[4] 글자 있는 PDF");
const pdfBytes = new Uint8Array(await readFile(path.join("data", "23.10.25 _ 자산운용사의 의결권행사가이드라인(개정안).pdf")));
const pdf = await tryExtract("시험.pdf", pdfBytes);
check("PDF로 읽음", pdf.kind, "pdf");
check("PDF 글자에 '의결권' 있음", pdf.text?.includes("의결권"), true);
check("쪽 넘김 문장이 순서대로 이어짐 (5.1.2)", pdf.text?.includes("2%를 초과하면 반대 투표한다"), true);

// 5) 글자 모양 정리
console.log("\n[5] 글자 모양 정리");
// "가온 AGM"을 한국어 윈도우 방식(EUC-KR)으로 저장한 내용
const eucKr = new Uint8Array([0xb0, 0xa1, 0xbf, 0xc2, 0x20, 0x41, 0x47, 0x4d]);
check("EUC-KR 텍스트도 읽음", (await tryExtract("메모장.txt", eucKr)).text, "가온 AGM");
check("윈도우 줄바꿈(\\r\\n)을 \\n으로", (await tryExtract("a.txt", enc("첫줄\r\n둘째줄"))).text, "첫줄\n둘째줄");
check("맨 앞의 보이지 않는 표시(BOM) 제거", (await tryExtract("a.md", enc("﻿제목"))).text, "제목");

// 6) 여러 파일 한꺼번에 (소집통지서와 안건 설명서가 나뉜 경우)
console.log("\n[6] 여러 파일 한꺼번에");
async function tryBundle(list) {
  try {
    return { ok: true, ...(await extractUploadTexts(list)) };
  } catch (e) {
    return { ok: false, code: e.code ?? String(e), message: e.message };
  }
}
const load = async (f) => ({ name: f, bytes: new Uint8Array(await readFile(path.join(dir, f))) });
const part1 = await load("06a_다온건설_소집통지서_본문.md");
const part2 = await load("06b_다온건설_안건설명서.md");

const both = await tryBundle([part1, part2]);
check("나뉜 파일 2개 읽기 성공", both.ok, true);
check("파일 2개가 모두 들어감", both.files?.map((f) => f.name), [part1.name, part2.name]);
check("파일마다 머리줄이 붙음", both.text?.includes(`=== 파일: ${part1.name} ===`) && both.text.includes(`=== 파일: ${part2.name} ===`), true);
check("합친 글자에 일시(본문)와 재무표(설명서)가 모두 있음", both.text?.includes("2027년 3월 29일") && both.text.includes("1,284,500"), true);

const single = await tryBundle([part1]);
check("파일 1개면 머리줄 없이 그대로", single.text?.startsWith("# 주식회사 다온건설"), true);
check("같은 파일을 두 번 고르면 한 번만", (await tryBundle([part1, part1])).files?.length, 1);
check("파일 없음", (await tryBundle([])).code, "NO_FILE");
const six = Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.txt`, bytes: enc(`내용${i}`) }));
check("파일 6개", (await tryBundle(six)).code, "TOO_MANY_FILES");
check(
  "합계 4MB 초과 (2MB + 2.1MB)",
  (await tryBundle([
    { name: "a.txt", bytes: new Uint8Array(2 * 1024 * 1024).fill(65) },
    { name: "b.txt", bytes: new Uint8Array(2.1 * 1024 * 1024).fill(65) },
  ])).code,
  "FILE_TOO_LARGE",
);
check("채점표가 하나라도 섞이면 막음", (await tryBundle([part1, { name: keyFile, bytes: enc("x") }])).code, "BLOCKED_FILE");
const badMix = await tryBundle([part1, { name: "안건.pdf", bytes: enc("hello") }]);
check("문제 파일이 있으면 그 파일 이름을 알려 줌", badMix.code === "UNREADABLE_PDF" && badMix.message.startsWith("안건.pdf:"), true);
const emptyMix = await tryBundle([part1, { name: "빈파일.md", bytes: new Uint8Array(0) }]);
check("빈 파일이 섞이면 그 파일 이름을 알려 줌", emptyMix.code === "NO_FILE" && emptyMix.message.startsWith("빈파일.md:"), true);

console.log(failed === 0 ? "\n모두 통과했습니다." : `\n${failed}개가 틀렸습니다.`);
process.exitCode = failed === 0 ? 0 : 1;
