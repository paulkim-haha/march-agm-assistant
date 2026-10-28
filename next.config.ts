import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // 검토 API가 서버에서 읽는 탑재 자료(가이드라인 조항, 보유주식 명세표)를
  // Vercel 배포본에도 꼭 넣으라고 알려 줍니다. (DESIGN.md 10장)
  outputFileTracingIncludes: {
    "/api/review": ["./data/guideline.json", "./data/보유주식_명세표.csv"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
