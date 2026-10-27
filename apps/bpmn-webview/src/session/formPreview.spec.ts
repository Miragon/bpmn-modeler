import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FormPreviewReply } from "@miragon/bpmn-modeler-shared";
import { createFormPreview, type PreviewViewer, type PreviewViewerFactory } from "./formPreview";

const saved = JSON.stringify({ components: [{ type: "textfield", key: "name", id: "Name" }] });

const runtime = vi.hoisted(() => ({
    options: vi.fn(),
    importSchema: vi.fn().mockResolvedValue({ warnings: [] }),
    destroy: vi.fn(),
}));
vi.mock("@bpmn-io/form-js-viewer", () => ({
    Form: class {
        constructor(options: unknown) {
            runtime.options(options);
        }
        importSchema = runtime.importSchema;
        destroy = runtime.destroy;
    },
}));

beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
    };
});
afterEach(() => document.body.replaceChildren());

function setup(
    read = vi
        .fn<() => Promise<FormPreviewReply>>()
        .mockResolvedValue({ kind: "loaded", content: saved }),
) {
    const viewers: PreviewViewer[] = [];
    const create = vi.fn<PreviewViewerFactory>(async () => {
        const viewer = {
            importSchema: vi.fn().mockResolvedValue({ warnings: [] }),
            destroy: vi.fn(),
        };
        viewers.push(viewer);
        return viewer;
    });
    const preview = createFormPreview(read, create);
    return { preview, read, create, viewers };
}

const status = () => document.querySelector('[role="status"]')?.textContent;
const click = (selector: string) => document.querySelector<HTMLButtonElement>(selector)!.click();

describe("linked form preview", () => {
    it("constructs only a read-only viewer and blocks link/submit actions", async () => {
        const preview = createFormPreview(async () => ({ kind: "loaded", content: saved }));
        preview.open("Form_1");
        await vi.waitFor(() => expect(status()).toBe("Saved form loaded."));
        expect(runtime.options).toHaveBeenCalledWith({
            container: expect.any(HTMLElement),
            properties: { readOnly: true },
        });
        const mount = document.querySelector(".linked-form-preview-content")!.firstElementChild!;
        expect(mount.dispatchEvent(new Event("submit", { cancelable: true }))).toBe(false);
        expect(mount.dispatchEvent(new Event("click", { cancelable: true }))).toBe(false);
        expect(
            mount.dispatchEvent(new MouseEvent("auxclick", { button: 1, cancelable: true })),
        ).toBe(false);
        preview.dispose();
        expect(runtime.destroy).toHaveBeenCalledOnce();
    });
    it("imports fresh saved schemas on refresh and reopen and destroys the old viewer", async () => {
        const { preview, read, viewers } = setup();
        preview.open("Form_1");
        await vi.waitFor(() => expect(status()).toBe("Saved form loaded."));
        expect(viewers[0].importSchema).toHaveBeenCalledWith(JSON.parse(saved));
        read.mockResolvedValue({ kind: "loaded", content: '{"components":[]}' });
        click("[data-refresh]");
        await vi.waitFor(() => expect(viewers).toHaveLength(2));
        expect(viewers[0].destroy).toHaveBeenCalledOnce();
        expect(viewers[1].importSchema).toHaveBeenCalledWith({ components: [] });
        click("[data-close]");
        expect(viewers[1].destroy).toHaveBeenCalledOnce();
        preview.open("Form_1");
        await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(3));
        preview.dispose();
    });

    it("keeps the newest refresh when overlapping reads finish in reverse order", async () => {
        const finish: Array<(reply: FormPreviewReply) => void> = [];
        const { preview, viewers } = setup(
            vi.fn(() => new Promise<FormPreviewReply>((resolve) => finish.push(resolve))),
        );
        preview.open("Form_1");
        click("[data-refresh]");
        finish[1]({ kind: "loaded", content: '{"components":[],"id":"newest"}' });
        await vi.waitFor(() => expect(status()).toBe("Saved form loaded."));
        finish[0]({ kind: "loaded", content: '{"components":[],"id":"stale"}' });
        await Promise.resolve();
        expect(viewers).toHaveLength(1);
        expect(viewers[0].importSchema).toHaveBeenCalledWith({ components: [], id: "newest" });
        preview.dispose();
    });

    it.each([
        { kind: "unavailable", message: "Form not found." },
        { kind: "loaded", content: "invalid" },
        { kind: "loaded", content: '{"components":[{"type":"iframe"}]}' },
    ] satisfies FormPreviewReply[])(
        "shows nonblocking feedback without importing unsafe content: %j",
        async (reply) => {
            const { preview, create } = setup(vi.fn().mockResolvedValue(reply));
            preview.open("Missing");
            await vi.waitFor(() => expect(status()).not.toBe("Loading saved form…"));
            expect(status()).toMatch(/form|component/i);
            expect(create).not.toHaveBeenCalled();
            expect(document.querySelector("[data-refresh]")).not.toBeNull();
            preview.dispose();
        },
    );

    it("reports viewer import failures and allows retry", async () => {
        const { preview, create } = setup();
        const destroy = vi.fn();
        create.mockResolvedValueOnce({
            importSchema: vi.fn().mockRejectedValue(new Error("Unsupported form version.")),
            destroy,
        });
        preview.open("Form_1");
        await vi.waitFor(() => expect(status()).toBe("Unsupported form version."));
        expect(destroy).toHaveBeenCalledOnce();
        click("[data-refresh]");
        await vi.waitFor(() => expect(status()).toBe("Saved form loaded."));
        preview.dispose();
    });

    it("ignores a read finishing after close and restores keyboard focus", async () => {
        const opener = document.createElement("button");
        document.body.append(opener);
        opener.focus();
        let finish!: (reply: FormPreviewReply) => void;
        const { preview, create } = setup(
            vi.fn(
                () =>
                    new Promise<FormPreviewReply>((resolve) => {
                        finish = resolve;
                    }),
            ),
        );
        preview.open("Form_1");
        document.querySelector("dialog")!.dispatchEvent(new Event("cancel", { cancelable: true }));
        expect(document.activeElement).toBe(opener);
        finish({ kind: "loaded", content: saved });
        await Promise.resolve();
        expect(create).not.toHaveBeenCalled();
        expect(document.querySelector("dialog")).toBeNull();
    });

    it("destroys an in-flight viewer without displaying a stale result", async () => {
        const { preview, create } = setup();
        let finish!: () => void;
        const destroy = vi.fn();
        const importSchema = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve;
                }),
        );
        create.mockResolvedValueOnce({ importSchema, destroy });
        preview.open("First");
        await vi.waitFor(() => expect(importSchema).toHaveBeenCalled());
        preview.open("Second");
        await vi.waitFor(() => expect(status()).toBe("Saved form loaded."));
        finish();
        await vi.waitFor(() => expect(destroy).toHaveBeenCalledOnce());
        expect(document.querySelectorAll("dialog")).toHaveLength(1);
        preview.dispose();
    });
});
