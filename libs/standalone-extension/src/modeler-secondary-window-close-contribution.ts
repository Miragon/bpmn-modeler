import type { FrontendApplicationContribution, Widget } from "@theia/core/lib/browser";
import { CommonCommands } from "@theia/core/lib/browser/common-commands";
import {
    getAllWidgetsFromSecondaryWindow,
    SecondaryWindowHandler,
} from "@theia/core/lib/browser/secondary-window-handler";
import { CommandRegistry } from "@theia/core/lib/common/command";
import { inject, injectable } from "@theia/core/shared/inversify";
import { ModelerSecondaryWindowHandler } from "./modeler-secondary-window-handler";

@injectable()
export class ModelerSecondaryWindowCloseContribution implements FrontendApplicationContribution {
    @inject(CommandRegistry)
    protected readonly commands!: CommandRegistry;

    @inject(SecondaryWindowHandler)
    protected readonly secondaryWindowHandler!: ModelerSecondaryWindowHandler;

    onStart(): void {
        this.commands.registerHandler(CommonCommands.CLOSE_MAIN_TAB.id, {
            isEnabled: () => this.focusedSecondaryWidget()?.title.closable === true,
            execute: () => {
                const widget = this.focusedSecondaryWidget();
                if (widget?.title.closable) {
                    widget.close();
                }
            },
        });
    }

    private focusedSecondaryWidget(): Widget | undefined {
        const focusedWindow = this.secondaryWindowHandler.getFocusedWindow();
        if (!focusedWindow || focusedWindow === window) {
            return undefined;
        }

        const firstWidget = getAllWidgetsFromSecondaryWindow(focusedWindow)?.[0];
        if (!firstWidget) {
            return undefined;
        }
        return this.secondaryWindowHandler.getTabBarFor(firstWidget)?.currentTitle?.owner;
    }
}
