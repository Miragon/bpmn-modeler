import { afterEach, describe, expect, it, vi } from "vitest";
import type { FormPreviewResult } from "@miragon/bpmn-modeler-types";
import type { FormPreviewRequest } from "@miragon/bpmn-modeler";
import { createFormPreview, type PreviewViewer, type PreviewViewerFactory } from "./formPreview";
import { i18n } from "@miragon/bpmn-modeler-i18n";
import { extras } from "@miragon/bpmn-modeler-i18n-extras";

i18n.extend(extras);

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
    vi.unstubAllGlobals();
    i18n.setLanguage("en");
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
        .fn<(id: string, automatic: boolean) => Promise<FormPreviewResult>>()
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
    it("does not display a loaded form when only its chrome would fit", async () => {
        const { preview } = setup();
        let height = 300;
        const options = request({
            anchor: () => ({
                canvas: { x: 0, y: 0, width: 500, height },
                task: { x: 100, y: 60, width: 100, height: 80 },
                contextPad: { x: 210, y: 50, width: 80, height: 150 },
                obstacles: [{ x: 320, y: 60, width: 100, height: 80 }],
            }),
        });
        const handle = preview.open(options);
        await vi.waitFor(loaded);
        const node = panel()!;
        Object.defineProperty(node.querySelector("header"), "offsetHeight", { get: () => 100 });
        Object.defineProperty(node.querySelector(".linked-form-preview-content"), "scrollHeight", {
            get: () => 500,
        });
        handle.reposition();
        expect(node.hidden).toBe(true);
        expect(options.onVisibilityChanged).toHaveBeenLastCalledWith(false);
        height = 600;
        handle.reposition();
        expect(node.hidden).toBe(false);
        expect(parseFloat(node.style.maxHeight)).toBeGreaterThanOrEqual(164);
        preview.dispose();
    });
    it("retains intrinsic height while hidden instead of oscillating with zero-size measurements", () => {
        const { preview } = setup();
        const handle = preview.open(
            request({
                unavailable: true,
                anchor: () => ({
                    canvas: { x: 0, y: 0, width: 600, height: 200 },
                    task: { x: 1000, y: 100, width: 100, height: 80 },
                    obstacles: [{ x: 0, y: 70, width: 600, height: 130 }],
                }),
            }),
        );
        const node = document.querySelector<HTMLElement>(".linked-form-preview")!;
        const status = node.querySelector<HTMLElement>('[role="status"]')!;
        Object.defineProperty(status, "offsetHeight", { get: () => (node.hidden ? 0 : 140) });
        handle.reposition();
        expect(node.hidden).toBe(true);
        for (let frame = 0; frame < 5; frame++) {
            handle.reposition();
            expect(node.hidden).toBe(true);
        }
        preview.dispose();
    });
    it("coalesces observer writes into one frame and cancels queued work on close", () => {
        let resized = () => {};
        vi.stubGlobal(
            "ResizeObserver",
            class {
                constructor(callback: () => void) {
                    resized = callback;
                }
                observe = vi.fn();
                disconnect = vi.fn();
            },
        );
        const frames = new Map<number, FrameRequestCallback>();
        let next = 0;
        const schedule = vi.fn((callback: FrameRequestCallback) => {
            frames.set(++next, callback);
            return next;
        });
        const cancel = vi.fn((id: number) => frames.delete(id));
        vi.stubGlobal("requestAnimationFrame", schedule);
        vi.stubGlobal("cancelAnimationFrame", cancel);
        const { preview } = setup();
        let x = 100;
        preview.open(
            request({
                unavailable: true,
                anchor: () => ({
                    canvas: { x: 0, y: 0, width: 1200, height: 800 },
                    task: { x, y: 100, width: 100, height: 80 },
                }),
            }),
        );
        const node = document.querySelector<HTMLElement>(".linked-form-preview")!;
        const before = node.style.left;
        x = 200;
        resized();
        resized();
        expect(node.style.left).toBe(before);
        expect(schedule).toHaveBeenCalledOnce();
        const callback = frames.get(next)!;
        frames.delete(next);
        callback(0);
        expect(node.style.left).not.toBe(before);
        // Border-box feedback used to add the indicator's border on every resize.
        Object.defineProperties(node, {
            offsetHeight: { get: () => parseFloat(node.style.maxHeight) },
            clientHeight: { get: () => parseFloat(node.style.maxHeight) - 4 },
            scrollHeight: { get: () => parseFloat(node.style.maxHeight) - 4 },
        });
        const mutations = new MutationObserver(() => {});
        mutations.observe(node, { attributes: true });
        resized();
        frames.get(next)!(0);
        expect(mutations.takeRecords()).toHaveLength(0);
        mutations.disconnect();
        resized();
        preview.dispose();
        expect(cancel).toHaveBeenCalled();
    });
    it("dismisses an indicator with Escape without leaking the key to the canvas", () => {
        const { preview } = setup();
        const options = request({ unavailable: true });
        preview.open(options);
        const close = document.querySelector<HTMLButtonElement>("[data-close]")!;
        close.focus();
        const bubble = vi.fn();
        document.addEventListener("keydown", bubble);
        const event = new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
        });
        close.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(bubble).not.toHaveBeenCalled();
        expect(options.onClose).toHaveBeenCalledOnce();
        expect(options.focusCanvas).toHaveBeenCalledOnce();
        expect(document.querySelector(".linked-form-preview-indicator")).toBeNull();
        document.removeEventListener("keydown", bubble);
        preview.dispose();
    });
    it("indicates unresolved indexed references without extra reads, pickers, or focus changes", () => {
        const { preview, read, create } = setup();
        const opener = document.createElement("button");
        document.body.append(opener);
        opener.focus();
        const options = request({ unavailable: true });
        preview.open(options);
        expect(read).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
        expect(panel()).toBeNull();
        const status = document.querySelector('[role="status"]')!;
        expect(status.getAttribute("aria-live")).toBe("polite");
        expect(status.textContent).toBe(
            "The linked form is missing or invalid. Check the form reference.",
        );
        expect(document.activeElement).toBe(opener);
        i18n.setLanguage("de");
        expect(status.textContent).toBe(
            "Das verknüpfte Formular fehlt oder ist ungültig. Prüfen Sie den Formularverweis.",
        );
        click("[data-close]");
        expect(options.onClose).toHaveBeenCalledOnce();
        expect(document.querySelector('[role="status"]')).toBeNull();
        expect(options.focusCanvas).not.toHaveBeenCalled();
        preview.dispose();
    });
    it.each([
        { result: { kind: "unavailable", reason: "noScope" }, text: "Open a workspace folder" },
        { result: { kind: "unavailable", reason: "notFound" }, text: "No saved local form" },
        { result: { kind: "unavailable", reason: "ambiguous" }, text: "Multiple saved forms" },
        { result: { kind: "unavailable", reason: "unreadable" }, text: "could not be read" },
        { result: { kind: "unavailable", reason: "timeout" }, text: "host did not answer" },
        { result: { kind: "loaded", content: "bad JSON" }, text: "invalid or unsupported" },
    ] satisfies Array<{ result: FormPreviewResult; text: string }>)(
        "shows explicit $text failures with a retry control",
        async ({ result, text }) => {
            const { preview, read } = setup(vi.fn().mockResolvedValue(result));
            preview.open(request({ automatic: false }));
            await vi.waitFor(() => expect(panel()?.textContent).toContain(text));
            expect(panel()!.querySelector('[role="status"]')?.getAttribute("aria-live")).toBe(
                "polite",
            );
            read.mockResolvedValue({ kind: "loaded", content: saved });
            click("[data-refresh]");
            await vi.waitFor(loaded);
            preview.dispose();
        },
    );
    it("shows import failures for explicit attempts and retries", async () => {
        const { preview, create } = setup();
        create.mockResolvedValueOnce({
            importSchema: vi.fn().mockRejectedValue(new Error("unsupported version")),
            destroy: vi.fn(),
        });
        preview.open(request({ automatic: false }));
        await vi.waitFor(() => expect(panel()?.textContent).toContain("could not be loaded"));
        click("[data-refresh]");
        await vi.waitFor(loaded);
        preview.dispose();
    });
    it("shows automatic malformed JSON failures as an accessible nonblocking indicator", async () => {
        const log = vi.fn();
        const preview = createFormPreview(
            async () => ({ kind: "loaded", content: "bad JSON" }),
            undefined,
            log,
        );
        preview.open(request());
        await vi.waitFor(() =>
            expect(log).toHaveBeenCalledWith(expect.stringContaining("not valid JSON")),
        );
        expect(panel()).toBeNull();
        const indicator = document.querySelector(".linked-form-preview-indicator");
        expect(
            indicator?.querySelector('[role="status"][aria-live="polite"]')?.textContent,
        ).toContain("invalid or unsupported");
        expect(indicator?.querySelector<HTMLButtonElement>("[data-refresh]")?.hidden).toBe(true);
        expect(indicator?.querySelector("[data-close]")?.getAttribute("aria-label")).toBe(
            "Close form preview",
        );
        preview.dispose();
    });
    it("translates live labels and error states and releases its locale listener", async () => {
        const subscription = vi.spyOn(i18n, "onChange");
        const { preview } = setup(
            vi.fn().mockResolvedValue({ kind: "unavailable", reason: "timeout" }),
        );
        preview.open(request({ automatic: false }));
        await vi.waitFor(() => expect(panel()?.textContent).toContain("host did not answer"));
        const node = panel()!;
        i18n.setLanguage("de");
        expect(node.getAttribute("aria-label")).toBe("Vorschau des verknüpften Formulars");
        expect(node.textContent).toContain("Der Host hat nicht geantwortet.");
        expect(node.querySelector("[data-close]")?.getAttribute("aria-label")).toBe(
            "Formularvorschau schließen",
        );
        expect(node.querySelector("[data-refresh]")?.textContent).toBe("Aktualisieren");
        expect(subscription).toHaveBeenCalledOnce();
        preview.dispose();
        i18n.setLanguage("fr");
        expect(node.getAttribute("aria-label")).toBe("Vorschau des verknüpften Formulars");
        subscription.mockRestore();
    });
    it("treats picker cancellation as quiet, not an error", async () => {
        const log = vi.fn();
        const preview = createFormPreview(async () => ({ kind: "cancelled" }), undefined, log);
        preview.open(request({ automatic: false }));
        await Promise.resolve();
        await Promise.resolve();
        expect(panel()).toBeNull();
        expect(log).not.toHaveBeenCalled();
        preview.dispose();
    });
    it("keeps a cancelled refresh quiet and retryable without stale successful content", async () => {
        const { preview, read, viewers } = setup();
        preview.open(request());
        await vi.waitFor(loaded);
        const region = panel()!;
        const refresh = region.querySelector<HTMLButtonElement>("[data-refresh]")!;
        refresh.focus();
        read.mockResolvedValue({ kind: "cancelled" });
        refresh.click();
        await vi.waitFor(() => expect(region.getAttribute("aria-busy")).toBe("false"));
        expect(panel()).toBe(region);
        expect(region.querySelector('[role="status"]')!.textContent).toBe("");
        expect(region.querySelector(".linked-form-preview-content")!.children).toHaveLength(0);
        expect(viewers[0].destroy).toHaveBeenCalledOnce();
        expect(document.activeElement).toBe(refresh);
        read.mockResolvedValue({ kind: "loaded", content: saved });
        refresh.click();
        await vi.waitFor(loaded);
        preview.dispose();
    });
    it("shows nothing while resolving then indicates missing forms without stealing focus", async () => {
        let finish!: (result: FormPreviewResult) => void;
        const { preview } = setup(
            vi.fn(
                () =>
                    new Promise<FormPreviewResult>((resolve) => {
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
        finish({ kind: "unavailable", reason: "notFound" });
        await Promise.resolve();
        await Promise.resolve();
        expect(panel()).toBeNull();
        expect(document.querySelector('[role="status"]')?.textContent).toContain(
            "No saved local form",
        );
        expect(document.activeElement).toBe(button);
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
        expect(read).toHaveBeenLastCalledWith("Form_1", false);
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
            expect(document.querySelector('[role="status"]')?.textContent).toContain(
                "invalid or unsupported",
            );
            expect(create).not.toHaveBeenCalled();
            preview.dispose();
        },
    );
    it("keeps explicit refresh errors retryable without stale content", async () => {
        const { preview, read } = setup();
        const options = request({ onExplicitRequest: vi.fn() });
        preview.open(options);
        await vi.waitFor(loaded);
        read.mockResolvedValue({ kind: "unavailable", reason: "unreadable" });
        const refresh = document.querySelector<HTMLButtonElement>("[data-refresh]")!;
        refresh.focus();
        click("[data-refresh]");
        expect(options.onExplicitRequest).toHaveBeenCalledOnce();
        await vi.waitFor(() => expect(panel()?.textContent).toContain("could not be read"));
        expect(document.activeElement).toBe(refresh);
        expect(document.querySelector(".linked-form-preview-content")?.children).toHaveLength(0);
        read.mockResolvedValue({ kind: "loaded", content: saved });
        click("[data-refresh]");
        await vi.waitFor(loaded);
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
        expect(document.querySelector('[role="status"]')?.textContent).toContain(
            "could not be loaded",
        );
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
    it("does not replace a newer successful preview with a stale automatic failure indicator", async () => {
        const { preview, create } = setup();
        let reject!: (error: Error) => void;
        const destroy = vi.fn();
        const importSchema = vi.fn(
            () =>
                new Promise<void>((_resolve, fail) => {
                    reject = fail;
                }),
        );
        create.mockResolvedValueOnce({ importSchema, destroy });
        preview.open(request());
        await vi.waitFor(() => expect(importSchema).toHaveBeenCalledOnce());
        preview.open(request({ id: "New" }));
        await vi.waitFor(loaded);
        reject(new Error("old invalid schema"));
        await vi.waitFor(() => expect(destroy).toHaveBeenCalledOnce());
        loaded();
        expect(document.querySelector(".linked-form-preview-indicator")).toBeNull();
        preview.dispose();
    });
    it("cancels a pending read on disposal", async () => {
        let finish!: (result: FormPreviewResult) => void;
        const { preview, create } = setup(
            vi.fn(
                () =>
                    new Promise<FormPreviewResult>((resolve) => {
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
