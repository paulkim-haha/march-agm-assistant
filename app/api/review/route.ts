// 검토 API: 화면이 보낸 소집통지서 파일(1~5개)을 받아 보고서 1개를 돌려줍니다. (PLAN 작업 16, DESIGN.md 5장)
// 보내는 것: multipart/form-data, 칸 이름 "files"에 같은 회사 파일 1~5개
// 받는 것: 성공 { report }, 실패 { error: { code, message } }

import { ReviewError } from "@/lib/extract-text.ts";
import { runReview } from "@/lib/review.ts";
import type { ErrorCode, ReviewResponse } from "@/lib/types.ts";

// AI를 3번 부르고 그중 의견·사유 단계는 큰 모델이라, 검토 1번에 보통 30~60초, 길면 2~3분 걸립니다.
// Vercel이 이 시간 안에서만 기다리므로 넉넉히 잡습니다. (요금제별 최대값은 배포 전에 확인: DESIGN.md 9장)
export const maxDuration = 300;

/** 오류 코드별 응답 번호 (사용자가 고칠 수 있는 문제는 400번대, 서버·AI 문제는 500번대) */
const STATUS: Record<ErrorCode, number> = {
  NO_FILE: 400,
  TOO_MANY_FILES: 400,
  FILE_TOO_LARGE: 413,
  MIXED_COMPANY: 400,
  UNSUPPORTED_TYPE: 415,
  BLOCKED_FILE: 400,
  UNREADABLE_PDF: 422,
  NO_AGENDA: 422,
  DATA_MISSING: 500,
  AI_BAD_RESPONSE: 502,
  AI_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

function errorResponse(e: ReviewError): Response {
  const body: ReviewResponse = { error: { code: e.code, message: e.message } };
  return Response.json(body, { status: STATUS[e.code] });
}

export async function POST(request: Request): Promise<Response> {
  // 1) 보낸 파일 꺼내기
  let entries: FormDataEntryValue[];
  try {
    entries = (await request.formData()).getAll("files");
  } catch {
    return errorResponse(new ReviewError("NO_FILE"));
  }
  const files = await Promise.all(
    entries
      .filter((v): v is File => typeof v !== "string")
      .map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
  );

  // 2) 검토 실행
  try {
    const { report, timings } = await runReview(files);
    // 서버 기록에는 걸린 시간과 회사 이름만 남김 (업로드 원문·API 키는 남기지 않음)
    console.log(
      `[review] ${report.companyName}: 파일 ${files.length}개, 안건 ${report.reviews.length}개, ` +
        `경고 ${report.warnings.length}개, ${(timings.total / 1000).toFixed(1)}초 ` +
        `(정보 ${(timings.notice / 1000).toFixed(1)} · 조항 ${(timings.clauses / 1000).toFixed(1)} · 의견 ${(timings.opinions / 1000).toFixed(1)})`,
    );
    const body: ReviewResponse = { report };
    return Response.json(body);
  } catch (e) {
    if (e instanceof ReviewError) return errorResponse(e);
    // 예상하지 못한 오류: 화면에는 일반 문구만, 서버 기록에는 오류 이름만
    console.error(`[review] 예상하지 못한 오류: ${e instanceof Error ? e.name : "unknown"}`);
    return errorResponse(new ReviewError("INTERNAL_ERROR"));
  }
}
