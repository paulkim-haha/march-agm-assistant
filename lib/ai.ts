// AI(OpenAI)에 요청을 보내고, 정해진 모양의 JSON 답을 받는 파일입니다. (PLAN 작업 11)
// - API 키는 이 파일에서만 읽습니다. 아래 "server-only" 때문에 화면 코드에서 불러오면 빌드가 실패합니다.
// - AI 답은 믿지 않고 zod로 모양을 검사합니다. 모양이 틀리면 한 번 다시 요청합니다.
// - 오류 문구와 기록에는 API 키나 업로드 원문을 남기지 않습니다.
import "server-only";

import { z } from "zod";
import { ReviewError } from "./extract-text.ts";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

/** AI를 한 번 부를 때 기다리는 기본 최대 시간 (작은 모델 기준. 큰 모델은 요청마다 timeoutMs로 늘림) */
const TIMEOUT_MS = 35_000;

/** AI에게 보낼 요청 */
export type AiRequest<T> = {
  /** AI가 지킬 역할·규칙 (예: "너는 주주총회 안건 검토 담당자다…") */
  system: string;
  /** 이번에 처리할 내용 (예: 소집통지서 글자) */
  user: string;
  /** 답의 모양. 이 모양과 다르면 다시 요청하고, 그래도 다르면 AI_BAD_RESPONSE 오류 */
  schema: z.ZodType<T>;
  /** 답 모양의 이름 (영문·숫자·_만, 예: "notice_info") */
  schemaName: string;
  /**
   * 이 요청에만 다른 모델을 쓸 때, 모델 이름이 들어 있는 .env 칸 이름 (예: "OPENAI_MODEL_OPINION")
   * 그 칸이 비어 있으면 기본 모델(OPENAI_MODEL)을 씁니다. 모델 이름은 코드에 직접 적지 않습니다.
   */
  modelEnv?: string;
  /** 이 요청에만 기다리는 시간을 바꿀 때 (밀리초). 큰 모델은 답이 느려서 늘려 줍니다. */
  timeoutMs?: number;
};

/** 시험할 때 진짜 인터넷 대신 가짜 응답을 넣을 수 있게 fetch를 바꿔 끼울 수 있습니다. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * .env에서 AI 설정을 읽습니다. 없으면 AI_UNAVAILABLE (값은 어디에도 보여 주지 않음)
 * modelEnv를 주면 그 칸의 모델을 먼저 쓰고, 비어 있으면 기본 모델(OPENAI_MODEL)을 씁니다.
 */
function readConfig(modelEnv?: string): { apiKey: string; model: string } {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = (modelEnv ? process.env[modelEnv]?.trim() : undefined) || process.env.OPENAI_MODEL?.trim();
  if (!apiKey || !model) {
    throw new ReviewError("AI_UNAVAILABLE");
  }
  return { apiKey, model };
}

/** AI 답의 모양이 틀렸을 때 쓰는 내부 표시 (다시 요청할지 정하는 데만 씀) */
class BadAnswer extends Error {}

/** 한 번 요청해서 AI가 쓴 글자(JSON 문자열)를 받습니다. */
async function requestOnce(
  fetchImpl: FetchLike,
  config: { apiKey: string; model: string },
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  jsonSchema: object,
  schemaName: string,
  timeoutMs: number,
): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        // 답을 우리가 정한 JSON 모양으로 쓰게 합니다. (모양 검사는 아래에서 zod로 한 번 더 함)
        response_format: {
          type: "json_schema",
          json_schema: { name: schemaName, schema: jsonSchema },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // 인터넷 연결 실패, 시간 초과 등
    throw new ReviewError("AI_UNAVAILABLE");
  }

  if (!res.ok) {
    // 401·403: 키 문제, 429: 사용량 초과, 5xx: AI 서비스 문제 → 모두 연결 실패로 안내
    // (서버 기록에는 상태 번호만 남기고, 키나 원문은 남기지 않음)
    console.error(`[ai] OpenAI 응답 오류: HTTP ${res.status}`);
    throw new ReviewError("AI_UNAVAILABLE");
  }

  const data = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  } | null;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new BadAnswer("AI 답이 비어 있습니다.");
  }
  return content;
}

/** AI 답 글자를 JSON으로 읽고 모양을 검사합니다. 틀리면 BadAnswer */
function parseAnswer<T>(content: string, schema: z.ZodType<T>): T {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    throw new BadAnswer("JSON이 아닙니다.");
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    // 어느 칸이 틀렸는지만 짧게 (AI에게 다시 요청할 때 알려 줌)
    const where = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(전체)"}: ${i.message}`)
      .join("; ");
    throw new BadAnswer(`정해진 모양과 다릅니다: ${where}`);
  }
  return result.data;
}

/**
 * AI에게 요청하고, 정해진 모양(schema)으로 검사한 답을 돌려줍니다.
 * - 답 모양이 틀리면 무엇이 틀렸는지 알려 주며 한 번 다시 요청합니다.
 * - 두 번 다 틀리면 AI_BAD_RESPONSE, 연결 자체가 안 되면 AI_UNAVAILABLE 오류를 냅니다.
 */
export async function askAiJson<T>(request: AiRequest<T>, fetchImpl: FetchLike = fetch): Promise<T> {
  const config = readConfig(request.modelEnv);
  const timeoutMs = request.timeoutMs ?? TIMEOUT_MS;
  const jsonSchema = z.toJSONSchema(request.schema);
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: request.system },
    { role: "user", content: request.user },
  ];

  let lastProblem = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    let content = "";
    try {
      content = await requestOnce(fetchImpl, config, messages, jsonSchema, request.schemaName, timeoutMs);
      return parseAnswer(content, request.schema);
    } catch (e) {
      if (!(e instanceof BadAnswer)) throw e; // 연결 실패 등은 바로 멈춤
      lastProblem = e.message;
      // 다시 요청할 때: AI가 쓴 답과 무엇이 틀렸는지를 함께 알려 줌
      if (content) messages.push({ role: "assistant", content });
      messages.push({
        role: "user",
        content: `앞의 답이 정해진 JSON 모양과 맞지 않습니다(${lastProblem}). 정해진 모양에 맞는 JSON만 다시 써 주세요.`,
      });
    }
  }
  console.error(`[ai] AI 답 모양 오류 (2번 시도): ${lastProblem}`);
  throw new ReviewError("AI_BAD_RESPONSE");
}
