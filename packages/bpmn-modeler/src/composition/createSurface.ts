import type {
    BpmnSurface,
    EditingSurface,
    EditingSurfaceOptions,
    ModalSurface,
    ModalSurfaceOptions,
    ViewerSurfaceOptions,
    ViewingSurface,
} from "../kernel/port/bpmnSurface";
import { KernelSurface } from "../kernel/service/kernelSurface";
import { surfaceHandleOf } from "../kernel/service/kernelSurfaceHandle";
import { initOrTeardown } from "../kernel/service/surfaceLifecycle";
import { kernelDefaultModules } from "./kernelDefaults";

/**
 * @experimental Builds a surface from a bpmn-js base and a list of features.
 * Internal until the kernel is published: no entry exports it yet.
 *
 * Features merge in list order, then plugins; the kernel registers
 * `surfaceRoots` (and `surfaceMode` with a `mode`), then focus and the fit
 * button, before any of them. A failure leaves the container as it was.
 */
export function createSurface(
    container: HTMLElement,
    options: ModalSurfaceOptions,
): Promise<ModalSurface>;
export function createSurface(
    container: HTMLElement,
    options: EditingSurfaceOptions,
): Promise<EditingSurface>;
export function createSurface(
    container: HTMLElement,
    options: ViewerSurfaceOptions,
): Promise<ViewingSurface>;
export async function createSurface(
    container: HTMLElement,
    options: ViewerSurfaceOptions | EditingSurfaceOptions | ModalSurfaceOptions,
): Promise<BpmnSurface> {
    const { handleGlobalEscape, ...kernelOptions } = options;
    const kernel = await initOrTeardown(
        () =>
            new KernelSurface(
                container,
                kernelOptions,
                kernelDefaultModules({ handleGlobalEscape }),
            ),
        (surface) => surface.init(),
    );
    return surfaceHandleOf(kernel);
}
