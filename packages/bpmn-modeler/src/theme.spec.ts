import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Page theme controller. The module is a page singleton (a `currentMode`
 * plus one live `prefers-color-scheme` listener), so each test reloads it via
 * `vi.resetModules()` to start from the initial `"automatic"` state. Because the
 * initial mode is already `"automatic"`, the same-mode guard means a fresh
 * `setThemeMode("automatic")` is a no-op — every automatic assertion therefore
 * transitions through a forced mode first, exactly as a real host would.
 */

const THEME_BASE = "http://localhost/assets/";

function setThemeLink(css: "lightTheme.css" | "darkTheme.css"): HTMLLinkElement {
    const link = document.createElement("link");
    link.id = "theme-link";
    link.rel = "stylesheet";
    link.href = THEME_BASE + css;
    document.head.appendChild(link);
    return link;
}

function currentCss(link: HTMLLinkElement): string {
    return link.href.split("/").pop()!;
}

/**
 * Minimal `window.matchMedia` stub: a single controllable `matches` flag plus a
 * `change`-listener registry so a test can emit a live OS/browser theme switch.
 */
function stubMatchMedia(initialDark: boolean) {
    let matches = initialDark;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const mql = {
        get matches() {
            return matches;
        },
        media: "(prefers-color-scheme: dark)",
        addEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void) =>
            listeners.add(cb),
        removeEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void) =>
            listeners.delete(cb),
    };
    window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
    return {
        emit(dark: boolean): void {
            matches = dark;
            listeners.forEach((cb) => cb({ matches: dark } as MediaQueryListEvent));
        },
        listenerCount: () => listeners.size,
    };
}

async function loadTheme() {
    vi.resetModules();
    return import("./theme");
}

describe("setThemeMode", () => {
    beforeEach(() => {
        document.head.innerHTML = "";
        document.body.innerHTML = "";
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("forces the dark stylesheet", async () => {
        const link = setThemeLink("lightTheme.css");
        stubMatchMedia(false);
        const { setThemeMode } = await loadTheme();

        setThemeMode("dark");

        expect(currentCss(link)).toBe("darkTheme.css");
    });

    it("forces the light stylesheet back from dark", async () => {
        const link = setThemeLink("darkTheme.css");
        stubMatchMedia(false);
        const { setThemeMode } = await loadTheme();

        setThemeMode("light");

        expect(currentCss(link)).toBe("lightTheme.css");
    });

    it("automatic applies the current prefers-color-scheme", async () => {
        const link = setThemeLink("lightTheme.css");
        stubMatchMedia(true);
        const { setThemeMode } = await loadTheme();

        setThemeMode("light");
        setThemeMode("automatic");

        expect(currentCss(link)).toBe("darkTheme.css");
    });

    it("automatic reacts to a live scheme change", async () => {
        const link = setThemeLink("lightTheme.css");
        const media = stubMatchMedia(false);
        const { setThemeMode } = await loadTheme();

        setThemeMode("light");
        setThemeMode("automatic");
        expect(currentCss(link)).toBe("lightTheme.css");

        media.emit(true);
        expect(currentCss(link)).toBe("darkTheme.css");
    });

    it("a forced mode detaches the scheme listener and stops reacting", async () => {
        const link = setThemeLink("lightTheme.css");
        const media = stubMatchMedia(false);
        const { setThemeMode } = await loadTheme();

        setThemeMode("light");
        setThemeMode("automatic");
        setThemeMode("light");

        expect(media.listenerCount()).toBe(0);
        media.emit(true);
        expect(currentCss(link)).toBe("lightTheme.css");
    });

    it("logs and does not throw when #theme-link is missing", async () => {
        stubMatchMedia(false);
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const { setThemeMode } = await loadTheme();

        expect(() => setThemeMode("dark")).not.toThrow();
        expect(error).toHaveBeenCalled();
    });
});
