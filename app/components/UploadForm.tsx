"use client";

// 업로드 구역: 파일 고르기 → 검토 시작 → "검토 중" 표시 → 결과 또는 오류 안내 (PLAN 작업 17, DESIGN.md 6장 ②)
// 이 부분은 버튼·목록처럼 사용자가 만지는 곳이라 브라우저에서 동작합니다("use client").
// 파일 검사는 여기서 먼저 한 번 하고(빠른 안내용), 최종 검사는 서버의 검토 API가 다시 합니다.

import { useEffect, useRef, useState } from "react";
import { RULES, type Report, type ReviewResponse } from "@/lib/types.ts";

/** 올릴 수 있는 파일 종류 */
const ACCEPT = ".pdf,.md,.txt";

/** 채점표 파일인지 (서버의 isBlockedFileName과 같은 규칙) */
function isBlocked(name: string): boolean {
  const n = name.normalize("NFC");
  return n.includes("업로드금지") || n.startsWith("00_");
}

/** 파일 크기를 읽기 쉽게 (예: 3.2KB, 1.4MB) */
function sizeText(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

type Props = {
  /** 검토가 끝나면 보고서를 넘겨받을 곳 (보고서 화면은 PLAN 작업 18에서 연결) */
  onReport?: (report: Report) => void;
};

export default function UploadForm({ onReport }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [done, setDone] = useState<Report | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 검토 중에는 1초마다 걸린 시간을 보여 줍니다. (기다리는 동안 멈춘 것처럼 보이지 않게)
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  /** 파일을 고르면 목록에 더합니다. (같은 파일은 한 번만, 규칙에 안 맞으면 안내) */
  function addFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setError("");
    setDone(null);
    const next = [...files];
    for (const f of Array.from(picked)) {
      if (isBlocked(f.name)) {
        setError("채점용 파일은 올릴 수 없습니다.");
        continue;
      }
      const ext = f.name.toLowerCase().split(".").pop() ?? "";
      if (!["pdf", "md", "txt"].includes(ext)) {
        setError(`${f.name}: PDF나 텍스트 파일만 올릴 수 있습니다.`);
        continue;
      }
      if (next.some((g) => g.name === f.name && g.size === f.size)) continue;
      next.push(f);
    }
    if (next.length > RULES.maxFiles) {
      setError(`파일은 한 번에 ${RULES.maxFiles}개까지 올릴 수 있습니다.`);
      next.length = RULES.maxFiles;
    }
    setFiles(next);
    // 같은 파일을 지웠다가 다시 고를 수 있도록 선택 칸을 비웁니다.
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles(files.filter((_, i) => i !== index));
    setError("");
  }

  /** 검토 API에 파일을 보내고 결과를 받습니다. */
  async function startReview() {
    if (files.length === 0 || busy) return;
    if (totalBytes > RULES.maxFileBytes) {
      setError("파일이 너무 큽니다. 모두 합쳐 4MB 이하로 올려 주세요.");
      return;
    }
    setSeconds(0); // 걸린 시간 표시를 0초부터 다시
    setBusy(true);
    setError("");
    setDone(null);
    try {
      const form = new FormData();
      for (const f of files) form.append("files", f, f.name);
      const res = await fetch("/api/review", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as ReviewResponse | null;
      if (!body) {
        setError("서버 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } else if ("error" in body) {
        setError(body.error.message);
      } else {
        setDone(body.report);
        onReport?.(body.report);
      }
    } catch {
      setError("서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">소집통지서 올리기</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        회사 1곳의 소집통지서를 올려 주세요. 소집통지서와 안건 설명서가 따로 있으면 함께 고르면 됩니다.
        (PDF·.md·.txt, 최대 {RULES.maxFiles}개, 합계 4MB)
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label
          className={`inline-flex cursor-pointer items-center justify-center rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900 ${busy ? "pointer-events-none opacity-50" : ""}`}
        >
          파일 선택
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(e) => addFiles(e.target.files)}
          />
        </label>
        <button
          type="button"
          onClick={startReview}
          disabled={files.length === 0 || busy}
          className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
        >
          {busy ? "검토 중…" : "검토 시작"}
        </button>
      </div>

      {/* 고른 파일 목록 */}
      {files.length > 0 && (
        <ul className="mt-4 divide-y divide-zinc-100 rounded-md border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}`} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="truncate text-zinc-800 dark:text-zinc-200">{f.name}</span>
              <span className="flex shrink-0 items-center gap-3 text-zinc-500">
                {sizeText(f.size)}
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  disabled={busy}
                  aria-label={`${f.name} 빼기`}
                  className="rounded px-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* 검토 중 표시 */}
      {busy && (
        <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300" role="status">
          검토 중… {seconds}초 (보통 30초~1분 걸려요. 창을 닫지 마세요.)
        </p>
      )}

      {/* 오류 안내 */}
      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300" role="alert">
          {error}
        </p>
      )}

      {/* 완료 안내 (자세한 보고서 화면은 PLAN 작업 18에서 이 아래에 붙음) */}
      {done && !busy && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" role="status">
          검토 완료: {done.companyName} · 안건 {done.reviews.length}개 · 참석여부 {done.overview.attendance}
        </p>
      )}
    </section>
  );
}
