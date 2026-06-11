/**
 * Pure domain helpers for turning a Camunda implementation reference into the
 * filename / package shapes the workspace search needs. No `vscode` / `node`
 * dependencies — these are plain string transforms, unit-tested directly.
 */
import type { ImplementationKind } from "@miragon/bpmn-modeler-shared";

export type { ImplementationKind };

/**
 * Source-file extensions a JVM-language Camunda delegate/bean can live in.
 * Used to build globs and the fs-walk fallback predicate.
 */
export const JVM_EXTENSIONS = ["java", "kt", "groovy", "scala"] as const;

/**
 * Extra extensions a Zeebe job worker can live in (Node workers), searched on
 * top of {@link JVM_EXTENSIONS} for `jobType` / `externalTopic` content scans.
 */
export const SCRIPT_WORKER_EXTENSIONS = ["js", "ts"] as const;

/**
 * Extracts the leading bean / variable id from a Camunda expression.
 *
 * Handles both EL prefixes (`${…}` and `#{…}`) and stops at the first
 * non-identifier character, so `${myBean}` → `myBean`, `${svc.run()}` → `svc`,
 * and `#{ beanWithSpaces }` → `beanWithSpaces`. Returns `undefined` when no
 * identifier can be read (e.g. a literal or a leading operator).
 */
export function extractBeanName(expression: string): string | undefined {
    const inner = expression
        .trim()
        .replace(/^[#$]\{/, "")
        .replace(/\}$/, "")
        .trim();
    const match = inner.match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
    return match ? match[0] : undefined;
}

/**
 * Capitalises a bean id to the conventional implementing class name
 * (`myBean` → `MyBean`). A heuristic: Spring beans default to the
 * decapitalised class name, so reversing that is the best first guess.
 */
export function beanToClassName(bean: string): string {
    return bean.length === 0 ? bean : bean.charAt(0).toUpperCase() + bean.slice(1);
}

/**
 * Converts a fully-qualified class name to its source path segment
 * (`com.example.Foo` → `com/example/Foo`), so a glob can match the file
 * regardless of which source root it sits under.
 */
export function fqcnToGlobPath(fqcn: string): string {
    return fqcn.split(".").join("/");
}
