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
            "**/src-gen",
            "**/plugins",
            "**/gen-webpack*.js",
            "**/.browser_modules",
            "docs/**",
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
            ".github/scripts/**/*.mjs",
            "apps/standalone/scripts/**/*.mjs",
            "libs/standalone-extension/scripts/**/*.mjs",
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
    // Must come last: turns off ESLint rules that would conflict with Prettier.
    eslintConfigPrettier,
];
