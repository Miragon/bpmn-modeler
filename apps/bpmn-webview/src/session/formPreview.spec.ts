import { afterEach, describe, expect, it, vi } from "vitest";
import type { FormPreviewReply } from "@miragon/bpmn-modeler-shared";
import type { FormPreviewRequest } from "@miragon/bpmn-modeler";
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
afterEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
});

function request(overrides: Partial<FormPreviewRequest> = {}): FormPreviewRequest {
    return {
        id: "Form_1",
        automatic: true,
        anchor: () => ({
            canvas: { x: 0, y: 0, width: 1200, height: 800 },
            task: { x: 100, y: 100, width: 100, height: 80 },
        }),
        onVisibilityChanged: vi.fn(),
        onClose: vi.fn(),
        focusCanvas: vi.fn(),
        ...overrides,
    };
}
function setup(
    read = vi
        .fn<(id: string, automatic: boolean) => Promise<FormPreviewReply>>()
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
    return { preview: createFormPreview(read, create), read, viewers, create };
}
const panel = () =>
    document.querySelector<HTMLElement>('[role="region"][aria-label="Linked form preview"]');
const loaded = () => {
    expect(panel()).not.toBeNull();
    expect(panel()!.textContent).toContain("Saved form loaded.");
};
const click = (selector: string) => document.querySelector<HTMLButtonElement>(selector)!.click();

describe("anchored linked form preview", () => {
    it("shows nothing while resolving and silently ignores missing forms without stealing focus", async () => {
        let finish!: (result: FormPreviewReply) => void;
        const { preview } = setup(
            vi.fn(
                () =>
                    new Promise<FormPreviewReply>((resolve) => {
                        finish = resolve;
                    }),
            ),
        );
        const button = document.createElement("button");
        document.body.append(button);
        button.focus();
        preview.open(request());
        expect(panel()).toBeNull();
        expect(document.activeElement).toBe(button);
        finish({ kind: "unavailable", message: "Missing" });
        await Promise.resolve();
        await Promise.resolve();
        expect(panel()).toBeNull();
        preview.dispose();
    });
    it("constructs a read-only viewer in a nonmodal region and cancels link/submit actions", async () => {
        const opener = document.createElement("button");
        document.body.append(opener);
        opener.focus();
        const preview = createFormPreview(async () => ({ kind: "loaded", content: saved }));
        const options = request();
        preview.open(options);
        await vi.waitFor(loaded);
        expect(document.querySelector("dialog")).toBeNull();
        expect(document.activeElement).toBe(opener);
        expect(runtime.options).toHaveBeenCalledWith({
            container: expect.any(HTMLElement),
            properties: { readOnly: true },
        });
        expect(options.onVisibilityChanged).toHaveBeenCalledWith(true);
        const mount = document.querySelector(".linked-form-preview-content")!.firstElementChild!;
        for (const type of ["click", "auxclick", "submit"])
            expect(mount.dispatchEvent(new MouseEvent(type, { button: 1, cancelable: true }))).toBe(
                false,
            );
        preview.dispose();
        expect(runtime.destroy).toHaveBeenCalledOnce();
    });
    it("offers an accessible close icon, restores canvas focus only when focus was in the panel", async () => {
        const { preview } = setup();
        const options = request({ automatic: false });
        preview.open(options);
        await vi.waitFor(loaded);
        const close = document.querySelector<HTMLButtonElement>(
            '[aria-label="Close form preview"]',
        )!;
        expect(document.activeElement).toBe(close);
        close.click();
        expect(panel()).toBeNull();
        expect(options.onClose).toHaveBeenCalledOnce();
        expect(options.focusCanvas).toHaveBeenCalledOnce();
        preview.dispose();
    });
    it("rereads saved content on refresh and destroys previous viewers", async () => {
        const { preview, read, viewers } = setup();
        preview.open(request());
        await vi.waitFor(loaded);
        read.mockResolvedValue({ kind: "loaded", content: '{"components":[]}' });
        click("[data-refresh]");
        await vi.waitFor(() => expect(viewers).toHaveLength(2));
        expect(viewers[0].destroy).toHaveBeenCalledOnce();
        expect(viewers[1].importSchema).toHaveBeenCalledWith({ components: [] });
        expect(read).toHaveBeenLastCalledWith("Form_1", true);
        preview.dispose();
    });
    it.each(["invalid", '{"components":[{"type":"iframe"}]}'])(
        "does not display invalid or unsupported forms: %s",
        async (content) => {
            const { preview, create } = setup(
                vi.fn().mockResolvedValue({ kind: "loaded", content }),
            );
            preview.open(request());
            await Promise.resolve();
            await Promise.resolve();
            expect(panel()).toBeNull();
            expect(create).not.toHaveBeenCalled();
            preview.dispose();
        },
    );
    it("silently closes if refreshing a displayed form fails", async () => {
        const { preview, read } = setup();
        const options = request();
        preview.open(options);
        await vi.waitFor(loaded);
        read.mockResolvedValue({ kind: "unavailable", message: "Missing" });
        click("[data-refresh]");
        await vi.waitFor(() => expect(panel()).toBeNull());
        expect(options.onVisibilityChanged).toHaveBeenLastCalledWith(false);
        preview.dispose();
    });

    it("destroys a viewer that rejects its schema without displaying an error panel", async () => {
        const { preview, create } = setup();
        const destroy = vi.fn();
        create.mockResolvedValueOnce({
            importSchema: vi.fn().mockRejectedValue(new Error("unsupported version")),
            destroy,
        });
        preview.open(request());
        await vi.waitFor(() => expect(destroy).toHaveBeenCalledOnce());
        expect(panel()).toBeNull();
        preview.dispose();
    });
    it("discards old imports when a new selection finishes first", async () => {
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
        const old = request();
        preview.open(old);
        await vi.waitFor(() => expect(importSchema).toHaveBeenCalled());
        preview.open(request({ id: "Second" }));
        await vi.waitFor(loaded);
        finish();
        await vi.waitFor(() => expect(destroy).toHaveBeenCalledOnce());
        expect(old.onVisibilityChanged).not.toHaveBeenCalledWith(true);
        expect(document.querySelectorAll('[role="region"]')).toHaveLength(1);
        preview.dispose();
    });
    it("cancels a pending read on disposal", async () => {
        let finish!: (result: FormPreviewReply) => void;
        const { preview, create } = setup(
            vi.fn(
                () =>
                    new Promise<FormPreviewReply>((resolve) => {
                        finish = resolve;
                    }),
            ),
        );
        const handle = preview.open(request());
        handle.close();
        finish({ kind: "loaded", content: saved });
        await Promise.resolve();
        expect(create).not.toHaveBeenCalled();
        expect(panel()).toBeNull();
        preview.dispose();
    });
    it("repositions with a live task anchor without another file read", async () => {
        const { preview, read } = setup();
        let x = 100;
        const handle = preview.open(
            request({
                anchor: () => ({
                    canvas: { x: 0, y: 0, width: 1200, height: 800 },
                    task: { x, y: 100, width: 100, height: 80 },
                }),
            }),
        );
        await vi.waitFor(loaded);
        const before = panel()!.style.left;
        x = 200;
        handle.reposition();
        expect(panel()!.style.left).not.toBe(before);
        expect(read).toHaveBeenCalledOnce();
        preview.dispose();
    });
});
