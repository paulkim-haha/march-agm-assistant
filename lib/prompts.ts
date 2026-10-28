// AI에게 줄 지시문과 AI 답의 모양을 모아 둔 파일입니다. (DESIGN.md 3장 ②④⑤)
// ② 정보 뽑기(PLAN 작업 12), ④ 조항 고르기(작업 14), ⑤ 의견·사유 쓰기(작업 15)가 있습니다.

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

// ───────────────────────── ④ 가이드라인 조항 고르기 ─────────────────────────

/** ④ 조항 고르기에서 AI가 돌려줄 답의 모양 */
export const clauseMatchSchema = z.object({
  matches: z.array(
    z.object({
      agendaNumber: z.string().describe("의안 번호 (예: '제2-1호')"),
      clauseIds: z
        .array(z.string())
        .describe("이 안건의 판단 근거가 되는 조항 번호. 목록에 있는 번호만, 가장 직접 관련된 것부터 최대 3개. 맞는 조항이 없으면 빈 배열"),
      why: z.string().describe("이 조항들을 고른 이유 한두 문장"),
    }),
  ),
});

export type ClauseMatch = z.infer<typeof clauseMatchSchema>;

/** ④ 조항 고르기 지시문 */
export const CLAUSE_SYSTEM = `너는 금융투자협회 「자산운용사 의결권 행사 가이드라인」에 따라 주주총회 안건을 검토하는 담당자다.
안건마다 판단 근거가 되는 가이드라인 조항을 고른다. 반드시 지킬 규칙:
1. 아래 "가이드라인 조항 목록"에 있는 번호만 고른다. 목록에 없는 번호나 법령 조문(예: 상법 제382조)은 쓰지 않는다.
2. 번호는 목록에 적힌 그대로 쓴다 (예: "3.3.1)", "3.3 표").
3. 안건 1건당 가장 직접 관련된 조항부터 최대 3개까지만 고른다.
4. 자료에 나온 구체적인 사실(재직 기간, 겸직 수, 출석률, 감사의견, 희석 비율, 변경 전후 문구 등)이 해당하는지 판단하는 조항을 우선 고른다.
5. 사외이사·감사위원 후보의 결격사유가 문제 되면 법령 결격사유 표("3.3 표")도 고를 수 있다.
6. 맞는 조항이 정말 없으면 추측하지 말고 빈 배열로 둔다.
7. 회사가 불참 대상인지는 신경 쓰지 말고, 안건 내용만 보고 고른다.`;

/** ④ 조항 고르기 요청 글 */
export function clauseUserPrompt(
  agendas: { number: string; title: string; type: string; content: string; facts: string }[],
  clauses: { id: string; title: string; body: string }[],
): string {
  const agendaText = agendas
    .map(
      (a) =>
        `■ ${a.number} ${a.title}\n- 유형: ${a.type}\n- 내용: ${a.content || "(내용 없음)"}` +
        (a.facts ? `\n- 참고 사실: ${a.facts}` : ""),
    )
    .join("\n\n");
  const clauseText = clauses.map((c) => `[${c.id}] (${c.title}) ${c.body}`).join("\n");
  return `다음 안건마다 근거 조항을 골라 주세요.\n\n===== 안건 =====\n${agendaText}\n\n===== 가이드라인 조항 목록 =====\n${clauseText}`;
}

// ───────────────────────── ⑤ 의견·사유 쓰기 ─────────────────────────

/** ⑤ 의견·사유 쓰기에서 AI가 돌려줄 답의 모양 */
export const opinionSchema = z.object({
  opinions: z.array(
    z.object({
      agendaNumber: z.string().describe("의안 번호 (예: '제2-1호')"),
      judgment: z.enum(["찬성", "반대"]).describe("가이드라인 근거 조항에 따른 판단"),
      reason: z.string().describe("검토 사유. 500자 이내. 근거 조항 번호와 자료의 구체적 사실을 들어 쓴다"),
      summary: z.string().describe("판단 요지를 한 구절로 (100자 이내, 예: '외부감사인의 감사의견이 적정이므로 재무제표 승인')"),
      managerChecks: z
        .array(z.string())
        .describe("이사·감사·감사위원 선임 안건에서 자료만으로 판단할 수 없어 담당자가 확인해야 할 사항. 없으면 빈 배열"),
    }),
  ),
});

export type OpinionAnswer = z.infer<typeof opinionSchema>;

