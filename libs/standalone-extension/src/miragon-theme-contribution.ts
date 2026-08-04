/**
 * Registers the standalone themes and offers a one-time onboarding choice.
 *
 * Theia owns theme selection through `workbench.colorTheme`; applying a theme
 * during startup would overwrite that preference whenever a renderer opens.
 * The fresh-profile default is declared in the standalone app configuration.
 */
import { inject, injectable } from "@theia/core/shared/inversify";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { FrontendApplicationStateService } from "@theia/core/lib/browser/frontend-application-state";
import { ThemeService } from "@theia/core/lib/browser/theming";
import { QuickInputService } from "@theia/core/lib/common/quick-pick-service";
import { MonacoThemingService } from "@theia/monaco/lib/browser/monaco-theming-service";

import miragonDarkTheme from "./themes/miragon-dark.json";
import miragonLightTheme from "./themes/miragon-light.json";

export const MIRAGON_DARK_THEME_ID = "miragon-dark";
export const MIRAGON_LIGHT_THEME_ID = "miragon-light";

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

    @inject(FrontendApplicationStateService)
    protected readonly stateService!: FrontendApplicationStateService;

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
    }

    /**
     * The first-run picker is deferred until the application reaches the
     * `'ready'` state. If we awaited it here, `startContributions()` would
     * block on `quickInputService.showQuickPick(...)`, the main window would
     * stay hidden behind the splash, and the user would have no way to
     * dismiss the (invisible) picker — the splash would spin until the
     * 30 s `maxDuration` fallback closes it.
     */
    onStart(): void {
        if (!window.localStorage.getItem(FIRST_RUN_KEY)) {
            this.stateService.reachedState("ready").then(() => this.promptInitialThemeChoice());
        }
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
                        label: "Miragon Light",
                        description: "Light UI with Miragon accents (recommended)",
                    },
                    {
                        label: "Miragon Dark",
                        description: "Dark UI with Miragon accents",
                    },
                    {
                        label: SYSTEM_CHOICE_LABEL,
                        description: "Follow your OS appearance",
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
