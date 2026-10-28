// 업로드한 소집통지서 파일에서 글자를 뽑는 파일입니다. (PLAN 작업 10, DESIGN.md 3장 ① 단계)
// - PDF는 unpdf로 글자를 뽑고, 화면에 보이는 순서(위→아래, 왼쪽→오른쪽)로 다시 줄 세웁니다.
// - .md/.txt는 UTF-8로 읽고, 깨지면 한국어 윈도우 방식(EUC-KR)으로 다시 읽습니다.
// - 채점표 파일, 너무 큰 파일, 지원하지 않는 파일, 글자가 없는 PDF(스캔본 등)는 막고 안내합니다.

import { getDocumentProxy } from "unpdf";
import { RULES, type ErrorCode } from "./types.ts";

/** 화면에 보여 줄 오류 문구 (DESIGN.md 7장) */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  NO_FILE: "소집통지서 파일을 하나 골라 주세요.",
  FILE_TOO_LARGE: "파일이 너무 큽니다. 4MB 이하로 올려 주세요.",
  UNSUPPORTED_TYPE: "PDF나 텍스트 파일만 올릴 수 있습니다.",
  BLOCKED_FILE: "채점용 파일은 올릴 수 없습니다.",
  UNREADABLE_PDF: "글자를 읽을 수 없는 파일입니다. 텍스트가 들어 있는 PDF를 올려 주세요.",
  NO_AGENDA: "주주총회 안건을 찾지 못했습니다. 소집통지서가 맞는지 확인해 주세요.",
  DATA_MISSING: "앱에 탑재된 자료를 찾지 못했습니다. 관리자에게 문의하세요.",
  AI_BAD_RESPONSE: "AI 답을 해석하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  AI_UNAVAILABLE: "AI 서비스에 연결하지 못했습니다. 관리자에게 문의하세요.",
};

/** 검토를 멈춰야 하는 오류. code는 검토 API가 그대로 화면에 돌려줍니다. */
export class ReviewError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string = ERROR_MESSAGES[code]) {
    super(message);
    this.name = "ReviewError";
    this.code = code;
  }
}

/** 업로드된 파일 1개 (브라우저가 보낸 File을 서버에서 이 모양으로 바꿔 넘김) */
export type UploadedFile = {
  /** 파일 이름 (예: "01_가온정밀_소집통지서.md") */
  name: string;
  /** 파일 내용 */
  bytes: Uint8Array;
};

/** 글자 뽑기 결과 */
export type ExtractedText = {
  /** 파일 종류 */
  kind: "pdf" | "text";
  /** 뽑은 글자 전체 (줄바꿈은 \n) */
  text: string;
};

// PDF 안에 글자가 이보다 적으면 "글자를 읽을 수 없는 PDF"(스캔본 등)로 봅니다.
const MIN_READABLE_CHARS = 30;

/** 채점표 파일인지 봅니다. 이름에 "업로드금지"가 있거나 "00_"로 시작하면 막습니다. */
export function isBlockedFileName(name: string): boolean {
  // 맥에서 만든 파일 이름은 한글이 자음·모음으로 나뉘어 올 수 있어 먼저 합칩니다.
  const n = name.normalize("NFC");
  const base = n.split(/[\\/]/).pop() ?? n;
  return base.includes("업로드금지") || base.startsWith("00_");
}

/** 파일 내용 맨 앞이 "%PDF"인지 봅니다. (이름이 .pdf가 아니어도 PDF를 알아봄) */
function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/** 파일 이름과 내용으로 종류를 정합니다. 지원하지 않으면 null */
export function detectKind(name: string, bytes: Uint8Array): "pdf" | "text" | null {
  if (looksLikePdf(bytes)) return "pdf";
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf"; // 이름은 PDF인데 내용이 이상하면 뒤에서 읽기 오류로 안내
  if (ext === "md" || ext === "txt") return "text";
  return null;
}

