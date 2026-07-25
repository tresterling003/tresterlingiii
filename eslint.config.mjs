import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const adminClaimIsolationRule = {
  files: ["app/admin/**/*.{ts,tsx}", "app/api/admin/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@/lib/db/claims",
            message:
              "Admin code must never read claim/purchase data. This module is family-side only.",
          },
          {
            name: "@/lib/db/family-gifts",
            message:
              "Admin code must never read claim/purchase data. This module is family-side only.",
          },
        ],
      },
    ],
  },
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  adminClaimIsolationRule,
  {
    ignores: [".next/**", "node_modules/**"],
  },
];

export default eslintConfig;
