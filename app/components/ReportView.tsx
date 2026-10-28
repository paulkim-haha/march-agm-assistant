// 보고서 구역입니다. (PLAN 작업 18, DESIGN.md 6장 ③)
// 주주총회 개요표 → ⚠ 확인 필요 목록 → 안건별 카드 순서로 회사 1곳의 보고서 1개를 보여 줍니다.
// 상위 안건(예: 제2호 이사 선임의 건)은 의견 없이 제목줄로만 보여 주고, 하위 안건 카드는 들여 씁니다.

import type { Report, Warning } from "@/lib/types.ts";
import AgendaCard, { OpinionBadge } from "./AgendaCard";

/** 의안 번호로 카드 이름표를 만듭니다. (화면 안에서 이동할 때 씀) */
const anchorOf = (index: number) => `agenda-card-${index}`;

/** 경고 종류마다 다른 색 */
function warningColor(w: Warning): string {
  if (w.kind === "판단 보류") return "text-red-700 dark:text-red-400";
  if (w.kind === "숫자 불일치" || w.kind === "500자 초과" || w.kind === "소유주식수 불일치") return "text-red-700 dark:text-red-400";
  return "text-amber-800 dark:text-amber-300";
}

export default function ReportView({ report }: { report: Report }) {
  const { overview, reviews, warnings, financials, dividend } = report;
  const byNumber = new Map(reviews.map((r) => [r.agenda.number, r]));
  // 화면에 보일 순서: 개요표 부의안건 순서 (상위 안건 제목줄 포함)
  const lines = overview.agendaLines;
  const indexOf = new Map(lines.map((l, i) => [l.number, i]));

  return (
    <section className="flex flex-col gap-6" aria-label="검토 보고서">
      <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{report.companyName} 검토 보고서</h2>

      {/* ■ 주주총회 개요표 */}
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold dark:border-zinc-800 dark:bg-zinc-900">
          주주총회 개요
        </h3>
        <table className="w-full text-sm">
          <tbody>
            <Row label="일시">{overview.dateTime || <Missing />}</Row>
            <Row label="장소">{overview.place || <Missing />}</Row>
            <Row label="부의안건">
              <ul className="flex flex-col gap-0.5">
                {lines.map((l) => (
                  <li key={l.number} className={l.isSub ? "pl-4" : ""}>
                    {l.isSub ? "└ " : ""}
                    {l.number} {l.title}
                  </li>
                ))}
              </ul>
            </Row>
            <Row label="보유지분율">
              {overview.ownership ? (
                `${overview.ownership.ratio.toFixed(1)}% (수량 ${overview.ownership.shares.toLocaleString("ko-KR")}주)`
              ) : (
                <Missing />
              )}
            </Row>
            <Row label="참석여부">
              <span className="font-semibold">{overview.attendance}</span>
              {overview.attendance === "판정 대기" && (
                <span className="ml-2 text-xs text-zinc-500">(판단 보류 안건의 의견을 정하면 판정됩니다)</span>
              )}
            </Row>
            <Row label="불참사유">{overview.absenceReason}</Row>
          </tbody>
        </table>
      </div>

      {/* ■ ⚠ 확인 필요 목록 (누르면 해당 안건 카드로 이동) */}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">⚠ 확인 필요 {warnings.length}건</h3>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {warnings.map((w, i) => {
              const target = w.agendaNumber !== undefined ? indexOf.get(w.agendaNumber) : undefined;
              const text = (
                <>
                  <span className="font-semibold">[{w.kind}]</span> {w.message}
                </>
              );
              return (
                <li key={i} className={warningColor(w)}>
                  {target !== undefined ? (
                    <a href={`#${anchorOf(target)}`} className="underline-offset-2 hover:underline">
                      {text}
                    </a>
                  ) : (
                    text
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ■ 안건별 카드 */}
      <div className="flex flex-col gap-4">
        {lines.map((l, i) => {
          const review = byNumber.get(l.number);
          if (!review) {
            // 상위 안건: 의견 없이 제목줄만
            return (
              <h3 key={l.number} id={anchorOf(i)} className="mt-2 font-semibold text-zinc-700 dark:text-zinc-300">
                {l.number} {l.title}
              </h3>
            );
          }
          const isFinancial = review.agenda.type === "재무제표·이익배당 승인";
          return (
            <AgendaCard
              key={l.number}
              review={review}
              anchorId={anchorOf(i)}
              isSub={l.isSub}
              {...(isFinancial ? { financials, dividend } : {})}
            />
          );
        })}
      </div>

      {/* 의견 한눈에 보기 */}
      <div className="flex flex-wrap gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        {reviews.map((r) => (
          <span key={r.agenda.number} className="flex items-center gap-1">
            {r.agenda.number} <OpinionBadge opinion={r.opinion} />
          </span>
        ))}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
      <th className="w-24 bg-zinc-50 px-4 py-2 text-left align-top font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400 sm:w-32">
        {label}
      </th>
      <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200">{children}</td>
    </tr>
  );
}

function Missing() {
  return <span className="text-amber-700 dark:text-amber-400">담당자 확인 필요</span>;
}
