import { describe, expect, it, vi } from "vitest";

import { DisposableStore, MutableDisposable, subscribe } from "./disposableStore";

describe("DisposableStore", () => {
    it("runs disposers in reverse-registration order", () => {
        const order: number[] = [];
        const store = new DisposableStore();
        store.add(() => order.push(1));
        store.add(() => order.push(2));
        store.add(() => order.push(3));

        store.dispose();

        expect(order).toEqual([3, 2, 1]);
    });

    it("reports isDisposed only after dispose", () => {
        const store = new DisposableStore();
        expect(store.isDisposed).toBe(false);
        store.dispose();
        expect(store.isDisposed).toBe(true);
    });

    it("is idempotent — a second dispose runs nothing", () => {
        const disposer = vi.fn();
        const store = new DisposableStore();
        store.add(disposer);

        store.dispose();
        store.dispose();

        expect(disposer).toHaveBeenCalledTimes(1);
    });

    it("runs every disposer even when one throws, rethrowing the first error hit", () => {
        const later = vi.fn();
        const store = new DisposableStore();
        // Disposal is LIFO, so the last-registered thrower runs first and its
        // error is the one propagated.
        const boom = new Error("boom");
        store.add(later);
        store.add(() => {
            throw new Error("earlier-registered");
        });
        store.add(() => {
            throw boom;
        });

        expect(() => store.dispose()).toThrow(boom);
        expect(later).toHaveBeenCalledTimes(1);
    });

    it("runs a late add immediately after disposal, in reverse order", () => {
        const order: number[] = [];
        const store = new DisposableStore();
        store.dispose();

        store.add(
            () => order.push(1),
            () => order.push(2),
        );

        expect(order).toEqual([2, 1]);
    });
});

describe("MutableDisposable", () => {
    it("disposes the previous entry when a new one is set", () => {
        const first = vi.fn();
        const second = vi.fn();
        const mutable = new MutableDisposable();

        mutable.set(first);
        expect(first).not.toHaveBeenCalled();

        mutable.set(second);
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).not.toHaveBeenCalled();
    });

    it("clears the entry when set to undefined", () => {
        const first = vi.fn();
        const mutable = new MutableDisposable();
        mutable.set(first);
        mutable.set(undefined);

        mutable.dispose();

        expect(first).toHaveBeenCalledTimes(1);
    });

    it("disposes the current entry on dispose", () => {
        const disposer = vi.fn();
        const mutable = new MutableDisposable();
        mutable.set(disposer);

        mutable.dispose();

        expect(disposer).toHaveBeenCalledTimes(1);
    });

    it("runs a disposer set after disposal immediately", () => {
        const disposer = vi.fn();
        const mutable = new MutableDisposable();
        mutable.dispose();

        mutable.set(disposer);

        expect(disposer).toHaveBeenCalledTimes(1);
    });
});

describe("subscribe", () => {
    it("subscribes on call and unsubscribes on dispose", () => {
        const on = vi.fn();
        const off = vi.fn();
        const handler = () => undefined;

        const dispose = subscribe({ on, off }, "commandStack.changed", handler);

        expect(on).toHaveBeenCalledWith("commandStack.changed", handler);
        expect(off).not.toHaveBeenCalled();

        dispose();

        expect(off).toHaveBeenCalledWith("commandStack.changed", handler);
    });
});
