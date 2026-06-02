import { ScriptKind } from "@miragon/bpmn-modeler-shared";

/**
 * Domain model describing the Camunda 7 JSR-223 script execution context.
 *
 * Single source of truth for the bean/method API surface exposed to inline
 * scripts. {@link ScriptCompletionProvider} reads this catalog to drive
 * autocomplete for every supported language (JavaScript, Groovy, Python,
 * Ruby) — VS Code's `tsserver` doesn't enumerate the `bpmn-script://`
 * virtual filesystem, so we can't rely on TypeScript ambient `.d.ts`
 * stubs and route all four languages through the same provider.
 *
 * Adding a new method: extend the appropriate `*_TYPE.methods` list. The
 * completion provider picks up the change automatically.
 */

/**
 * Describes a single parameter of a method call.
 */
export interface MethodParam {
    readonly name: string;
    // Java-flavoured type label (e.g. `"String"`, `"Object"`) shown in signatures.
    readonly type: string;
}

/**
 * Describes a method on a complex type (e.g. `execution.setVariable`).
 */
export interface MethodDef {
    readonly name: string;
    readonly params: readonly MethodParam[];
    // Java-flavoured return type label (e.g. `"String"`, `"void"`).
    readonly returnType: string;
    // Human-readable description shown in the completion details.
    readonly description: string;
}

/**
 * Describes a complex Camunda type (e.g. `DelegateExecution`) — the bag
 * of methods we look up to populate `<bean>.<member>` completions.
 */
export interface TypeDef {
    // Java type name (e.g. `DelegateExecution`).
    readonly name: string;
    // Human-readable description of the type.
    readonly description: string;
    // Methods callable on instances of this type.
    readonly methods: readonly MethodDef[];
}

/**
 * Describes a global bean injected into the script context (e.g. `execution`,
 * `task`, `eventName`). The bean's {@link type} either references a
 * {@link TypeDef} in {@link COMPLEX_TYPES} (for object beans) or names a
 * primitive Java type label (for value beans like `eventName: String`).
 */
export interface BeanDef {
    // Identifier used in scripts (e.g. `"execution"`).
    readonly name: string;
    // Java-flavoured type label (e.g. `"DelegateExecution"`, `"String"`).
    readonly type: string;
    // Human-readable description shown in the completion details.
    readonly description: string;
}

const DELEGATE_EXECUTION_METHODS: readonly MethodDef[] = [
    {
        name: "getVariable",
        params: [{ name: "name", type: "String" }],
        returnType: "Object",
        description: "Returns the value of a process variable.",
    },
    {
        name: "setVariable",
        params: [
            { name: "name", type: "String" },
            { name: "value", type: "Object" },
        ],
        returnType: "void",
        description: "Sets a process variable in the current scope.",
    },
    {
        name: "getVariables",
        params: [],
        returnType: "Map<String, Object>",
        description: "Returns a map of all process variables.",
    },
    {
        name: "getVariableNames",
        params: [],
        returnType: "Set<String>",
        description: "Returns the names of all process variables.",
    },
    {
        name: "getProcessInstanceId",
        params: [],
        returnType: "String",
        description: "Returns the id of the current process instance.",
    },
    {
        name: "getBusinessKey",
        params: [],
        returnType: "String",
        description: "Returns the business key of the process instance.",
    },
    {
        name: "getProcessDefinitionId",
        params: [],
        returnType: "String",
        description: "Returns the id of the deployed process definition.",
    },
    {
        name: "getActivityInstanceId",
        params: [],
        returnType: "String",
        description: "Returns the id of the current activity instance.",
    },
    {
        name: "getCurrentActivityId",
        params: [],
        returnType: "String",
        description: "Returns the id of the current activity (the BPMN element id).",
    },
    {
        name: "getEventName",
        params: [],
        returnType: "String",
        description: "Returns the name of the event currently being processed.",
    },
];

