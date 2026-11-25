import {
    createKeyboardFocusModule,
    type KeyboardFocusOptions,
} from "../kernel/adapter/in/keyboardFocusModule";
import { FitViewportButtonModule } from "../kernel/adapter/in/fitViewportButtonModule";

/** The modules every surface registers right after the kernel's own: focus and Escape, then the fit button. */
export function kernelDefaultModules(options: KeyboardFocusOptions = {}): unknown[] {
    return [createKeyboardFocusModule(options), FitViewportButtonModule];
}
