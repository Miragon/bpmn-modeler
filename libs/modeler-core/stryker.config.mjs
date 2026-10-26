export default {
    testRunner: "vitest",
    vitest: { configFile: "vitest.config.ts", related: true },
    mutate: ["src/**/domain/**/*.ts", "!src/**/*.{spec,test}.ts"],
    // vitest.config.ts imports ../../vitest.shared, which a sandbox copy of this workspace cannot reach.
    inPlace: true,
    // Module-level tables (e.g. scriptApi.ts) would rerun every spec for each static mutant.
    ignoreStatic: true,
    incremental: true,
    incrementalFile: "reports/mutation/incremental.json",
    reporters: ["clear-text", "progress", "html", "json"],
    htmlReporter: { fileName: "reports/mutation/index.html" },
    jsonReporter: { fileName: "reports/mutation/mutation.json" },
    thresholds: { high: 80, low: 60, break: null },
};