const DELEGATE_TASK_METHODS: readonly MethodDef[] = [
    {
        name: "getId",
        params: [],
        returnType: "String",
        description: "Returns the id of the task.",
    },
    {
        name: "getName",
        params: [],
        returnType: "String",
        description: "Returns the name of the task.",
    },
    {
        name: "getAssignee",
        params: [],
        returnType: "String",
        description: "Returns the current assignee of the task.",
    },
    {
        name: "setAssignee",
        params: [{ name: "userId", type: "String" }],
        returnType: "void",
        description: "Sets the assignee of the task.",
    },
    {
        name: "getDescription",
        params: [],
        returnType: "String",
        description: "Returns the description of the task.",
    },
    {
        name: "setDescription",
        params: [{ name: "description", type: "String" }],
        returnType: "void",
        description: "Sets the description of the task.",
    },
    {
        name: "getPriority",
        params: [],
        returnType: "int",
        description: "Returns the priority of the task.",
    },
    {
        name: "setPriority",
        params: [{ name: "priority", type: "int" }],
        returnType: "void",
        description: "Sets the priority of the task.",
    },
    {
        name: "complete",
        params: [],
        returnType: "void",
        description: "Completes the task programmatically.",
    },
    {
        name: "getVariable",
        params: [{ name: "name", type: "String" }],
        returnType: "Object",
        description: "Returns the value of a task-local variable.",
    },
    {
        name: "setVariable",
        params: [
            { name: "name", type: "String" },
            { name: "value", type: "Object" },
        ],
        returnType: "void",
        description: "Sets a task-local variable.",
    },
    {
        name: "getExecution",
        params: [],
        returnType: "DelegateExecution",
        description: "Returns the underlying execution.",
    },
    {
        name: "getEventName",
        params: [],
        returnType: "String",
        description:
            "Returns the name of the event triggering this listener (create/assignment/complete/delete/update/timeout).",
    },
];

const DELEGATE_EXECUTION_TYPE: TypeDef = {
    name: "DelegateExecution",
    description: "Provides access to process variables and execution metadata.",
    methods: DELEGATE_EXECUTION_METHODS,
};

const DELEGATE_TASK_TYPE: TypeDef = {
    name: "DelegateTask",
    description: "Provides access to user task properties during task listener execution.",
    methods: DELEGATE_TASK_METHODS,
};

// All complex (interface-typed) types referenced by any bean.
export const COMPLEX_TYPES: readonly TypeDef[] = [DELEGATE_EXECUTION_TYPE, DELEGATE_TASK_TYPE];

const TYPES_BY_NAME: ReadonlyMap<string, TypeDef> = new Map(
    COMPLEX_TYPES.map((type) => [type.name, type]),
);

/**
 * Returns the methods callable on a bean. Empty when the bean's type is a
 * primitive Java label not registered in {@link COMPLEX_TYPES} (e.g.
 * `eventName: String`).
 */
export function methodsForBean(bean: BeanDef): readonly MethodDef[] {
    return TYPES_BY_NAME.get(bean.type)?.methods ?? [];
}

const EXECUTION_BEAN: BeanDef = {
    name: "execution",
    type: "DelegateExecution",
    description: "The current execution context.",
};

const TASK_BEAN: BeanDef = {
    name: "task",
    type: "DelegateTask",
    description: "The current task context (task listeners only).",
};

const EVENT_NAME_BEAN: BeanDef = {
    name: "eventName",
    type: "String",
    description: "The name of the event triggering this listener.",
};

/**
 * Beans available in the script execution context for each script kind.
 * Declared as a `Record<ScriptKind, …>` so adding a new kind is a compile
 * error here, keeping the catalog and the discriminator union in lock-step.
 */
const BEANS_BY_KIND: Record<ScriptKind, readonly BeanDef[]> = {
    "script-task": [EXECUTION_BEAN],
    "execution-listener": [EXECUTION_BEAN, EVENT_NAME_BEAN],
    "task-listener": [EXECUTION_BEAN, TASK_BEAN, EVENT_NAME_BEAN],
};

/**
 * Returns the beans available in the script execution context for a given
 * script kind. The completion provider uses this to drive root-level
 * identifier completions and to validate `<bean>.<member>` lookups.
 */
export function beansFor(kind: ScriptKind): readonly BeanDef[] {
    return BEANS_BY_KIND[kind];
}
