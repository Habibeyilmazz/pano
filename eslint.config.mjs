import next from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";

export default [
  ...next,
  ...ts,
  { ignores: [".next/**", ".data/**", "drizzle/**", "playwright-report/**", "test-results/**", "next-env.d.ts"] },
];
