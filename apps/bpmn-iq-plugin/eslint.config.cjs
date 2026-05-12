const baseConfig = require("../../eslint.config.cjs");

module.exports = [
    {
        ignores: ["**/dist"],
    },
    ...baseConfig,
    {
        files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
        rules: {},
    },
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
    {
        files: ["**/*.js", "**/*.jsx"],
        rules: {},
    },
];
