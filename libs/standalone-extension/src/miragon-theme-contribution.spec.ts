import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@theia/monaco/lib/browser/monaco-theming-service", () => ({
    MonacoThemingService: Symbol("MonacoThemingService"),
}));

import {
    MIRAGON_DARK_THEME_ID,
    MIRAGON_LIGHT_THEME_ID,
    MiragonThemeContribution,
} from "./miragon-theme-contribution";
import standalonePackage from "../../../apps/standalone/package.json";

const FIRST_RUN_KEY = "miragon.firstRunCompleted";

interface ContributionHarness {
    contribution: MiragonThemeContribution;
    registerParsedTheme: ReturnType<typeof vi.fn>;
    setCurrentTheme: ReturnType<typeof vi.fn>;
    showQuickPick: ReturnType<typeof vi.fn>;
}

function createHarness(): ContributionHarness {
    const registerParsedTheme = vi.fn();
    const setCurrentTheme = vi.fn();
    const showQuickPick = vi.fn();
    const contribution = new MiragonThemeContribution();

    Object.assign(contribution, {
        monacoThemingService: { registerParsedTheme },
        themeService: {
            setCurrentTheme,
        },
        quickInputService: { showQuickPick },
        stateService: { reachedState: () => Promise.resolve() },
    });

    return { contribution, registerParsedTheme, setCurrentTheme, showQuickPick };
}

async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe("MiragonThemeContribution", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("registers the Miragon themes without changing the configured theme on startup", async () => {
        window.localStorage.setItem(FIRST_RUN_KEY, "1");
        const { contribution, registerParsedTheme, setCurrentTheme } = createHarness();

        contribution.initialize();
        contribution.onStart();
        await flushPromises();

        expect(registerParsedTheme).toHaveBeenCalledTimes(2);
        expect(registerParsedTheme).toHaveBeenCalledWith(
            expect.objectContaining({ id: MIRAGON_DARK_THEME_ID }),
        );
        expect(registerParsedTheme).toHaveBeenCalledWith(
            expect.objectContaining({ id: MIRAGON_LIGHT_THEME_ID }),
        );
        expect(setCurrentTheme).not.toHaveBeenCalled();
    });

    it("uses Miragon Light as the declarative default", () => {
        expect(standalonePackage.theia.frontend.config.defaultTheme).toBe(MIRAGON_LIGHT_THEME_ID);
    });

    it("persists an explicit theme choice from the first-run picker", async () => {
        const { contribution, setCurrentTheme, showQuickPick } = createHarness();
        showQuickPick.mockResolvedValue({ label: "Miragon Dark" });

        contribution.onStart();
        await flushPromises();

        expect(setCurrentTheme).toHaveBeenLastCalledWith(MIRAGON_DARK_THEME_ID, true);
        expect(window.localStorage.getItem(FIRST_RUN_KEY)).toBe("1");
    });
});
