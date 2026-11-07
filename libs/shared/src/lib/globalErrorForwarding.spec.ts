// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { installGlobalErrorForwarding } from "./globalErrorForwarding";
import type { LogErrorCommand } from "./messages";

describe("installGlobalErrorForwarding", () => {
    const post = vi.fn<(command: LogErrorCommand) => void>();
    let uninstall: (() => void) | undefined;

    afterEach(() => {
        uninstall?.();
        post.mockReset();
    });

    function rejection(reason: unknown): PromiseRejectionEvent {
        const promise = Promise.reject(reason);
        promise.catch(() => undefined);
        return new PromiseRejectionEvent("unhandledrejection", { promise, reason });
    }

    /** Every listener has seen the event once the task that dispatched it is over. */
    function afterTheDispatch(): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, 0));
    }

    it("forwards an uncaught error with its stack", async () => {
        uninstall = installGlobalErrorForwarding(post);
        const error = new Error("boom");

        window.dispatchEvent(new ErrorEvent("error", { message: "boom", error, cancelable: true }));
        await afterTheDispatch();

        expect(post).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "LogErrorCommand",
                message: "Unhandled error: boom",
                stack: error.stack,
            }),
        );
    });

    it("leaves an error that a listener registered later handled to that listener", async () => {
        uninstall = installGlobalErrorForwarding(post);
        const claim = (event: ErrorEvent) => event.preventDefault();
        window.addEventListener("error", claim);

        window.dispatchEvent(new ErrorEvent("error", { message: "claimed", cancelable: true }));
        await afterTheDispatch();
        window.removeEventListener("error", claim);

        expect(post).not.toHaveBeenCalled();
    });

    it("forwards an unhandled rejection with the error's message and stack", () => {
        uninstall = installGlobalErrorForwarding(post);
        const error = new Error("rejected");

        window.dispatchEvent(rejection(error));

        expect(post).toHaveBeenCalledWith(
            expect.objectContaining({
                message: "Unhandled promise rejection: rejected",
                stack: error.stack,
            }),
        );
    });

    it("stringifies a rejection reason that is not an Error", () => {
        uninstall = installGlobalErrorForwarding(post);

        window.dispatchEvent(rejection("plain reason"));

        expect(post).toHaveBeenCalledWith(
            expect.objectContaining({
                message: "Unhandled promise rejection: plain reason",
                stack: undefined,
            }),
        );
    });

    it("stops forwarding once uninstalled", async () => {
        installGlobalErrorForwarding(post)();

        window.dispatchEvent(new ErrorEvent("error", { message: "late" }));
        window.dispatchEvent(rejection(new Error("late")));
        await afterTheDispatch();

        expect(post).not.toHaveBeenCalled();
    });
});
