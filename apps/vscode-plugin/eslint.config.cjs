const baseConfig = require("../../eslint.config.cjs");

module.exports = [
    {
        ignores: ["**/dist", "test/e2e/out/**"],
    },
    ...baseConfig,
    {
        files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
        // Override or add rules here
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
        files: ["src/domain/**/*.ts", "src/service/**/*.ts"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    paths: [
                        {
                            name: "vscode",
                            message:
                                "domain/ and service/ must stay host-agnostic. Depend on a port in domain/hostPorts.ts and let an infrastructure adapter import vscode.",
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ["**/*.js", "**/*.jsx"],
        // Override or add rules here
        rules: {},
    },
];
