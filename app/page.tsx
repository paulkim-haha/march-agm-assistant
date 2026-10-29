// 첫 화면입니다. (DESIGN.md 6장: 머리말 → 업로드 구역 → 보고서 구역)
// 머리말은 여기서, 업로드 구역과 보고서 구역은 ReviewScreen이 보여 줍니다.
import BackgroundArt from "./components/BackgroundArt";
import { CalendarCheckIcon } from "./components/Icons";
import ReviewScreen from "./components/ReviewScreen";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* 봄(벚꽃) 배경 그림: 화면 뒤에 은은하게 깔림 */}
      <BackgroundArt />
      {/* ① 머리말: 앱 이름과 사용 안내 */}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-brand to-brand-2 text-brand-ink shadow-card">
              <CalendarCheckIcon size={24} />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-ink">3월을 부탁해</h1>
              <p className="text-sm font-medium text-ink-3">AI 주총 어시스턴트</p>
            </div>
          </div>
          <p className="inline-flex w-fit items-center rounded-full bg-hold-soft px-3 py-1 text-xs font-semibold text-hold-ink">
            실습용 가상 자료만 사용하세요
          </p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8">
        <p className="text-[15px] leading-7 text-ink-2">
          주주총회 소집통지서를 올리면, 의결권 행사 가이드라인에 맞춰 안건별 검토 의견과 사유 초안을 만들어 드립니다.
        </p>

        {/* ② 업로드 구역 + ③ 보고서 구역 */}
        <ReviewScreen />
      </main>
    </div>
  );
}
