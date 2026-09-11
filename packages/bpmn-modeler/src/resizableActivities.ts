/**
 * Makes every `bpmn:Activity` resizable.
 *
 * bpmn-js's own rules allow resizing only participants, expanded sub-processes
 * and text annotations; a task or a collapsed sub-process is pinned to
 * 100×80. Modellers who lay diagrams out by hand — long task names, a wide
 * call activity next to a narrow one — need to widen them, which is why the
 * Camunda Modeler community has shipped `camunda-modeler-plugin-resize-tasks`
 * for years.
 *
 * Off by default (`miragon.bpmnModeler.resizableActivities`), because handles
 * on every task change how the canvas feels and BPMN itself attaches no meaning
 * to element size.
 *
 * The rule is registered once and reads {@link ResizableActivitiesRule.setEnabled}
 * on every evaluation, so toggling the setting takes effect without rebuilding
 * the modeler.
 *
 * @internal Registered by {@link BpmnModeler}; driven by the setting, not by
 *   consumers.
 */

/**
 * Priority above bpmn-js's own `BpmnRules` (which registers at the default
 * 1000), so an allow here is not overruled by the stock "tasks are fixed" rule.
 */
const RULE_PRIORITY = 1500;

/**
 * Floor for a hand-resized activity, in diagram units. bpmn-js clamps only the
 * element types it already lets you resize, so without a floor a drag past the
 * opposite edge collapses a task to nothing and leaves an unclickable sliver.
 * 60×40 is the smallest box that still renders a marker row and a line of text.
 */
const MIN_ACTIVITY_SIZE = { width: 60, height: 40 };

interface BusinessObject {
    $instanceOf(type: string): boolean;
}

interface Shape {
    businessObject?: BusinessObject;
}

interface Bounds {
    width: number;
    height: number;
}

interface ResizeContext {
    shape?: Shape;
    newBounds?: Bounds;
}

interface RuleEvent {
    context?: ResizeContext;
}

interface EventBus {
    on(event: string, priority: number, callback: (event: RuleEvent) => boolean | undefined): void;
}

export class ResizableActivitiesRule {
    static $inject = ["eventBus"];

    private enabled = false;

    constructor(eventBus: EventBus) {
        // `commandStack.shape.resize.canExecute` is the event diagram-js's
        // RuleProvider.addRule("shape.resize", …) posts to; subscribing to it
        // directly keeps this a plain class instead of an `inherits` subclass.
        eventBus.on("commandStack.shape.resize.canExecute", RULE_PRIORITY, (event) =>
            this.canResize(event.context),
        );
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    /**
     * `true` allows the resize, `undefined` defers to the stock rules — never
     * `false` for a non-activity, or this rule would veto the participants and
     * text annotations bpmn-js already resizes.
     */
    private canResize(context: ResizeContext | undefined): boolean | undefined {
        if (!this.enabled || !isActivity(context?.shape)) {
            return undefined;
        }
        const bounds = context?.newBounds;
        if (!bounds) {
            // No bounds yet: the question is whether handles should appear.
            return true;
        }
        return bounds.width >= MIN_ACTIVITY_SIZE.width && bounds.height >= MIN_ACTIVITY_SIZE.height;
    }
}

/**
 * Every `bpmn:Activity`: the task subtypes plus SubProcess, Transaction,
 * AdHocSubProcess and CallActivity. Broader than the Camunda Modeler plugin,
 * which covers `bpmn:Task` only, so a *collapsed* sub-process — the one shape a
 * hand-laid-out diagram most often needs wider — is resizable too. Expanded
 * sub-processes were already resizable and are unaffected.
 */
function isActivity(shape: Shape | undefined): boolean {
    const businessObject = shape?.businessObject;
    return (
        typeof businessObject?.$instanceOf === "function" &&
        businessObject.$instanceOf("bpmn:Activity")
    );
}

export const ResizableActivitiesModule = {
    __init__: ["resizableActivitiesRule"],
    resizableActivitiesRule: ["type", ResizableActivitiesRule],
};
