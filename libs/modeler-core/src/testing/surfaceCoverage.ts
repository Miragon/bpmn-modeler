import {
    ProtocolCommandType,
    WEBVIEW_SURFACE_COMMAND_TYPES,
    WebviewSurface,
    WebviewSurfaceCommandType,
} from "@miragon/bpmn-modeler-shared";

import { MessageRoute, RouteLookup } from "../editorSession/service/WebviewMessageRouter";

export type HandledRoute = Extract<MessageRoute, { kind: "handled" }>;

export type IgnoredRoute = Extract<MessageRoute, { kind: "ignored" }>;

/** A surface the host does not offer, so it routes none of its commands. */
export interface AbsentSurface {
    readonly absent: string;
}

export const HANDLED: HandledRoute = { kind: "handled" };

export const ignored = (reason: string): IgnoredRoute => ({ kind: "ignored", reason });

export const absent = (reason: string): AbsentSurface => ({ absent: reason });

export type SurfaceCoverage<TSurface extends WebviewSurface> = Record<
    WebviewSurfaceCommandType<TSurface>,
    HandledRoute | IgnoredRoute
>;

/**
 * How one host serves every webview surface: a new surface or a new command on
 * a surface list fails to compile until the host's table names it.
 */
export type HostSurfaceCoverage = {
    readonly [TSurface in WebviewSurface]: SurfaceCoverage<TSurface> | AbsentSurface;
};

export function routesOf(
    router: RouteLookup,
    types: readonly ProtocolCommandType[],
): Record<string, MessageRoute> {
    return Object.fromEntries(types.map((type) => [type, router.routeOf(type)]));
}

/**
 * The coverage a host's routers actually give, shaped like `declared` so a spec
 * can compare the two: a surface without routes reads as the absence `declared`
 * gives it, or as unserved when `declared` expects routes.
 */
export function servedSurfaceCoverage(
    surfaceRoutes: Partial<Record<WebviewSurface, RouteLookup>>,
    declared: HostSurfaceCoverage,
): Record<WebviewSurface, Record<string, MessageRoute> | AbsentSurface | "unserved"> {
    const surfaces = Object.keys(WEBVIEW_SURFACE_COMMAND_TYPES) as WebviewSurface[];
    return Object.fromEntries(
        surfaces.map((surface) => {
            const routes = surfaceRoutes[surface];
            const declaredSurface = declared[surface];
            if (routes !== undefined) {
                return [surface, routesOf(routes, WEBVIEW_SURFACE_COMMAND_TYPES[surface])];
            }
            return [surface, "absent" in declaredSurface ? declaredSurface : "unserved"];
        }),
    ) as Record<WebviewSurface, Record<string, MessageRoute> | AbsentSurface | "unserved">;
}