/** ⑤ 의견·사유 쓰기 지시문 */
export const OPINION_SYSTEM = `너는 금융투자협회 「자산운용사 의결권 행사 가이드라인」에 따라 주주총회 안건의 검토 의견과 사유를 쓰는 담당자다.
반드시 지킬 규칙:
1. 안건마다 주어진 근거 조항 원문과 자료의 사실만으로 찬성 또는 반대를 정한다.
   근거 조항이 정한 반대 사유 중 하나라도 자료의 사실에 해당하면 반대한다.
2. 근거 조항에 숫자 기준(예: 이사회 출석 3/4 이상, 사외이사 재직 6년 이상, 다른 회사 이사 2개 이상 겸임, 발행주식의 2% 초과, 희석 10% 이상)이 있으면
   자료의 사실을 그 기준과 하나씩 비교하고, 해당하는지 아닌지를 사유에 적는다.
   - "초과"는 같은 값을 포함하지 않는다 (2.0%는 "2% 초과"에 해당하지 않음). "이상"은 같은 값을 포함한다.
   - 출석률 72%는 3/4(75%)에 못 미친다.
   - 재직 기간은 최초 선임 시점부터 "이번 주주총회 일시"까지로 따진다. (예: 2021년 3월 최초 선임 → 2027년 3월이면 6년)
   - 자료에 비율이나 수량이 적혀 있으면 "자료가 없다"고 하지 말고 그 값으로 비교한다.
3. 증감액·증감률·지분율은 주어진 "계산 결과"를 그대로 쓴다. 직접 다시 계산하거나 자료에 없는 숫자를 만들지 않는다.
4. 사유는 500자 이내로, 필요한 만큼만 쓴다. 근거 조항 번호(예: 3.3.1))와 그 조항에 해당하는 구체적 사실을 함께 적는다.
5. 계산 결과에 "적정성 추가 검토 필요", "담당자 별도 검토 필요", "판단 불가" 표시가 있으면 사유에 그 사실을 밝힌다.
6. 영업이익과 당기순이익의 방향이 엇갈린다고 표시된 보수한도 안건은 두 지표의 증감을 각각 적고 종합 판단의 근거를 밝힌다.
7. 이사·감사·감사위원 선임 안건에서 자료에 "별도 기재 없음"이거나 적혀 있지 않아 판단할 수 없는 확인 항목(겸직, 거래관계, 외부감사인 관계, 결격사유 등)은 사유에 섞지 말고 managerChecks에 따로 적는다.
8. 다른 안건이 가결돼야 상정되는 조건부 안건은 사유에 그 관계를 적고, 같은 후보를 다루는 조건 안건과 판단이 서로 맞게 한다 (예: 사외이사로 부적격이면 감사위원으로도 반대).
9. 지분율이나 불참 여부는 쓰지 않는다. (코드가 따로 처리한다)
10. summary에는 판단 요지만 한 구절로 쓴다.`;

/** ⑤ 의견·사유 쓰기 요청 글 */
export function opinionUserPrompt(
  agendas: {
    number: string;
    title: string;
    type: string;
    content: string;
    facts: string;
    computed: string;
    clauses: { id: string; title: string; body: string }[];
  }[],
): string {
  const text = agendas
    .map(
      (a) =>
        `■ ${a.number} ${a.title}\n- 유형: ${a.type}\n- 내용: ${a.content || "(내용 없음)"}` +
        (a.facts ? `\n- 참고 사실: ${a.facts}` : "") +
        (a.computed ? `\n- 계산 결과(코드가 계산함, 그대로 쓸 것): ${a.computed}` : "") +
        `\n- 근거 조항:\n${a.clauses.map((c) => `  [${c.id}] (${c.title}) ${c.body}`).join("\n")}`,
    )
    .join("\n\n");
  return `다음 안건마다 검토 의견과 사유를 써 주세요.\n\n${text}`;
}

/** ⑤ 500자를 넘은 사유를 다시 쓰게 하는 요청 글 */
export function shortenUserPrompt(items: { number: string; reason: string }[]): string {
  return (
    `아래 사유가 500자를 넘습니다. 판단과 근거 조항은 그대로 두고, 사유만 500자 이내로 줄여 같은 모양의 JSON으로 다시 써 주세요.\n\n` +
    items.map((i) => `■ ${i.number} (${i.reason.length}자)\n${i.reason}`).join("\n\n")
  );
}
