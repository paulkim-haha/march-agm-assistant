// 화면 뒤에 깔리는 봄 배경 그림입니다. 3월(봄 주주총회 시즌)에 어울리는 벚꽃잎을 은은하게 흩뿌렸어요.
// 글자 읽기에 방해되지 않게 아주 옅게(투명도 낮게) 그리고, 클릭도 가로채지 않습니다.
// 장식이라 스크린리더는 읽지 않습니다(aria-hidden).

const PINK = "#ff8fb8";
const LILAC = "var(--brand-2)";

/** 꽃송이(꽃잎 5장) */
function Blossom({ color }: { color: string }) {
  return (
    <svg viewBox="-20 -20 40 40" className="size-full" fill={color}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="0" cy="-9" rx="6.6" ry="9" transform={`rotate(${a})`} />
      ))}
      <circle r="4" fill="var(--hold)" />
    </svg>
  );
}

/** 꽃잎 1장 */
function Petal({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-full" fill={color}>
      <path d="M12 2c3.6 3.4 6.6 7.2 6.6 11.2A6.6 6.6 0 0 1 12 20 6.6 6.6 0 0 1 5.4 13.2C5.4 9.2 8.4 5.4 12 2z" />
      <path d="M12 2v5l-2.4-2.4z" fill="var(--bg)" opacity="0.7" />
    </svg>
  );
}

// 위치(left·top은 화면 비율), 크기(px), 기울기, 투명도, 종류, 색
const ITEMS: { l: string; t: string; s: number; r: number; o: number; kind: "b" | "p"; c: string }[] = [
  { l: "4%", t: "10%", s: 46, r: 12, o: 0.34, kind: "b", c: PINK },
  { l: "12%", t: "34%", s: 22, r: -28, o: 0.4, kind: "p", c: PINK },
  { l: "2%", t: "62%", s: 34, r: 40, o: 0.26, kind: "b", c: LILAC },
  { l: "9%", t: "86%", s: 24, r: 70, o: 0.38, kind: "p", c: PINK },
  { l: "88%", t: "6%", s: 38, r: -14, o: 0.32, kind: "b", c: LILAC },
  { l: "94%", t: "24%", s: 26, r: 35, o: 0.4, kind: "p", c: PINK },
  { l: "90%", t: "52%", s: 50, r: 22, o: 0.28, kind: "b", c: PINK },
  { l: "96%", t: "78%", s: 24, r: -50, o: 0.36, kind: "p", c: PINK },
  { l: "80%", t: "92%", s: 30, r: 18, o: 0.3, kind: "b", c: LILAC },
  { l: "22%", t: "4%", s: 20, r: 55, o: 0.4, kind: "p", c: PINK },
  { l: "70%", t: "14%", s: 18, r: -35, o: 0.36, kind: "p", c: LILAC },
  { l: "30%", t: "94%", s: 22, r: 30, o: 0.34, kind: "p", c: PINK },
];

export default function BackgroundArt() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* 부드러운 빛 번짐 */}
      <div className="absolute -left-24 top-1/3 size-72 rounded-full bg-brand-2/10 blur-3xl" />
      <div className="absolute -right-24 bottom-10 size-80 rounded-full bg-brand/10 blur-3xl" />
      {ITEMS.map((it, i) => (
        <div
          key={i}
          className="art-petal absolute"
          style={{ left: it.l, top: it.t, width: it.s, height: it.s, opacity: it.o, transform: `rotate(${it.r}deg)` }}
        >
          {it.kind === "b" ? <Blossom color={it.c} /> : <Petal color={it.c} />}
        </div>
      ))}
    </div>
  );
}
