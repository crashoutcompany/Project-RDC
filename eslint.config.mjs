// shared:eslint-config v1
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    "prisma/generated/**",
    "scripts/.venv/**",
    "scripts/cache/**",
    ".cursor/dev/**",
  ]),
]);

export default eslintConfig;
