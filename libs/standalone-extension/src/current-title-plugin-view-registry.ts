import { injectable } from "@theia/core/shared/inversify";
import { PluginViewRegistry } from "@theia/plugin-ext/lib/main/browser/view/plugin-view-registry";

@injectable()
export class CurrentTitlePluginViewRegistry extends PluginViewRegistry {}
