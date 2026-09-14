import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default defineConfig(
  { ignores: ["dist/**", "dev-dist/**", "node_modules/**", "coverage/**"] },
  tseslint.configs.recommended,
  prettier,
);
