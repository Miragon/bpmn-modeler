const baseConfig = require("../../eslint.config.cjs");

module.exports = [
    {
        ignores: ["**/dist"],
    },
    ...baseConfig,
    {
        files: ["**/*.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "warn",
        },
    },
];
