/**
 * Owns everything theme-related for the standalone app:
 *
 *   1. Registers the Miragon Light and Miragon Dark color themes with
 *      Theia's Monaco theme registry so they appear in the Color-Theme
 *      picker and can be referenced by `defaultTheme` in `package.json`.
 *
 *   2. Force-applies a Miragon theme on first paint and again after
 *      preferences finish loading — without this, the UI flashes a Theia
 *      default and an orphaned `workbench.colorTheme` from an earlier run
 *      can survive into the new session.
 *
 *   3. Shows a one-time onboarding picker on first launch so the user is
 *      explicitly aware that Light/Dark/Auto are options, instead of being
 *      silently dropped into whatever the OS preference dictates.
 *
 *   4. Falls back to the OS appearance (`prefers-color-scheme: dark`) when
 *      no Miragon theme is currently active — covers fresh profiles AND
 *      profiles where Theia's default won the race during startup.
 *
 * Why both `initialize()` and `onStart()` apply the theme:
 *   `initialize()` runs synchronously before first paint, so the UI never
 *   flickers in a wrong theme. `onStart()` re-asserts after the preference
 *   subsystem has loaded (which can flip the active theme back to whatever
 *   `workbench.colorTheme` was persisted last time). Without both, you
 *   either see a flash or get overridden by stale prefs.
 */
import { inject, injectable } from "@theia/core/shared/inversify";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { ThemeService } from "@theia/core/lib/browser/theming";
import { QuickInputService } from "@theia/core/lib/common/quick-pick-service";
import { MonacoThemingService } from "@theia/monaco/lib/browser/monaco-theming-service";

import miragonDarkTheme from "./themes/miragon-dark.json";
import miragonLightTheme from "./themes/miragon-light.json";

export const MIRAGON_DARK_THEME_ID = "miragon-dark";
export const MIRAGON_LIGHT_THEME_ID = "miragon-light";
const MIRAGON_THEME_IDS = [MIRAGON_DARK_THEME_ID, MIRAGON_LIGHT_THEME_ID] as const;

const FIRST_RUN_KEY = "miragon.firstRunCompleted";
const SYSTEM_CHOICE_LABEL = "Use System Theme";

@injectable()
export class MiragonThemeContribution implements FrontendApplicationContribution {
    @inject(MonacoThemingService)
    protected readonly monacoThemingService!: MonacoThemingService;

    @inject(ThemeService)
    protected readonly themeService!: ThemeService;

    @inject(QuickInputService)
    protected readonly quickInputService!: QuickInputService;

    initialize(): void {
        this.monacoThemingService.registerParsedTheme({
            id: MIRAGON_DARK_THEME_ID,
            label: "Miragon Dark",
            uiTheme: "vs-dark",
            json: miragonDarkTheme,
        });
        this.monacoThemingService.registerParsedTheme({
            id: MIRAGON_LIGHT_THEME_ID,
            label: "Miragon Light",
            uiTheme: "vs",
            json: miragonLightTheme,
        });
        // Set the theme before first paint so the UI never flashes a Theia
        // default. `themeService` is not yet initialized here; preferences
        // applied later may still re-trigger our second pass in `onStart`.
        this.ensureMiragonTheme();
    }

    async onStart(): Promise<void> {
        // After preferences finish loading they may have flipped the theme
        // back to a stored Theia default. Re-assert if so.
        await this.themeService.initialized;
        this.ensureMiragonTheme();

        if (!window.localStorage.getItem(FIRST_RUN_KEY)) {
            await this.promptInitialThemeChoice();
        }
    }

    /**
     * If the active theme is not one of ours (e.g. an orphaned Theia default
     * carried over from an earlier run), pick a Miragon theme based on the
     * OS preference. Once a Miragon theme is active, leave the user's choice
     * alone so manual switches survive restarts.
     */
    private ensureMiragonTheme(): void {
        const activeId = this.themeService.getCurrentTheme().id;
        if ((MIRAGON_THEME_IDS as readonly string[]).includes(activeId)) {
            return;
        }
        this.applySystemTheme();
    }

    private applySystemTheme(): void {
        const prefersDark =
            typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-color-scheme: dark)").matches;
        const desired = prefersDark ? MIRAGON_DARK_THEME_ID : MIRAGON_LIGHT_THEME_ID;
        this.themeService.setCurrentTheme(desired, true);
    }

    /**
     * Onboarding picker shown on first launch. The flag is set unconditionally
     * — even if the user dismisses with ESC — so the prompt never reappears.
     */
    private async promptInitialThemeChoice(): Promise<void> {
        try {
            const choice = await this.quickInputService.showQuickPick(
                [
                    {
                        label: SYSTEM_CHOICE_LABEL,
                        description: "Follow your OS appearance (recommended)",
                    },
                    {
                        label: "Miragon Dark",
                        description: "Dark UI with Miragon accents",
                    },
                    {
                        label: "Miragon Light",
                        description: "Light UI with Miragon accents",
                    },
                ],
                {
                    placeholder: "Choose your preferred Miragon theme",
                    ignoreFocusOut: true,
                },
            );
            if (choice) {
                if (choice.label === SYSTEM_CHOICE_LABEL) {
                    this.applySystemTheme();
                } else if (choice.label === "Miragon Dark") {
                    this.themeService.setCurrentTheme(MIRAGON_DARK_THEME_ID, true);
                } else if (choice.label === "Miragon Light") {
                    this.themeService.setCurrentTheme(MIRAGON_LIGHT_THEME_ID, true);
                }
            }
        } finally {
            window.localStorage.setItem(FIRST_RUN_KEY, "1");
        }
    }
}
