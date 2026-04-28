// Theia frontend DI module. Registers HideBuiltinViewsContribution so the
// built-in Extensions / Debug / Test views are disposed on launch — this app
// is a BPMN modeler, not a general-purpose IDE.

import { ContainerModule } from "@theia/core/shared/inversify";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { HideBuiltinViewsContribution } from "./hide-builtin-views-contribution";

export default new ContainerModule((bind) => {
    bind(HideBuiltinViewsContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(HideBuiltinViewsContribution);
});
