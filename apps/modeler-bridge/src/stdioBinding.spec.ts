import { describe, expect, it } from "vitest";

import { settle } from "./__fixtures__/bridgeHarness";
import { Rpc } from "./rpc";
import { coreLogText, createStdinEndHandler, createStdinHandler } from "./stdioBinding";

function errorWithStack(message: string, stack: string | undefined): Error {
    const error = new Error(message);
    if (stack === undefined) delete error.stack;
    else error.stack = stack;
    return error;
}

/** Feeds one frame to a stdin handler whose every frame fails with `failure`; returns stderr. */
async function stderrAfterFailedFrame(failure: unknown): Promise<string> {
    const stderr: string[] = [];
    const handleChunk = createStdinHandler({ handleLine: () => Promise.reject(failure) }, (text) =>
        stderr.push(text),
    );

    handleChunk('{"method":"session/register"}\n');
    await settle();

    return stderr.join("");
}

describe("coreLogText", () => {
    it.each([
        {
            case: "a one-line message",
            message: "session registered: file:///a.bpmn",
            logged: "[core] session registered: file:///a.bpmn\n",
        },
        {
            case: "every line of a stack",
            message: "Error: boom\n    at handle (rpc.ts:1:1)",
            logged: "[core] Error: boom\n[core]     at handle (rpc.ts:1:1)\n",
        },
        {
            case: "every line the host splits at a carriage return",
            message: "first\r\nsecond\rthird",
            logged: "[core] first\n[core] second\n[core] third\n",
        },
    ])("tags $case", ({ message, logged }) => {
        expect(coreLogText(message)).toBe(logged);
    });
});

describe("createStdinHandler", () => {
    it("logs a frame that fails past its handlers with the stack", async () => {
        const failure = errorWithStack("boom", "Error: boom\n    at handle (rpc.ts:1:1)");

        expect(await stderrAfterFailedFrame(failure)).toBe(
            "[core] handler error: Error: boom\n[core]     at handle (rpc.ts:1:1)\n",
        );
    });

    it.each([
        { case: "name and message without a stack", failure: errorWithStack("bad", undefined) },
        {
            case: "the subclass name without a stack",
            failure: Object.assign(new TypeError("bad"), { stack: undefined }),
        },
    ])("logs $case", async ({ failure }) => {
        expect(await stderrAfterFailedFrame(failure)).toBe(
            `[core] handler error: ${failure.name}: bad\n`,
        );
    });

    it("logs a thrown string as text", async () => {
        expect(await stderrAfterFailedFrame("boom")).toBe("[core] handler error: boom\n");
    });

    it("logs a frame that is not JSON and keeps reading the next frames", async () => {
        const stderr: string[] = [];
        const frames: string[] = [];
        const rpc = new Rpc((line) => frames.push(line));
        rpc.on("ping", () => "pong");
        const handleChunk = createStdinHandler(rpc, (text) => stderr.push(text));

        handleChunk('{not json\n{"method":"ping","id":1}\n');
        await settle();

        const loggedLines = stderr.join("").split("\n").slice(0, -1);
        expect(loggedLines[0]).toMatch(/^\[core\] handler error: SyntaxError: /);
        expect(loggedLines.every((line) => line.startsWith("[core] "))).toBe(true);
        expect(frames).toEqual([JSON.stringify({ id: 1, result: "pong" })]);
    });
});

describe("createStdinEndHandler", () => {
    it("fails the requests the host can no longer answer, then exits", () => {
        const steps: string[] = [];
        const handleEnd = createStdinEndHandler(
            { handleEnd: () => steps.push("fail requests") },
            () => steps.push("exit"),
        );

        handleEnd();

        expect(steps).toEqual(["fail requests", "exit"]);
    });
});
