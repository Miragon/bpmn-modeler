import { ScriptKind } from "@miragon/bpmn-modeler-shared";

import {
    BeanDef,
    beansFor,
    COMPLEX_TYPES,
    MethodDef,
    MethodParam,
    TypeDef,
} from "./scriptApi";

/**
 * Renders kind-aware Camunda 7 ambient TypeScript stubs from the script API
 * catalog in {@link ./scriptApi.ts}.
 *
 * `ScriptTaskService` writes the result as a sibling `camunda.d.ts` next to
 * each JavaScript script in the bpmn-script virtual filesystem so the JS
 * language service picks up the IntelliSense surface defined by the catalog.
 *
 * Kept separate from the catalog so the data definition stays free of
 * presentation logic and the renderer can be unit-tested without VS Code
 * dependencies.
 */
export function generateAmbientDts(kind: ScriptKind): string {
    const interfaces = COMPLEX_TYPES.map(renderInterface).join("\n\n");
    const globals = beansFor(kind).map(renderGlobal).join("");
    return `${interfaces}\n\n${globals}`;
}

function renderInterface(type: TypeDef): string {
    const methods = type.methods.map(renderMethod).join("\n");
    return [
        `/** ${type.description} */`,
        `interface ${type.name} {`,
        methods,
        `}`,
    ].join("\n");
}

function renderMethod(method: MethodDef): string {
    const params = method.params.map(renderParam).join(", ");
    return [
        `    /** ${method.description} */`,
        `    ${method.name}(${params}): ${javaToTs(method.returnType)};`,
    ].join("\n");
}

function renderParam(param: MethodParam): string {
    return `${param.name}: ${javaToTs(param.type)}`;
}

function renderGlobal(bean: BeanDef): string {
    return [
        `/** ${bean.description} */`,
        `declare const ${bean.name}: ${javaToTs(bean.type)};`,
        ``,
    ].join("\n");
}

/**
 * Maps a Camunda Java-flavoured type label (used in `scriptApi.ts` for
 * Groovy/Python/Ruby completion details) to its TypeScript equivalent.
 * Unknown labels pass through unchanged so Camunda interface names like
 * `DelegateExecution` are emitted verbatim.
 */
function javaToTs(javaType: string): string {
    switch (javaType) {
        case "String":
            return "string";
        case "Object":
            return "any";
        case "int":
        case "long":
        case "double":
        case "float":
            return "number";
        case "boolean":
            return "boolean";
        case "void":
            return "void";
        case "Map<String, Object>":
            return "Record<string, any>";
        case "Set<String>":
            return "string[]";
        default:
            return javaType;
    }
}
