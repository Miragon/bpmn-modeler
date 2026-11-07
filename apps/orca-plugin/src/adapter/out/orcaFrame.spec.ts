import { installOrcaEditorStub } from "@miragon/modeler-shell/testing/orca-stub";
import { afterEach, describe, expect, it, vi } from "vitest";

import { followOrcaTheme, openOrcaSession, orcaLanguage } from "./orcaFrame";

const later = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
    Reflect.deleteProperty(window, "orca");
    Reflect.deleteProperty(window, "__modelerShellOrcaStub");
    vi.restoreAllMocks();
});

describe("openOrcaSession", () => {
    it("reads the tab and writes a change through Orca's session", async () => {
        const orca = installOrcaEditorStub({ text: "a" });
        const session = await openOrcaSession();
        expect(session.value).toBe("a");
        expect(session.readOnly).toBe(false);
        session.change("b");
        await session.flush();
        await orca.save();
        expect(orca.disk).toBe("b");
    });

    it("reports an outside write until the listener is removed", async () => {
        const orca = installOrcaEditorStub({ text: "a" });
        const session = await openOrcaSession();
        const replaced: string[] = [];
        const stop = session.onReplace((text) => replaced.push(text));
        orca.replace("agent");
        await later();
        stop();
        orca.replace("again");
        await later();
        expect(replaced).toEqual(["agent"]);
    });

    it("knows a read-only tab before anything is shown", async () => {
        installOrcaEditorStub({ text: "a", readOnly: true });
        expect((await openOrcaSession()).readOnly).toBe(true);
    });

    it("still opens where Orca offers no save request", async () => {
        installOrcaEditorStub({ text: "a" });
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const session = await openOrcaSession();
        const stop = session.onSaveRequested(() => Promise.resolve());
        expect(stop).not.toThrow();
        session.dispose();
    });

    it("throws outside an Orca editor frame", async () => {
        await expect(openOrcaSession()).rejects.toThrow(/Orca custom editor/);
    });
});

describe("followOrcaTheme", () => {
    it("applies Orca's mode now and on each change", () => {
        const orca = installOrcaEditorStub({ text: "", colorScheme: "dark" });
        const themes: string[] = [];
        const stop = followOrcaTheme((theme) => themes.push(theme));
        orca.setColorScheme("light");
        stop();
        orca.setColorScheme("dark");
        expect(themes).toEqual(["dark", "light"]);
    });

    it("starts light and follows Orca to dark", () => {
        const orca = installOrcaEditorStub({ text: "" });
        const themes: string[] = [];
        followOrcaTheme((theme) => themes.push(theme));
        orca.setColorScheme("dark");
        expect(themes).toEqual(["light", "dark"]);
    });
});

describe("orcaLanguage", () => {
    it("falls back to the system's language when Orca names none", () => {
        installOrcaEditorStub({ text: "" });
        vi.spyOn(navigator, "language", "get").mockReturnValue("de-DE");
        expect(orcaLanguage()).toBe("de");
    });
});
