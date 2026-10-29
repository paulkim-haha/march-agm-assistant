// 첫 화면입니다. (DESIGN.md 6장: 머리말 → 업로드 구역 → 보고서 구역)
// 머리말(동영상 히어로)은 Hero가, 업로드 구역과 보고서 구역은 ReviewScreen이 보여 줍니다.
import BackgroundArt from "./components/BackgroundArt";
import Hero from "./components/Hero";
import ReviewScreen from "./components/ReviewScreen";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* 봄(벚꽃) 배경 그림: 화면 뒤에 은은하게 깔림 */}
      <BackgroundArt />
      {/* ① 머리말: 동영상 배경 + 앱 이름과 사용 안내 */}
      <Hero />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-10">
        {/* ② 업로드 구역 + ③ 보고서 구역 */}
        <ReviewScreen />
      </main>
    </div>
  );
}
