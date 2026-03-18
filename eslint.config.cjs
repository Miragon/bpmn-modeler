const { FlatCompat } = require("@eslint/eslintrc");
const js = require("@eslint/js");
const globals = require("globals");
const typescriptEslintEslintPlugin = require("@typescript-eslint/eslint-plugin");
const stylisticEslintPlugin = require("@stylistic/eslint-plugin");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
});

module.exports = [
    {
        ignores: ["**/dist"],
    },
    {
        plugins: {
            "@typescript-eslint": typescriptEslintEslintPlugin,
            "@stylistic": stylisticEslintPlugin,
        },
    },
    // Node.js globals for CommonJS config and build files
    {
        files: ["**/*.cjs", "**/webpack.config.js"],
        languageOptions: {
            sourceType: "commonjs",
            globals: {
                ...globals.node,
            },
        },
    },
    // Node.js globals for ESM scripts (e.g. CI helper scripts)
    {
        files: [".github/scripts/**/*.mjs"],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
    ...compat
        .config({
            extends: [
                "eslint:recommended",
                "plugin:@typescript-eslint/recommended",
            ],
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
    {
        files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx", "**/*.vue"],
        rules: {
            ...stylisticEslintPlugin.configs["recommended"].rules,
            "@stylistic/quotes": [
                "error",
                "double",
                {
                    allowTemplateLiterals: "always",
                },
            ],
            "@stylistic/lines-between-class-members": ["error", "always"],
            "@stylistic/padded-blocks": [
                "error",
                {
                    blocks: "never",
                    classes: "never",
                    switches: "never",
                },
            ],
            "@stylistic/indent": "off",
            "@stylistic/semi": ["error", "always"],
            "@stylistic/operator-linebreak": "off",
            "@stylistic/arrow-parens": ["error", "always"],
            "@stylistic/member-delimiter-style": [
                "error",
                {
                    multiline: {
                        delimiter: "semi",
                        requireLast: true,
                    },
                    singleline: {
                        delimiter: "semi",
                        requireLast: false,
                    },
                },
            ],
            "@stylistic/brace-style": "off",
            "@stylistic/indent-binary-ops": "off",
        },
    },
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
                "import/no-extraneous-dependencies": "off",
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
        files: ["**/*.cjs", "**/webpack.config.js"],
        rules: {
            "@typescript-eslint/no-require-imports": "off",
        },
    },
];
