import { describe, expect, it } from "vitest";

import { errorLogText, notifiedErrorLogText } from "./errorLogText";

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
    ])("prefixes the context: $logged", ({ context, error, logged }) => {
        expect(notifiedErrorLogText(context, error)).toBe(logged);
    });
});