/**
 * 텍스트 파일 내용을 글자로 바꿉니다.
 * 보통은 UTF-8이지만, 윈도우 메모장·엑셀에서 저장하면 EUC-KR일 수 있어 둘 다 받습니다.
 */
export function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("euc-kr").decode(bytes);
  }
  return text.replace(/^﻿/, ""); // 맨 앞의 보이지 않는 표시 제거
}

/**
 * PDF의 글자를 쪽마다 "화면에 보이는 줄" 순서로 돌려줍니다. 결과: 쪽 목록 → 줄 목록
 * PDF 안의 저장 순서대로 읽으면 표 글자가 엉뚱한 곳에 끼어들 수 있어,
 * 글자 조각의 위치(높이 y, 가로 x)로 다시 줄 세웁니다. (가이드라인 변환 스크립트도 이 함수를 씀)
 */
export async function readPdfPages(bytes: Uint8Array): Promise<string[][]> {
  // PDF 도구가 넘겨준 메모리를 바꿀 수 있어 복사본을 넘깁니다.
  // verbosity 0: 망가진 PDF를 읽을 때 PDF 도구가 찍는 경고 문구를 끕니다. (오류는 그대로 잡음)
  const pdf = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
  const pages: string[][] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    const rows: { y: number; parts: { x: number; width: number; str: string }[] }[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      // 높이가 거의 같은(2pt 이내) 조각은 같은 줄로 봅니다.
      let row = rows.find((r) => Math.abs(r.y - y) <= 2);
      if (!row) {
        row = { y, parts: [] };
        rows.push(row);
      }
      row.parts.push({ x, width: item.width, str: item.str });
    }
    rows.sort((a, b) => b.y - a.y); // PDF는 아래쪽이 y=0이라 큰 값이 위쪽
    pages.push(
      rows.map((row) => {
        row.parts.sort((a, b) => a.x - b.x);
        let text = "";
        let prevEnd: number | null = null;
        for (const p of row.parts) {
          if (prevEnd !== null && p.x - prevEnd > 1) text += " "; // 앞 조각과 틈이 있으면 띄어 씀
          text += p.str;
          prevEnd = p.x + p.width;
        }
        return text.replace(/\s+/g, " ").trim();
      }),
    );
  }
  return pages;
}

/** 글자처럼 보이는 문자(한글·영문·숫자) 개수 */
function countReadableChars(text: string): number {
  return (text.match(/[가-힣A-Za-z0-9]/g) ?? []).length;
}

/**
 * 업로드 파일에서 글자를 뽑습니다. 문제가 있으면 ReviewError를 냅니다.
 * 순서: 파일 있음 → 채점표 아님 → 크기 → 종류 → 글자 뽑기 → 글자가 충분한지
 */
export async function extractUploadText(file: UploadedFile | null): Promise<ExtractedText> {
  if (!file || file.bytes.length === 0) throw new ReviewError("NO_FILE");
  if (isBlockedFileName(file.name)) throw new ReviewError("BLOCKED_FILE");
  if (file.bytes.length > RULES.maxFileBytes) throw new ReviewError("FILE_TOO_LARGE");

  const kind = detectKind(file.name, file.bytes);
  if (!kind) throw new ReviewError("UNSUPPORTED_TYPE");

  let text: string;
  if (kind === "pdf") {
    try {
      const pages = await readPdfPages(file.bytes);
      text = pages.map((lines) => lines.join("\n")).join("\n\n");
    } catch {
      throw new ReviewError("UNREADABLE_PDF"); // 망가진 PDF, 암호 걸린 PDF 등
    }
    if (countReadableChars(text) < MIN_READABLE_CHARS) throw new ReviewError("UNREADABLE_PDF");
  } else {
    text = decodeText(file.bytes);
  }

  return { kind, text: text.replace(/\r\n?/g, "\n").normalize("NFC").trim() };
}
