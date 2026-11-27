import { createLintHandleMethods, type LintHandleMethods } from "./lintHandle";
import type { SurfaceReporter } from "./reporting";
import type { SurfaceServices } from "./surfaceCore";

export function createSurfaceLintHandle(
    surface: SurfaceServices,
    reporter: SurfaceReporter,
): LintHandleMethods {
    return createLintHandleMethods(
        () => surface.optionalService<LintHandleMethods>("bpmnLintConfig"),
        (message) => reporter.warn(message),
    );
}
