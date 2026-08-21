const { FlatCompat } = require("@eslint/eslintrc");
const js = require("@eslint/js");
const globals = require("globals");
const typescriptEslintEslintPlugin = require("@typescript-eslint/eslint-plugin");
const eslintConfigPrettier = require("eslint-config-prettier/flat");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
});

module.exports = [
    {
        ignores: [
            "**/dist",
            "**/lib",
            // Gradle output (e.g. the IntelliJ plugin). Stages minified webview
            // bundles under `build/**/webview/`; linting those one-line files
            // emits tens of thousands of spurious errors. Flat config ignores
            // `.gitignore`, so it must be excluded here explicitly.
            "**/build",
            "**/src-gen",
            "**/plugins",
            "**/gen-webpack*.js",
            "**/.browser_modules",
            "docs/**",
            // Sample workspaces shipped for manual testing (e.g. the example
            // bpmnlint plugin) — CommonJS content users copy, not repo source.
            "resources/**",
            // Compiled Extension-Host e2e tests — generated CommonJS, not source.
            "apps/vscode-plugin/test/e2e/out/**",
            // The @vscode/test-electron download — the entire VS Code app. Lives
            // here after a local `test:e2e` run; linting it explodes the heap and
            // emits 500k+ spurious errors. Flat config ignores `.gitignore`, so
            // it must be excluded here explicitly.
            "**/.vscode-test/**",
        ],
    },
    {
        plugins: {
            "@typescript-eslint": typescriptEslintEslintPlugin,
        },
    },
    // Node.js globals for CommonJS config and build files
    {
        files: ["**/*.cjs", "**/webpack.config.js", "apps/standalone/scripts/**/*.js"],
        languageOptions: {
            sourceType: "commonjs",
            globals: {
                ...globals.node,
            },
        },
    },
    // Node.js globals for ESM scripts (e.g. CI helper scripts)
    {
        files: [
            "scripts/**/*.mjs",
            ".github/scripts/**/*.mjs",
            "apps/standalone/scripts/**/*.mjs",
            "libs/standalone-extension/scripts/**/*.mjs",
            "apps/demo-webapp/serve-demo.mjs",
        ],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
    ...compat
        .config({
            extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
        })
        .map((config) => ({
            ...config,
            files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.vue"],
            rules: {
                ...config.rules,
                "@typescript-eslint/no-empty-function": [
                    "error",
                    {
                        allow: ["arrowFunctions"],
                    },
                ],
                "@typescript-eslint/no-unused-vars": [
                    "error",
                    {
                        argsIgnorePattern: "^_",
                        varsIgnorePattern: "^_",
                    },
                ],
            },
            languageOptions: {
                parserOptions: {
                    project: ["tsconfig.*?.json"],
                },
            },
        })),
    ...compat
        .config({
            extends: ["plugin:@typescript-eslint/recommended"],
        })
        .map((config) => ({
            ...config,
            files: ["**/*.ts", "**/*.tsx", "**/*.cts", "**/*.mts"],
            rules: {
                ...config.rules,
                "@typescript-eslint/no-explicit-any": "warn",
            },
        })),
    ...compat
        .config({
            extends: ["eslint:recommended"],
        })
        .map((config) => ({
            ...config,
            files: ["**/*.js", "**/*.jsx", "**/*.cjs", "**/*.mjs"],
            rules: {
                ...config.rules,
            },
        })),
    // Disable TS-specific rules that don't apply to CommonJS build/config files
    {
        files: ["**/*.cjs", "**/webpack.config.js", "apps/standalone/scripts/**/*.js"],
        rules: {
            "@typescript-eslint/no-require-imports": "off",
        },
    },
    // Public-API barrel guardrail (BND-PUBLIC-API-BARREL): code must reach the
    // shared i18n library and the local overlay only through their package
    // entry points, never deep-import their `languages/**` internals. The
    // curated barrels are the single seam; deep imports couple callers to locale
    // internals and defeat the parity guardrails. Scoped to exclude the overlay
    // package itself, whose internal relative imports are legitimate.
    {
        files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.vue"],
        ignores: ["libs/bpmn-i18n-extras/**"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: [
                                "@miragon/bpmn-modeler-i18n/*",
                                "@miragon/bpmn-modeler-i18n-extras/*",
                                "**/bpmn-i18n-extras/src/languages",
                                "**/bpmn-i18n-extras/src/languages/**",
                            ],
                            message:
                                "Import from the '@miragon/bpmn-modeler-i18n' / '@miragon/bpmn-modeler-i18n-extras' barrels only; languages/** internals are private (BND-PUBLIC-API-BARREL).",
                        },
                    ],
                },
            ],
        },
    },
    // Must come last: turns off ESLint rules that would conflict with Prettier.
    eslintConfigPrettier,
];
