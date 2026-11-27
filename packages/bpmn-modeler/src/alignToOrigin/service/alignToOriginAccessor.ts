import type { EditingSurface } from "../../kernel/port/bpmnSurface";
import { ALIGN_TO_ORIGIN } from "../domain/alignToOriginNames";

interface AlignInjector {
    get<T>(name: string, strict: false): T | null;
}

/** @experimental What a host calls on a surface's align-to-origin feature. */
export interface AlignToOriginAccessor {
    align(): void;
}

/** @experimental `undefined` on a surface built without align-to-origin. */
export function alignToOriginOf(
    surface: Pick<EditingSurface, "getService">,
): AlignToOriginAccessor | undefined {
    const service = surface
        .getService<AlignInjector>("injector")
        .get<AlignToOriginAccessor>(ALIGN_TO_ORIGIN, false);
    if (!service) {
        return undefined;
    }
    return {
        align: () => {
            service.align();
        },
    };
}
