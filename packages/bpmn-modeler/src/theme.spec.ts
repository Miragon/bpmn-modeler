import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THEME_ATTRIBUTE, ThemeController } from "./theme";

/**
 * Per-instance theme controller. Each test constructs its own
 * {@link ThemeController} over plain scope roots, so there is no page-singleton
 * state to reset — unlike the old module-singleton, a fresh controller starts
 * with `mode === undefined`, which is why a first `setMode("automatic")` engages
 * rather than short-circuiting on the same-mode guard.
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

function makeRoot(): HTMLElement {
    const div = document.createElement("div");
    document.body.appendChild(div);
    return div;
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

describe("ThemeController", () => {
    beforeEach(() => {
        document.head.innerHTML = "";
        document.body.innerHTML = "";
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("forces the dark attribute on every scope root", () => {
        stubMatchMedia(false);
        const a = makeRoot();
        const b = makeRoot();
        const controller = new ThemeController([a, b]);

        controller.setMode("dark");

        expect(a.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
        expect(b.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
    });

    it("forces the light attribute back from dark", () => {
        stubMatchMedia(false);
        const root = makeRoot();
        const controller = new ThemeController([root]);

        controller.setMode("dark");
        controller.setMode("light");

        expect(root.getAttribute(THEME_ATTRIBUTE)).toBe("light");
    });

    it("engages on the first automatic call (no same-mode short-circuit)", () => {
        stubMatchMedia(true);
        const root = makeRoot();
        const controller = new ThemeController([root]);

        controller.setMode("automatic");

        expect(root.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
    });

    it("automatic reacts to a live scheme change", () => {
        const media = stubMatchMedia(false);
        const root = makeRoot();
        const controller = new ThemeController([root]);

        controller.setMode("automatic");
        expect(root.getAttribute(THEME_ATTRIBUTE)).toBe("light");

        media.emit(true);
        expect(root.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
    });

    it("a forced mode detaches the scheme listener and stops reacting", () => {
        const media = stubMatchMedia(false);
        const root = makeRoot();
        const controller = new ThemeController([root]);

        controller.setMode("automatic");
        controller.setMode("light");

        expect(media.listenerCount()).toBe(0);
        media.emit(true);
        expect(root.getAttribute(THEME_ATTRIBUTE)).toBe("light");
    });

    it("dispose detaches the listener and clears the attribute", () => {
        const media = stubMatchMedia(true);
        const root = makeRoot();
        const controller = new ThemeController([root]);

        controller.setMode("automatic");
        controller.dispose();

        expect(media.listenerCount()).toBe(0);
        expect(root.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
    });

    it("mirrors the resolved kind onto a legacy #theme-link when present", () => {
        stubMatchMedia(false);
        const link = setThemeLink("lightTheme.css");
        const controller = new ThemeController([makeRoot()]);

        controller.setMode("dark");

        expect(currentCss(link)).toBe("darkTheme.css");
    });

    it("does not throw or log when no #theme-link is present", () => {
        stubMatchMedia(false);
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const controller = new ThemeController([makeRoot()]);

        expect(() => controller.setMode("dark")).not.toThrow();
        expect(error).not.toHaveBeenCalled();
    });

    it("keeps two controllers independent", () => {
        stubMatchMedia(false);
        const a = makeRoot();
        const b = makeRoot();
        const controllerA = new ThemeController([a]);
        const controllerB = new ThemeController([b]);

        controllerA.setMode("dark");
        controllerB.setMode("light");

        expect(a.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
        expect(b.getAttribute(THEME_ATTRIBUTE)).toBe("light");
    });
});
