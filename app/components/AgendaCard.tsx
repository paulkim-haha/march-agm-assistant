// 안건 1개의 검토 결과 카드입니다. (PLAN 작업 18·19·20, DESIGN.md 6장 ③ 안건별 카드)
// 의견 → (재무 변동표·보수한도 비교) → 사유 → 근거 박스(조항 번호 + 원문) → 담당자 판단 필요 사항 순서로 보여 줍니다.
// 담당자는 의견 고르기 칸에서 찬성/반대/불참을 직접 고르고(작업 19), 사유 글상자에서 사유를 직접 고칩니다(작업 20).

import { formatNumber as num, formatRate as pct, formatSigned as signed } from "@/lib/report-copy.ts";
import { RULES, type AgendaReview, type Dividend, type FinancialRow, type Opinion, type PayLimit } from "@/lib/types.ts";

/** 의견마다 다른 색 (찬성 초록, 반대 빨강, 불참 회색, 판단 보류 주황) */
const OPINION_STYLE: Record<Opinion, string> = {
  찬성: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  반대: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  불참: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  "판단 보류": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

export function OpinionBadge({ opinion }: { opinion: Opinion }) {
  return <span className={`rounded-full px-3 py-0.5 text-sm font-semibold ${OPINION_STYLE[opinion]}`}>{opinion}</span>;
}

/** 재무 변동표 (별도재무제표 기준, 단위: 백만 원) */
function FinancialTable({ rows, dividend }: { rows: FinancialRow[]; dividend?: Dividend }) {
  if (rows.every((r) => r.current === null && r.previous === null)) {
    return <p className="text-sm text-amber-700 dark:text-amber-400">재무표를 찾지 못했습니다. 담당자 확인이 필요합니다.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <caption className="mb-1 text-left text-xs text-zinc-500">재무 변동표 (별도재무제표, 단위: 백만 원)</caption>
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <th className="py-1 text-left font-medium">항목</th>
            <th className="py-1 text-right font-medium">전기</th>
            <th className="py-1 text-right font-medium">당기</th>
            <th className="py-1 text-right font-medium">증감액</th>
            <th className="py-1 text-right font-medium">증감률</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.item} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="py-1">{r.item}</td>
              <td className="py-1 text-right tabular-nums">{num(r.previous)}</td>
              <td className="py-1 text-right tabular-nums">{num(r.current)}</td>
              <td className="py-1 text-right tabular-nums">{signed(r.change)}</td>
              <td className="py-1 text-right tabular-nums">{r.changeRate !== null ? pct(r.changeRate) : (r.lossLabel ?? "-")}</td>
            </tr>
          ))}
          {dividend && (
            <tr>
              <td className="py-1">주당배당금(원)</td>
              <td className="py-1 text-right tabular-nums">{num(dividend.previousPerShare)}</td>
              <td className="py-1 text-right tabular-nums">{num(dividend.currentPerShare)}</td>
              <td className="py-1 text-right tabular-nums">{signed(dividend.change)}</td>
              <td className="py-1 text-right">-</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** 보수한도 비교 (단위: 억 원) */
function PayLimitBox({ pay }: { pay: PayLimit }) {
  return (
    <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
      <p>
        {pay.target} 보수한도 <span className="tabular-nums">{num(pay.previous)}억 원 → {num(pay.current)}억 원</span>{" "}
        ({pct(pay.changeRate)})
      </p>
      {pay.target === "이사" && (
        <p className="text-zinc-600 dark:text-zinc-400">
          영업이익 {pct(pay.operatingIncomeRate)} · 당기순이익 {pct(pay.netIncomeRate)}
          {pay.mixedDirection && " · 두 지표의 방향이 엇갈림"}
        </p>
      )}
      {pay.flag && <p className="mt-1 font-semibold text-amber-700 dark:text-amber-400">⚠ {pay.flag}</p>}
    </div>
  );
}

/** 담당자가 고를 수 있는 의견 */
const CHOICES: Opinion[] = ["찬성", "반대", "불참"];

type Props = {
  review: AgendaReview;
  /** 검토 API가 처음 정한 의견 (담당자가 바꿨는지 보여 주기 위함) */
  originalOpinion: Opinion;
  /** 담당자가 의견을 고르면 불림 */
  onOpinionChange: (opinion: Opinion) => void;
  /** 검토 API가 처음 쓴 사유 (담당자가 고쳤는지 보여 주기 위함) */
  originalReason: string;
  /** 담당자가 사유를 고치면 불림 */
  onReasonChange: (reason: string) => void;
  /** 확인 필요 목록에서 눌렀을 때 이 카드로 이동하기 위한 이름표 */
  anchorId: string;
  /** 재무제표 안건이면 함께 보여 줄 재무 변동표·배당 */
  financials?: FinancialRow[];
  dividend?: Dividend;
  /** 하위 안건이면 들여 씁니다 */
  isSub: boolean;
};

export default function AgendaCard({
  review,
  originalOpinion,
  onOpinionChange,
  originalReason,
  onReasonChange,
  anchorId,
  financials,
  dividend,
  isSub,
}: Props) {
  const { agenda, opinion, guidelineJudgment, reason, clauses, managerChecks, payLimit } = review;
  const pending = opinion === "판단 보류";
  const changed = opinion !== originalOpinion;
  const reasonEdited = reason !== originalReason;
  const over = reason.length > RULES.maxReasonLength;
  const selectId = `${anchorId}-opinion`;
  const reasonId = `${anchorId}-reason`;

  return (
    <article
      id={anchorId}
      className={`scroll-mt-4 rounded-lg border bg-white p-4 dark:bg-zinc-950 ${isSub ? "ml-4 sm:ml-8" : ""} ${
        pending ? "border-2 border-red-400 dark:border-red-700" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50">
          {agenda.number} {agenda.title}
        </h3>
        <div className="flex items-center gap-2">
          <OpinionBadge opinion={opinion} />
          {/* 의견 고르기 칸: 판단 보류 안건은 "의견을 골라 주세요"부터 보임 */}
          <label htmlFor={selectId} className="sr-only">
            {agenda.number} 의견 고르기
          </label>
          <select
            id={selectId}
            value={pending ? "" : opinion}
            onChange={(e) => onOpinionChange(e.target.value as Opinion)}
            className={`rounded-md border bg-white px-2 py-1 text-sm dark:bg-zinc-900 ${
              pending ? "border-red-400 dark:border-red-700" : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            {pending && (
              <option value="" disabled>
                의견을 골라 주세요
              </option>
            )}
            {CHOICES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* 담당자가 의견을 바꿨으면 처음 의견과 함께 알려 줌 */}
      {changed && (
        <p className="mt-1 text-sm text-sky-700 dark:text-sky-400">
          담당자가 의견을 바꿨습니다 (처음 의견: {originalOpinion}). 사유가 새 의견과 맞는지 확인해 주세요.
        </p>
      )}
      {/* 가이드라인 기준 판단과 의견이 다르면 함께 보여 줌 (불참 회사 등) */}
      {!pending && guidelineJudgment !== "판단 보류" && guidelineJudgment !== opinion && (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          가이드라인 기준 판단: <strong>{guidelineJudgment}</strong> → 의견: {opinion}
        </p>
      )}
      {pending && <p className="mt-1 text-sm font-medium text-red-700 dark:text-red-400">담당자가 의견을 정해 주세요.</p>}
      {/* 불참 회사처럼 의견은 정해졌지만 가이드라인 기준 판단을 못 낸 안건 */}
      {!pending && guidelineJudgment === "판단 보류" && (
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
          맞는 가이드라인 조항을 찾지 못해 기준 판단은 보류입니다. 담당자가 확인해 주세요.
        </p>
      )}
      {agenda.conditionNumber && (
        <p className="mt-1 text-xs text-zinc-500">※ {agenda.conditionNumber}이(가) 가결되는 경우에만 상정되는 안건</p>
      )}

      <div className="mt-3 flex flex-col gap-3">
        {financials && financials.length > 0 && <FinancialTable rows={financials} dividend={dividend} />}
        {payLimit && <PayLimitBox pay={payLimit} />}

        {/* 사유 글상자: 직접 고칠 수 있고, 500자를 넘으면 빨간 글자로 알려 줌 */}
        <section>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-zinc-500">
            <label htmlFor={reasonId}>
              사유{reasonEdited && <span className="ml-2 text-sky-700 dark:text-sky-400">(담당자가 고침)</span>}
            </label>
            <span className={over ? "font-semibold text-red-600" : ""}>
              {reason.length} / {RULES.maxReasonLength}자{over && " · 500자를 넘었어요"}
            </span>
          </div>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            className={`field-sizing-content min-h-24 w-full resize-y rounded-md border bg-white px-3 py-2 text-sm leading-6 text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 ${
              over ? "border-red-400 dark:border-red-700" : "border-zinc-200 dark:border-zinc-800"
            }`}
          />
        </section>

        {/* 근거 박스: 조항 번호와 가이드라인 원문 (사유 500자에 세지 않음) */}
        {clauses.length > 0 && (
          <section className="flex flex-col gap-2">
            {clauses.map((c) => (
              <div key={c.id} className="rounded-md border border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40">
                <p className="border-b border-sky-200 px-3 py-1 text-xs font-semibold text-sky-800 dark:border-sky-900 dark:text-sky-300">
                  근거 {c.id} {c.title}
                </p>
                <p className="max-h-40 overflow-y-auto px-3 py-2 text-xs leading-5 text-zinc-700 dark:text-zinc-300">{c.body}</p>
              </div>
            ))}
          </section>
        )}

        {/* 담당자 판단 필요 사항 (선임 안건, 사유와 따로) */}
        {managerChecks.length > 0 && (
          <section className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/40">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">담당자 판단 필요 사항</p>
            <ul className="mt-1 list-disc pl-5 text-sm text-zinc-800 dark:text-zinc-200">
              {managerChecks.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}
