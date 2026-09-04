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
            // Unanchored on purpose: the nested apps/vscode-plugin config reuses
            // this list with its own base path, where a repo-rooted path never
            // matches.
            "**/test/e2e/out/**",
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
            "packages/*/scripts/**/*.mjs",
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
    // Protocol-boundary guardrail (BND-PROTOCOL-PRIVATE): the publishable
    // libraries and the remaining webview `app/` feature layer (dmn, #1293 /
    // #1371) may import the public `@miragon/bpmn-modeler-types` package, but
    // never the private `@miragon/bpmn-modeler-shared` protocol package
    // (Query/Command bases, `HostApi`, document-flush plumbing). The types
    // package itself is included so it can never depend on the protocol side,
    // keeping the split acyclic.
    //
    // The bpmn-webview adapter root (`apps/bpmn-webview/src/**`) is deliberately
    // absent: #1377 made it a thin host layer that speaks the protocol by
    // design. AC3 (protocol types reach only the adapter + hosts) is carried by
    // the rule's libs/packages coverage plus `packages/bpmn-modeler/src/
    // architecture.spec.ts`, which forbids the package from naming the protocol.
    {
        files: [
            "libs/modeler-types/**",
            "libs/append-menu/**",
            "libs/bpmn-clipboard/**",
            "libs/code-link/**",
            "libs/element-template-chooser/**",
            "libs/inline-scripting/**",
            "libs/properties-panel/**",
            "libs/model-navigation/**",
            "libs/flow-navigation/**",
            "packages/bpmn-modeler/**",
            "apps/dmn-webview/src/app/**",
        ],
        // Host-adapter layer inside dmn `app/` still speaks the protocol; it is
        // relocated out of the publishable boundary in a follow-up. Exempt until then.
        ignores: ["apps/dmn-webview/src/app/host.ts", "apps/dmn-webview/src/app/state.ts"],
        rules: {
            // This block wins `no-restricted-imports` for its files (ESLint flat
            // config replaces, not merges, a rule's options on the last match), so
            // the BND-PUBLIC-API-BARREL i18n patterns are repeated here to keep
            // that guard active for the guarded libs too.
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: [
                                "@miragon/bpmn-modeler-shared",
                                "@miragon/bpmn-modeler-shared/*",
                            ],
                            message:
                                "Import public types/utilities from '@miragon/bpmn-modeler-types'; the '@miragon/bpmn-modeler-shared' host protocol (Query/Command/HostApi) is private to the bootstrap/host layers (BND-PROTOCOL-PRIVATE).",
                        },
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
