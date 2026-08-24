/**
 * Entry point of the Theia frontend extension that turns a vanilla Theia
 * shell into the branded Miragon BPMN Modeler. Theia's generator discovers
 * this module via `theiaExtensions.frontend` in our `package.json` and loads
 * it during DI container construction.
 *
 * Responsibilities:
 *   - Wire `HideBuiltinViewsContribution` so the generic IDE views (Extensions,
 *     Debug, Test, Outline) disappear — this app is a BPMN modeler, not a
 *     general-purpose IDE.
 *   - Wire `MiragonThemeContribution` which registers the Miragon Light/Dark
 *     color themes and shows the first-run picker.
 *   - Override Theia's default-editor resolution for the modeler's source toggle.
 *   - Flush pending modeler changes before a secondary window is re-docked.
 *   - Load the brand stylesheet (`./styles/miragon.css`) for small UI
 *     polish that themes alone cannot express (font weights, indicator bars).
 *
 * Adding a contribution? Bind it `toSelf` in singleton scope and then
 * register it as a `FrontendApplicationContribution` service so Theia
 * invokes `initialize` / `onStart` etc. on it.
 */

import "./styles/miragon.css";

import { ContainerModule } from "@theia/core/shared/inversify";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { CommandContribution } from "@theia/core/lib/common";
import { SecondaryWindowHandler } from "@theia/core/lib/browser/secondary-window-handler";
import { SecondaryWindowService } from "@theia/core/lib/browser/window/secondary-window-service";
import { WindowService } from "@theia/core/lib/browser/window/window-service";
import { HideBuiltinViewsContribution } from "./hide-builtin-views-contribution";
import { MiragonThemeContribution } from "./miragon-theme-contribution";
import { ModelerCustomEditorContribution } from "./modeler-custom-editor-contribution";
import { ModelerSecondaryWindowCloseContribution } from "./modeler-secondary-window-close-contribution";
import { ModelerSecondaryWindowHandler } from "./modeler-secondary-window-handler";
import { ModelerSecondaryWindowService } from "./modeler-secondary-window-service";
import { ModelerWindowService } from "./modeler-window-service";
import { StandardTextEditorContribution } from "./standard-text-editor-contribution";

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(ModelerCustomEditorContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ModelerCustomEditorContribution);
    bind(CommandContribution).toService(ModelerCustomEditorContribution);

    bind(ModelerSecondaryWindowHandler).toSelf().inSingletonScope();
    rebind(SecondaryWindowHandler).toService(ModelerSecondaryWindowHandler);

    bind(ModelerSecondaryWindowService).toSelf().inSingletonScope();
    rebind(SecondaryWindowService).toService(ModelerSecondaryWindowService);

    bind(ModelerWindowService).toSelf().inSingletonScope();
    rebind(WindowService).toService(ModelerWindowService);

    bind(ModelerSecondaryWindowCloseContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ModelerSecondaryWindowCloseContribution);

    bind(HideBuiltinViewsContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(HideBuiltinViewsContribution);

    bind(MiragonThemeContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MiragonThemeContribution);

    bind(StandardTextEditorContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(StandardTextEditorContribution);
});
