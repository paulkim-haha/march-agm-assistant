// 첫 화면입니다. (DESIGN.md 6장: 머리말 → 업로드 구역 → 보고서 구역)
// 지금은 머리말만 있고, 업로드 구역과 보고서 구역은 다음 작업에서 이 아래에 붙입니다.
export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      {/* ① 머리말: 앱 이름과 사용 안내 */}
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-1 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            3월의 안건 해결사
          </h1>
          <p className="text-sm text-amber-700 dark:text-amber-400">
            실습용 가상 자료만 사용하세요
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <p className="text-zinc-600 dark:text-zinc-400">
          주주총회 소집통지서를 올리면, 의결권 행사 가이드라인에 맞춰 안건별
          검토 의견과 사유 초안을 만들어 드립니다.
        </p>
      </main>
    </div>
  );
}
