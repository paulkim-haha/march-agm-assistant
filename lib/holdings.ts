// 앱에 탑재된 보유주식 명세표(data/보유주식_명세표.csv)를 읽는 파일입니다. (PLAN 작업 3)
// 회사 이름으로 당사·이해관계인 지분을 찾아 주고, 이 값은 개요표와 불참 판정에 쓰입니다.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Holding } from "./types";

/** 명세표 파일 위치 (app1 폴더 기준) */
export const HOLDINGS_FILE = path.join(process.cwd(), "data", "보유주식_명세표.csv");

/** 탑재 자료가 없거나 망가졌을 때 쓰는 오류 (검토 API에서 DATA_MISSING으로 바뀜) */
export class DataMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataMissingError";
  }
}

/**
 * 회사 이름을 비교하기 쉽게 다듬습니다.
 * "주식회사 다온건설", "㈜다온건설", "다온건설(주)"가 모두 "다온건설"이 됩니다.
 */
export function normalizeCompanyName(name: string): string {
  return name
    .replace(/주식회사/g, "")
    .replace(/㈜/g, "")
    .replace(/[(（]\s*주\s*[)）]/g, "")
    .replace(/\s+/g, "");
}

/**
 * 파일 내용을 글자로 바꿉니다.
 * 보통은 UTF-8이지만, 엑셀에서 저장하면 한국어 윈도우 방식(EUC-KR)이 될 수 있어 둘 다 받습니다.
 */
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("euc-kr").decode(bytes);
  }
}

/** CSV 한 줄을 칸으로 나눕니다. 큰따옴표로 감싼 칸("1,800,000")도 하나로 봅니다. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

/** "1,800,000"이나 "18.0" 같은 글자를 숫자로 바꿉니다. 숫자가 아니면 오류를 냅니다. */
function toNumber(value: string, where: string): number {
  const n = Number(value.replace(/,/g, ""));
  if (value === "" || Number.isNaN(n)) {
    throw new DataMissingError(`보유주식 명세표의 ${where} 값이 숫자가 아닙니다: "${value}"`);
  }
  return n;
}

// 명세표 첫 줄(제목줄)의 칸 이름 → Holding의 칸 이름
const COLUMNS = {
  companyName: "회사명",
  totalShares: "발행주식총수",
  ourShares: "당사_보유주식수",
  ourRatio: "당사_지분율(%)",
  relatedPartyName: "이해관계인",
  relatedShares: "이해관계인_보유주식수",
  relatedRatio: "이해관계인_지분율(%)",
  baseDate: "기준일",
} as const;

/** CSV 글자 전체를 Holding 목록으로 바꿉니다. (파일 읽기와 분리해 두어 따로 시험하기 쉽게 함) */
export function parseHoldingsCsv(text: string): Holding[] {
  const lines = text
    .replace(/^﻿/, "") // 엑셀이 맨 앞에 붙이는 보이지 않는 표시 제거
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  if (lines.length < 2) {
    throw new DataMissingError("보유주식 명세표에 내용이 없습니다.");
  }

  // 제목줄에서 각 칸이 몇 번째인지 찾습니다. (칸 순서가 바뀌어도 읽을 수 있게)
  const header = splitCsvLine(lines[0]);
  const index = {} as Record<keyof typeof COLUMNS, number>;
  for (const [key, title] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string][]) {
    const i = header.indexOf(title);
    if (i === -1) {
      throw new DataMissingError(`보유주식 명세표에 "${title}" 칸이 없습니다.`);
    }
    index[key] = i;
  }

  return lines.slice(1).map((line, row) => {
    const cells = splitCsvLine(line);
    const get = (key: keyof typeof COLUMNS) => cells[index[key]] ?? "";
    const where = (key: keyof typeof COLUMNS) => `${row + 2}번째 줄 "${COLUMNS[key]}"`;
    return {
      companyName: get("companyName"),
      totalShares: toNumber(get("totalShares"), where("totalShares")),
      ourShares: toNumber(get("ourShares"), where("ourShares")),
      ourRatio: toNumber(get("ourRatio"), where("ourRatio")),
      relatedPartyName: get("relatedPartyName"),
      relatedShares: toNumber(get("relatedShares"), where("relatedShares")),
      relatedRatio: toNumber(get("relatedRatio"), where("relatedRatio")),
      baseDate: get("baseDate"),
    };
  });
}

/** 앱에 탑재된 명세표 파일을 읽어 Holding 목록으로 돌려줍니다. */
export async function loadHoldings(): Promise<Holding[]> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(HOLDINGS_FILE);
  } catch {
    throw new DataMissingError("보유주식 명세표 파일(data/보유주식_명세표.csv)을 찾지 못했습니다.");
  }
  return parseHoldingsCsv(decodeText(bytes));
}

/**
 * 회사 이름으로 명세표의 한 줄을 찾습니다.
 * 이름은 "주식회사·㈜·(주)"와 띄어쓰기를 뗀 뒤 비교합니다. 없으면 null을 돌려줍니다.
 */
export function findHolding(holdings: Holding[], companyName: string): Holding | null {
  const target = normalizeCompanyName(companyName);
  return holdings.find((h) => normalizeCompanyName(h.companyName) === target) ?? null;
}
