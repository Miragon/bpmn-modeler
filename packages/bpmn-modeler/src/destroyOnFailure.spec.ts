import { describe, expect, it, vi } from "vitest";
import { destroyOnFailure } from "./destroyOnFailure";

describe("destroyOnFailure", () => {
    it("returns the handle without destroying it on success", async () => {
        const destroy = vi.fn();
        const handle = { destroy };

        await expect(destroyOnFailure(handle, () => {})).resolves.toBe(handle);
        expect(destroy).not.toHaveBeenCalled();
    });

    it("destroys once and rethrows the original error on a synchronous failure", async () => {
        const destroy = vi.fn();
        const error = new Error("boom");

        await expect(
            destroyOnFailure({ destroy }, () => {
                throw error;
            }),
        ).rejects.toBe(error);
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    it("destroys once and rethrows the original error on an asynchronous failure", async () => {
        const destroy = vi.fn();
        const error = new Error("boom");

        await expect(destroyOnFailure({ destroy }, () => Promise.reject(error))).rejects.toBe(
            error,
        );
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    it("surfaces the original error even when destroy also throws", async () => {
        const error = new Error("root cause");
        const destroy = vi.fn(() => {
            throw new Error("teardown failure");
        });

        await expect(
            destroyOnFailure({ destroy }, () => {
                throw error;
            }),
        ).rejects.toBe(error);
        expect(destroy).toHaveBeenCalledTimes(1);
    });
});
