/**
 * bpmn-js plugin module for implementation-link overlays.
 *
 * Add this module to `additionalModules` when creating a bpmn-js modeler
 * instance. It registers the `implementationLink` service which shows
 * hover overlays linking to implementation source files.
 *
 * @example
 * ```ts
 * import ImplementationLinkModule from "@bpmn-modeler/implementation-link";
 *
 * new BpmnModeler({
 *   additionalModules: [ImplementationLinkModule],
 * });
 * ```
 */
import ImplementationLink from "./ImplementationLink";

export { default as ImplementationLink } from "./ImplementationLink";

export default {
    __init__: ["implementationLink"],
    implementationLink: ["type", ImplementationLink],
};
