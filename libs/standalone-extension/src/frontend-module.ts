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
import { HideBuiltinViewsContribution } from "./hide-builtin-views-contribution";
import { MiragonThemeContribution } from "./miragon-theme-contribution";

export default new ContainerModule((bind) => {
    bind(HideBuiltinViewsContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(HideBuiltinViewsContribution);

    bind(MiragonThemeContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MiragonThemeContribution);
});
