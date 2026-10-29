const baseConfig = require("../../eslint.config.cjs");

module.exports = [
    {
        ignores: ["**/dist", "test/e2e/out/**"],
    },
    ...baseConfig,
    {
        files: ["**/*.ts", "**/*.tsx"],
        rules: {
            "@typescript-eslint/no-explicit-any": "warn",
            "no-fallthrough": [
                "error",
                {
                    commentPattern: "break[\\s\\w]*omitted",
                },
            ],
        },
    },
];
