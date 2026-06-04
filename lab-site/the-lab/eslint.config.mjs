// Flat ESLint config. eslint-config-next 16 ships native flat configs, so we
// spread its core-web-vitals array directly — no @eslint/eslintrc FlatCompat
// shim (which is incompatible with the flat-native config and crashed).
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
    {
        // "Hack the Lab" CTF zones are intentionally non-standard game content
        // (CLAUDE.md §14) — exempt from our lint standards so the gate enforces on
        // real app code only. Do not hold planted game content to these rules.
        ignores: [
            "src/app/dashboard/activities/holodeck/**",
            "src/app/dashboard/activities/terminal/**",
            "src/app/components/holodeck/**",
            "src/app/components/arcade/**",
            "src/app/api/v1/holodeck/**",
            "src/app/api/v1/arcade/**",
        ],
    },
    ...nextCoreWebVitals,
    {
        // config-next 16 turns on the new React Compiler hook rules
        // (eslint-plugin-react-hooks v6). Adopting React Compiler linting is a
        // separate, deliberate effort (hundreds of findings, needs code changes),
        // so keep them off here to preserve the prior lint surface — this PR is a
        // config-format migration, not a rule-set change. Re-enable under its own
        // work item alongside the lint-debt cleanup (#53).
        rules: {
            "react-hooks/immutability": "off",
            "react-hooks/set-state-in-effect": "off",
            "react-hooks/static-components": "off",
            "react-hooks/purity": "off",
            "react-hooks/preserve-manual-memoization": "off",
            "react-hooks/incompatible-library": "off",
        },
    },
];

export default eslintConfig;
