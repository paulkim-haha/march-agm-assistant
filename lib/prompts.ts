// AI에게 줄 지시문과 AI 답의 모양을 모아 둔 파일입니다. (DESIGN.md 3장 ②④⑤)
// 지금은 ② 정보 뽑기(PLAN 작업 12)만 있고, ④ 조항 고르기·⑤ 사유 쓰기는 작업 14·15에서 추가합니다.

import { z } from "zod";
import { AGENDA_TYPES } from "./types.ts";

// ───────────────────────── ② 소집통지서 정보 뽑기 ─────────────────────────

/** ② 정보 뽑기에서 AI가 돌려줄 답의 모양 */
export const noticeInfoSchema = z.object({
  /** 올린 파일마다 적힌 회사 이름 (서로 다른 회사가 섞였는지 확인용) */
  files: z.array(
    z.object({
      fileName: z.string().describe("'=== 파일: 이름 ===' 머리줄의 파일 이름. 머리줄이 없으면 빈 문자열"),
      companyName: z.string().nullable().describe("이 파일에 적힌 회사 이름. 없으면 null"),
    }),
  ),
  companyName: z.string().describe("회사 이름. '주식회사', '㈜'는 빼고 적는다"),
  meetingDateTime: z.string().describe("주주총회 일시. 자료에 적힌 글자 그대로. 없으면 빈 문자열"),
  place: z.string().describe("주주총회 장소. 자료에 적힌 글자 그대로. 없으면 빈 문자열"),
  ownedShares: z.number().nullable().describe("통지서에 적힌 당사(수신 주주) 소유주식수. 없으면 null"),
  totalShares: z.number().nullable().describe("통지서에 적힌 발행주식총수. 없으면 null"),
  agendas: z.array(
    z.object({
      number: z.string().describe("의안 번호. '제1호', '제2-1호' 모양으로 맞춘다"),
      title: z.string().describe("의안 제목. 자료에 적힌 그대로 (예: '사외이사 박정우 선임의 건')"),
      type: z.enum(AGENDA_TYPES).nullable().describe("안건 유형. 하위 안건을 묶기만 하는 상위 안건은 null"),
      content: z.string().describe("이 안건의 세부내용 요지. 표의 숫자·변경 전후 문구·조건 등 판단에 필요한 내용을 자료 그대로 옮긴다 (1,500자 이내)"),
      parentNumber: z.string().nullable().describe("하위 안건이면 상위 안건 번호(예: 제2-1호 → '제2호'). 아니면 null"),
      isGroup: z.boolean().describe("하위 안건을 가진 상위 안건이면 true"),
      conditionNumber: z.string().nullable().describe("'제○호가 가결되는 경우에 한하여 상정'처럼 조건이 되는 안건 번호. 없으면 null"),
    }),
  ),
  financials: z
    .object({
      label: z.enum(["별도", "연결", "표시 없음"]).describe("재무표 제목에 '별도'·'연결'이 적혀 있는지"),
      rows: z.array(
        z.object({
          item: z.enum(["매출액", "영업이익", "당기순이익", "자산총계"]),
          current: z.number().nullable().describe("당기 값. 자료의 단위 그대로(쉼표 없이). 손실은 마이너스"),
          previous: z.number().nullable().describe("전기 값. 자료의 단위 그대로(쉼표 없이). 손실은 마이너스"),
        }),
      ),
    })
    .nullable()
    .describe("요약 재무표. 별도와 연결이 둘 다 있으면 별도를 고른다. 재무표가 없으면 null"),
  auditOpinion: z.string().nullable().describe("외부감사인 감사의견(예: '적정'). 없으면 null"),
  dividend: z
    .object({
      currentPerShare: z.number().nullable().describe("당기 보통주 1주당 배당금(원)"),
      previousPerShare: z.number().nullable().describe("전기 보통주 1주당 배당금(원)"),
    })
    .nullable()
    .describe("이익배당. 배당 내용이 없으면 null"),
  payLimits: z.array(
    z.object({
      agendaNumber: z.string(),
      target: z.enum(["이사", "감사"]),
      current: z.number().nullable().describe("당기 보수한도. 억 원 단위 숫자(예: '60억 원' → 60)"),
      previous: z.number().nullable().describe("전기 보수한도. 억 원 단위 숫자"),
    }),
  ),
  candidates: z.array(
    z.object({
      agendaNumber: z.string().describe("이 후보를 다루는 하위 안건 번호"),
      name: z.string(),
      role: z.string().describe("예: '사외이사 (재선임)', '감사위원회 위원'"),
      details: z.string().describe("경력·재직 이력·겸직·거래·출석률 등 표의 내용 그대로. '별도 기재 없음'도 그대로 적는다"),
    }),
  ),
});

export type NoticeInfo = z.infer<typeof noticeInfoSchema>;

/** ② 정보 뽑기 지시문 */
export const NOTICE_SYSTEM = `너는 주주총회 소집통지서와 안건 설명 자료에서 정보를 뽑아 정해진 JSON 모양으로 옮기는 담당자다.
반드시 지킬 규칙:
1. 자료에 적힌 내용만 옮긴다. 자료에 없는 값은 지어내지 말고 null 또는 빈 문자열로 둔다.
2. 일시·장소·의안 제목은 자료의 글자를 그대로 옮긴다.
3. 숫자는 쉼표를 빼고 자료의 단위 그대로 옮긴다. 손실(마이너스)은 음수로 적는다. 보수한도만 억 원 단위 숫자로 적는다.
4. 재무표는 '연결' 표시가 있는 표보다 '별도' 표시가 있는 표를 고른다. 표 제목에 '별도'·'연결'이 없으면 label을 '표시 없음'으로 적는다.
5. 의안 번호는 '제1호', '제2-1호'처럼 맞춘다. 하위 안건(제2-1호, 제2-2호)이 있으면 상위 안건(제2호)도 넣고 isGroup을 true로 한다.
6. 자료가 여러 파일이면 '=== 파일: 이름 ===' 머리줄로 나뉘어 있다. 안건 목록은 소집통지서에서, 세부내용은 안건 설명 자료에서 찾아 같은 의안 번호끼리 합친다. files에는 파일마다 적힌 회사 이름을 적는다.
7. 안건 유형은 정해진 목록에서만 고른다. 맞는 것이 없으면 '그 밖의 안건'을 고른다.`;

/** ② 정보 뽑기 요청 글 */
export function noticeUserPrompt(text: string): string {
  return `아래 자료에서 주주총회 정보를 뽑아 주세요.\n\n----- 자료 시작 -----\n${text}\n----- 자료 끝 -----`;
}
