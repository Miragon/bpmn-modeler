import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type Overlays from "diagram-js/lib/features/overlays/Overlays";
import type Modeling from "bpmn-js/lib/features/modeling/Modeling";

/**
 * The core diagram-js/bpmn-js services whose names and documented shapes are
 * semver-stable through {@link BpmnModelerHandle.getService} across minor
 * versions. Modelled as a name→type map so it stays `Pick`-able: a future
 * viewer handle (#1405) can freeze exactly the subset it exposes.
 */
export interface CoreModelerServices {
    canvas: Canvas;
    commandStack: CommandStack;
    elementRegistry: ElementRegistry;
    eventBus: EventBus;
    modeling: Modeling;
    overlays: Overlays;
    selection: Selection;
}

/**
 * Internal, typed DI accessor over the {@link CoreModelerServices} names. The
 * public {@link BpmnModelerHandle.getService} overload satisfies it, so managers
 * decoupled from the modeler receive a typed lookup instead of `<any>` casts.
 */
export type CoreServiceAccessor = <K extends keyof CoreModelerServices>(
    name: K,
) => CoreModelerServices[K];
