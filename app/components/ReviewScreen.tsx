"use client";

// 업로드 구역과 보고서 구역을 잇는 부분입니다. (PLAN 작업 18)
// 업로드 구역에서 검토가 끝나면 받은 보고서를 기억해 두었다가 아래 보고서 구역에 보여 줍니다.
// 보고서를 기억하는 일은 브라우저에서 해야 해서 따로 나눴습니다. (첫 화면 page.tsx는 서버에서 미리 만듦)

import { useState } from "react";
import type { Report } from "@/lib/types.ts";
import ReportView from "./ReportView";
import UploadForm from "./UploadForm";

export default function ReviewScreen() {
  const [report, setReport] = useState<Report | null>(null);
  return (
    <>
      {/* ② 업로드 구역 */}
      <UploadForm onReport={setReport} />
      {/* ③ 보고서 구역 (검토가 끝나면 나타남) */}
      {report && <ReportView report={report} />}
    </>
  );
}
