import { describe, expect, it } from "vitest";

import { errorLogText, notifiedErrorLogText, notifiedErrorToastText } from "./errorLogText";

function withStack<E extends Error>(error: E, stack: string | undefined): E {
    if (stack === undefined) delete error.stack;
    else error.stack = stack;
    return error;
}

describe("errorLogText", () => {
    it.each([
        {
            case: "the stack when there is one",
            error: withStack(new Error("bad"), "Error: bad\n    at deploy (a.ts:1:1)"),
            logged: "Error: bad\n    at deploy (a.ts:1:1)",
        },
        {
            case: "name and message without a stack",
            error: withStack(new Error("bad"), undefined),
            logged: "Error: bad",
        },
        {
            case: "the subclass name without a stack",
            error: withStack(new TypeError("bad"), undefined),
            logged: "TypeError: bad",
        },
        {
            case: "the stack without the cause",
            error: withStack(
                Object.assign(new Error("outer"), { cause: new Error("inner") }),
                "Error: outer",
            ),
            logged: "Error: outer",
        },
        {
            case: "a string as it is",
            error: "TypeError: x is undefined\n    at index.js:1:1",
            logged: "TypeError: x is undefined\n    at index.js:1:1",
        },
        { case: "another thrown value as its text", error: 404, logged: "404" },
    ])("logs $case", ({ error, logged }) => {
        expect(errorLogText(error)).toBe(logged);
    });
});

describe("notifiedErrorLogText", () => {
    it.each([
        {
            context: "While loading",
            error: withStack(new Error("kaput"), "Error: kaput\n    at load (b.ts:2:2)"),
            logged: "While loading: Error: kaput\n    at load (b.ts:2:2)",
        },
        {
            context: "Deployment failed",
            error: withStack(new RangeError("timeout"), undefined),
            logged: "Deployment failed: RangeError: timeout",
        },
        {
            context: "Failed to add marketplace.",
            error: withStack(new Error("offline"), undefined),
            logged: "Failed to add marketplace. Error: offline",
        },
        {
            context: "Could not read deployment targets:",
            error: withStack(new Error("EACCES"), undefined),
            logged: "Could not read deployment targets: Error: EACCES",
        },
        {
            context: "Reading the element templates failed",
            error: "EACCES" as unknown as Error,
            logged: "Reading the element templates failed: EACCES",
        },
    ])("prefixes the context: $logged", ({ context, error, logged }) => {
        expect(notifiedErrorLogText(context, error)).toBe(logged);
    });
});

describe("notifiedErrorToastText", () => {
    it.each([
        {
            case: "the context above the error's message",
            context: "Deployment failed",
            error: withStack(new Error("401 Unauthorized"), "Error: 401 Unauthorized\n    at a"),
            toast: "Deployment failed\n401 Unauthorized",
        },
        {
            case: "a context ending a sentence unchanged",
            context: "Failed to add marketplace.",
            error: new Error("offline"),
            toast: "Failed to add marketplace.\noffline",
        },
        {
            case: "a thrown string as it is",
            context: "Reading the element templates failed",
            error: "EACCES" as unknown as Error,
            toast: "Reading the element templates failed\nEACCES",
        },
    ])("shows $case", ({ context, error, toast }) => {
        expect(notifiedErrorToastText(context, error)).toBe(toast);
    });
});
