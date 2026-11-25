/**
 * The value of `surfaceRoots`: the canvas container first, then the extra roots
 * (such as the properties panel's parent) in the order the surface was given.
 * A feature that must tell the canvas apart relies on that first position.
 */
export type SurfaceRoots = readonly HTMLElement[];

/** The `diagramTemplate` slot: what `newDiagram` opens on a modeler base. */
export interface DiagramTemplate {
    newDiagramXml(): string;
}
