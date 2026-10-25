import { describe, expect, it, vi } from "vitest";
import { NoModelerError, type LintResults } from "@miragon/bpmn-modeler-types";

import type { LintConfigService } from "./bpmnlint/LintConfigService";
import { createLintHandleMethods, type LintHandleMethods } from "./lintHandle";

const RESULTS: LintResults = { "label-required": [] };

const HOST_PUSHES: Array<{
    method: keyof LintHandleMethods;
    push: (handle: LintHandleMethods) => void;
    expectedArgs: unknown[];
}> = [
    {
        method: "applyLintResults",
        push: (handle) => handle.applyLintResults(RESULTS),
        expectedArgs: [RESULTS],
    },
    {
        method: "applyLintingDisabled",
        push: (handle) => handle.applyLintingDisabled(),
        expectedArgs: [],
    },
    {
        method: "startInPageLinting",
        push: (handle) => handle.startInPageLinting({ extends: "bpmnlint:recommended" }, "v2"),
        expectedArgs: [{ extends: "bpmnlint:recommended" }, "v2"],
    },
];

function fakeLintService() {
    return {
        applyLintResults: vi.fn(),
        applyLintingDisabled: vi.fn(),
        startInPageLinting: vi.fn(),
    };
}

describe("createLintHandleMethods", () => {
    it.each(HOST_PUSHES)(
        "forwards $method to the surface's lint service",
        ({ method, push, expectedArgs }) => {
            const service = fakeLintService();
            const warn = vi.fn();
            const handle = createLintHandleMethods(
                () => service as unknown as LintConfigService,
                warn,
            );

            push(handle);

            expect(service[method]).toHaveBeenCalledExactlyOnceWith(...expectedArgs);
            expect(warn).not.toHaveBeenCalled();
        },
    );

    it.each(HOST_PUSHES)(
        "turns $method into a warning when the surface has no lint module",
        ({ method, push }) => {
            const warn = vi.fn();
            const handle = createLintHandleMethods(() => undefined, warn);

            expect(() => push(handle)).not.toThrow();
            expect(warn).toHaveBeenCalledExactlyOnceWith(
                `${method} ignored: this surface was created without a lint module`,
            );
        },
    );

    it.each(HOST_PUSHES)(
        "lets a destroyed surface's NoModelerError through from $method",
        ({ push }) => {
            const warn = vi.fn();
            const handle = createLintHandleMethods(() => {
                throw new NoModelerError();
            }, warn);

            expect(() => push(handle)).toThrow(NoModelerError);
            expect(warn).not.toHaveBeenCalled();
        },
    );
});
