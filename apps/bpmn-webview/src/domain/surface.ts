/**
 * The three canvas surfaces the webview can host: the full Camunda modeler
 * (Implement), the engine-neutral designer (Design) and the readonly viewer
 * (View). `isModelerSurface` and `isEditableSurface` from
 * `@miragon/bpmn-modeler/mode` narrow it to the members only some carry.
 */
import type { BpmnModeler } from "@miragon/bpmn-modeler";
import type { BpmnViewerHandle } from "@miragon/bpmn-modeler/viewer";
import type { BpmnDesignerHandle } from "@miragon/bpmn-modeler/design";

/**
 * Any of the three surfaces. The modeler arm is the concrete `BpmnModeler`
 * class, not the public `BpmnModelerHandle`, because the webview drives the
 * extra host-adapter methods it carries beyond the handle (`getDefinitions`,
 * the inline-script bridge, `alignElementsToOrigin`); `isModelerSurface`
 * narrows to the class.
 */
export type SurfaceHandle = BpmnModeler | BpmnViewerHandle | BpmnDesignerHandle;
