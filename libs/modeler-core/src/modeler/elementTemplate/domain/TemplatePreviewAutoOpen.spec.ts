import { describe, expect, it } from "vitest";

import { ShownTemplate, TemplatePreviewAutoOpen } from "./TemplatePreviewAutoOpen";

const FILE = "file:///work/status.json";

function shown(overrides: Partial<ShownTemplate> = {}): ShownTemplate {
    return {
        file: FILE,
        isLocalFile: true,
        inEditorArea: true,
        isDiff: false,
        enabled: true,
        hasPreview: false,
        ...overrides,
    };
}

describe("TemplatePreviewAutoOpen", () => {
    it("opens the preview the first time a template is shown", () => {
        expect(new TemplatePreviewAutoOpen().onShown(shown())).toBe("open");
    });

    it.each<[string, Partial<ShownTemplate>]>([
        ["a file from git", { isLocalFile: false }],
        ["an editor outside the editor area", { inEditorArea: false }],
        ["a diff", { isDiff: true }],
        ["a user who turned it off", { enabled: false }],
        ["a file that has a preview", { hasPreview: true }],
    ])("skips %s", (_, facts) => {
        expect(new TemplatePreviewAutoOpen().onShown(shown(facts))).toBe("skip");
    });

    it("opens each file once while it stays open", () => {
        const autoOpen = new TemplatePreviewAutoOpen();

        const decisions = [
            autoOpen.onShown(shown()),
            autoOpen.onShown(shown()),
            autoOpen.onShown(shown({ file: "file:///work/other.json" })),
        ];

        expect(decisions).toEqual(["open", "skip", "open"]);
    });

    it.each<[string, Partial<ShownTemplate>]>([
        ["turned off", { enabled: false }],
        ["already has a preview", { hasPreview: true }],
    ])("does not come back to a file that was %s when first shown", (_, facts) => {
        const autoOpen = new TemplatePreviewAutoOpen();
        autoOpen.onShown(shown(facts));

        expect(autoOpen.onShown(shown())).toBe("skip");
    });

    it.each<[string, Partial<ShownTemplate>]>([
        ["a git version", { isLocalFile: false }],
        ["a peek editor", { inEditorArea: false }],
        ["a diff", { isDiff: true }],
    ])("still opens a file that was only seen in %s before", (_, facts) => {
        const autoOpen = new TemplatePreviewAutoOpen();
        autoOpen.onShown(shown(facts));

        expect(autoOpen.onShown(shown())).toBe("open");
    });

    it("keeps a closed preview closed while another tab still shows the file", () => {
        const autoOpen = new TemplatePreviewAutoOpen();
        autoOpen.onShown(shown());

        autoOpen.onClosed(FILE, true);

        expect(autoOpen.onShown(shown())).toBe("skip");
    });

    it("opens the preview again once the file was closed everywhere", () => {
        const autoOpen = new TemplatePreviewAutoOpen();
        autoOpen.onShown(shown());

        autoOpen.onClosed(FILE, false);

        expect(autoOpen.onShown(shown())).toBe("open");
    });

    it("forgets only the file that was closed", () => {
        const other = "file:///work/other.json";
        const autoOpen = new TemplatePreviewAutoOpen();
        autoOpen.onShown(shown());
        autoOpen.onShown(shown({ file: other }));

        autoOpen.onClosed(other, false);

        expect(autoOpen.onShown(shown())).toBe("skip");
    });
});
