import { describe, expect, it, vi } from "vitest";

import { createSurface } from "./createSurface";

describe("createSurface", () => {
    it("returns the allocated surface without destroying it on success", async () => {
        const destroy = vi.fn();
        const surface = { destroy };

        await expect(
            createSurface(
                () => surface,
                () => {},
            ),
        ).resolves.toBe(surface);
        expect(destroy).not.toHaveBeenCalled();
    });

    it("destroys once and rethrows on a synchronous apply failure", async () => {
        const destroy = vi.fn();
        const error = new Error("boom");

        await expect(
            createSurface(
                () => ({ destroy }),
                () => {
                    throw error;
                },
            ),
        ).rejects.toBe(error);
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    it("destroys once and rethrows on an asynchronous apply failure", async () => {
        const destroy = vi.fn();
        const error = new Error("boom");

        await expect(
            createSurface(
                () => ({ destroy }),
                () => Promise.reject(error),
            ),
        ).rejects.toBe(error);
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    it("surfaces the original error even when destroy also throws", async () => {
        const error = new Error("root cause");
        const destroy = vi.fn(() => {
            throw new Error("teardown failure");
        });

        await expect(
            createSurface(
                () => ({ destroy }),
                () => {
                    throw error;
                },
            ),
        ).rejects.toBe(error);
        expect(destroy).toHaveBeenCalledTimes(1);
    });

    it("propagates an allocation failure without calling destroy", async () => {
        const error = new Error("allocate");
        const allocate = vi.fn(() => {
            throw error;
        });

        await expect(createSurface(allocate, () => {})).rejects.toBe(error);
        expect(allocate).toHaveBeenCalledTimes(1);
    });

    it("destroys the surface when a later option phase throws", async () => {
        // Mimics the facade's init → templates → settings → theme → locale chain:
        // a throw in any phase after allocation tears the partial instance down.
        const destroy = vi.fn();
        const phases = {
            init: vi.fn(),
            templates: vi.fn(),
            settings: vi.fn(() => {
                throw new Error("settings");
            }),
            theme: vi.fn(),
        };

        await expect(
            createSurface(
                () => ({ destroy }),
                async () => {
                    await phases.init();
                    phases.templates();
                    phases.settings();
                    phases.theme();
                },
            ),
        ).rejects.toThrow("settings");
        expect(phases.init).toHaveBeenCalledTimes(1);
        expect(phases.templates).toHaveBeenCalledTimes(1);
        expect(phases.theme).not.toHaveBeenCalled();
        expect(destroy).toHaveBeenCalledTimes(1);
    });
});
