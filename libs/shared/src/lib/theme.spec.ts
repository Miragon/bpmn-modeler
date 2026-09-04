// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// `applyTheme` is private and module state (`currentMode`) is a singleton, so we
// exercise it through the public `setColorThemeMode` with a fresh module per
// test — a fresh module starts in `"automatic"`, so the first forced switch
// always engages instead of short-circuiting on the same-mode guard.
async function loadTheme(): Promise<typeof import("./theme")> {
    vi.resetModules();
    return import("./theme");
}

function setThemeLink(href: string): HTMLLinkElement {
    document.head.innerHTML = "";
    const link = document.createElement("link");
    link.id = "theme-link";
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
    return link;
}

describe("applyTheme href swap", () => {
    beforeEach(() => {
        document.body.className = "";
    });

    it("swaps the built filename light → dark", async () => {
        const link = setThemeLink("lightTheme.css");
        const { setColorThemeMode } = await loadTheme();

        setColorThemeMode("dark");

        expect(link.href).toMatch(/darkTheme\.css$/);
    });

    it("swaps the built filename dark → light", async () => {
        const link = setThemeLink("darkTheme.css");
        const { setColorThemeMode } = await loadTheme();

        setColorThemeMode("light");

        expect(link.href).toMatch(/lightTheme\.css$/);
    });

    it("swaps the source-style href light → dark", async () => {
        const link = setThemeLink("styles/light-theme/index.css");
        const { setColorThemeMode } = await loadTheme();

        setColorThemeMode("dark");

        expect(link.href).toMatch(/dark-theme\/index\.css$/);
    });

    it("swaps the source-style href dark → light", async () => {
        const link = setThemeLink("styles/dark-theme/index.css");
        const { setColorThemeMode } = await loadTheme();

        setColorThemeMode("light");

        expect(link.href).toMatch(/light-theme\/index\.css$/);
    });
});
