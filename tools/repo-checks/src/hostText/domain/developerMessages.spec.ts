import { describe, expect, it } from "vitest";

import {
    type CallSite,
    developerMessageRule,
    type EnclosingCalls,
    type LoggerDeclarations,
} from "./developerMessages";

const INTELLIJ_LOGGER = "com.intellij.openapi.diagnostic.Logger";

const isTypeScriptDeveloperMessage = developerMessageRule({
    kotlin: false,
    importedSpecifiers: [],
    initializedValues: [],
});

function inCalls(...argumentOf: CallSite[]): EnclosingCalls {
    return { argumentOf };
}

function isKotlinDeveloperMessage(
    calls: EnclosingCalls,
    declarations: Partial<LoggerDeclarations> = {},
): boolean {
    return developerMessageRule({
        kotlin: true,
        importedSpecifiers: [],
        initializedValues: [],
        ...declarations,
    })(calls);
}

describe("developerMessageRule", () => {
    describe("in TypeScript", () => {
        it.each([
            { call: "log(…)", site: { construct: false, callee: "log" } },
            { call: "logError(…)", site: { construct: false, callee: "logError" } },
            {
                call: "notifier.logInfo(…)",
                site: { construct: false, callee: "logInfo", receiver: "notifier" },
            },
            { call: "new Error(…)", site: { construct: true, callee: "Error" } },
        ])("takes a developer message in an argument of $call", ({ site }) => {
            expect(isTypeScriptDeveloperMessage(inCalls(site))).toBe(true);
        });

        it.each([
            {
                call: "this.logger.warn(…)",
                site: { construct: false, callee: "warn", receiver: "logger" },
            },
            { call: "log.warn(…)", site: { construct: false, callee: "warn", receiver: "log" } },
            { call: "LOG.info(…)", site: { construct: false, callee: "info", receiver: "LOG" } },
        ])("takes no developer message in $call: no variable name makes a logger", ({ site }) => {
            expect(isTypeScriptDeveloperMessage(inCalls(site))).toBe(false);
        });

        it("takes a developer message nested anywhere inside a logging call", () => {
            const showCall: CallSite = { construct: false, callee: "format" };
            const logCall: CallSite = { construct: false, callee: "logInfo", receiver: "notifier" };

            expect(isTypeScriptDeveloperMessage(inCalls(logCall, showCall))).toBe(true);
        });

        it.each([
            { call: "login(…)", site: { construct: false, callee: "login" } },
            { call: "catalog(…)", site: { construct: false, callee: "catalog" } },
            {
                call: "a logger factory, loggerFor(…)",
                site: { construct: false, callee: "loggerFor" },
            },
            {
                call: "window.showErrorMessage(…)",
                site: { construct: false, callee: "showErrorMessage", receiver: "window" },
            },
            { call: "new TypeError(…)", site: { construct: true, callee: "TypeError" } },
            {
                call: "console.error(…): host code logs through the core's LoggerPort",
                site: { construct: false, callee: "error", receiver: "console" },
            },
            { call: "a call without a name", site: { construct: false } },
        ])("takes no developer message in an argument of $call", ({ site }) => {
            expect(isTypeScriptDeveloperMessage(inCalls(site))).toBe(false);
        });

        it("takes no developer message outside a call", () => {
            expect(isTypeScriptDeveloperMessage(inCalls())).toBe(false);
        });

        it("takes a developer message in a precondition's lambda, as in Kotlin", () => {
            expect(
                isTypeScriptDeveloperMessage({
                    argumentOf: [],
                    trailingLambdaOf: { construct: false, callee: "require" },
                }),
            ).toBe(true);
        });
    });

    describe("in Kotlin", () => {
        const logWarn: CallSite = { construct: false, callee: "warn", receiver: "log" };

        it.each([
            {
                logger: "a value the file declares from IntelliJ's Logger.getInstance(…)",
                site: logWarn,
                declarations: {
                    importedSpecifiers: [INTELLIJ_LOGGER],
                    initializedValues: [{ name: "log", initializer: "Logger.getInstance" }],
                },
            },
            {
                logger: "a companion's LOG from Logger.getInstance(…), the package imported whole",
                site: { construct: false, callee: "info", receiver: "LOG" },
                declarations: {
                    importedSpecifiers: ["com.intellij.openapi.diagnostic.*"],
                    initializedValues: [{ name: "LOG", initializer: "Logger.getInstance" }],
                },
            },
            {
                logger: "a value from the fully qualified Logger.getInstance(…)",
                site: logWarn,
                declarations: {
                    initializedValues: [
                        {
                            name: "log",
                            initializer: "com.intellij.openapi.diagnostic.Logger.getInstance",
                        },
                    ],
                },
            },
            {
                logger: "a value the file declares from IntelliJ's logger<T>()",
                site: logWarn,
                declarations: {
                    importedSpecifiers: ["com.intellij.openapi.diagnostic.logger"],
                    initializedValues: [{ name: "log", initializer: "logger" }],
                },
            },
            {
                logger: "a value from the fully qualified fileLogger()",
                site: logWarn,
                declarations: {
                    initializedValues: [
                        { name: "log", initializer: "com.intellij.openapi.diagnostic.fileLogger" },
                    ],
                },
            },
            {
                logger: "IntelliJ's thisLogger()",
                site: { construct: false, callee: "warn", receiver: "thisLogger" },
                declarations: {
                    importedSpecifiers: ["com.intellij.openapi.diagnostic.thisLogger"],
                },
            },
        ])("takes a developer message in a call on $logger", ({ site, declarations }) => {
            expect(isKotlinDeveloperMessage(inCalls(site), declarations)).toBe(true);
        });

        it.each([
            {
                logger: "a log the file does not declare from Logger.getInstance(…)",
                site: logWarn,
                declarations: { importedSpecifiers: [INTELLIJ_LOGGER] },
            },
            {
                logger: "a log from another Logger.getInstance(…) than IntelliJ's",
                site: logWarn,
                declarations: {
                    importedSpecifiers: ["org.example.Logger"],
                    initializedValues: [{ name: "log", initializer: "Logger.getInstance" }],
                },
            },
            {
                logger: "a log from a logger<T>() not imported from IntelliJ",
                site: logWarn,
                declarations: {
                    importedSpecifiers: [INTELLIJ_LOGGER],
                    initializedValues: [{ name: "log", initializer: "logger" }],
                },
            },
            {
                logger: "a thisLogger() not imported from IntelliJ, called fully qualified or not",
                site: { construct: false, callee: "warn", receiver: "thisLogger" },
                declarations: {},
            },
            {
                logger: "a function whose name starts with log, which only TypeScript's LoggerPort names",
                site: { construct: false, callee: "logInfo", receiver: "notifier" },
                declarations: {},
            },
        ])("takes no developer message in a call on $logger", ({ site, declarations }) => {
            expect(isKotlinDeveloperMessage(inCalls(site), declarations)).toBe(false);
        });

        it("takes a developer message in the arguments of a call a throw raises", () => {
            expect(
                isKotlinDeveloperMessage(
                    inCalls({ construct: false, callee: "IOException", thrown: true }),
                ),
            ).toBe(true);
        });

        it.each(["require", "check", "requireNotNull", "checkNotNull"])(
            "takes a developer message in the message lambda of Kotlin's %s(…)",
            (callee) => {
                const precondition: CallSite = { construct: false, callee };
                const format: CallSite = { construct: false, callee: "format" };

                expect(
                    isKotlinDeveloperMessage({ argumentOf: [], trailingLambdaOf: precondition }),
                ).toBe(true);
                expect(
                    isKotlinDeveloperMessage({
                        argumentOf: [format],
                        trailingLambdaOf: precondition,
                    }),
                ).toBe(true);
            },
        );

        it.each([
            {
                call: "the lambda of another call, logAndRethrow(log) { … }",
                calls: {
                    argumentOf: [],
                    trailingLambdaOf: { construct: false, callee: "logAndRethrow" },
                },
            },
            {
                call: "the lambda of a method named require, rules.require(…) { … }",
                calls: {
                    argumentOf: [],
                    trailingLambdaOf: { construct: false, callee: "require", receiver: "rules" },
                },
            },
            {
                call: "the parentheses of require(…)",
                calls: inCalls({ construct: false, callee: "require" }),
            },
            {
                call: "Kotlin's error(…), which the UI DSL's validation shows",
                calls: inCalls({ construct: false, callee: "error" }),
            },
        ])("takes no developer message in $call", ({ calls }) => {
            expect(isKotlinDeveloperMessage(calls)).toBe(false);
        });
    });
});
