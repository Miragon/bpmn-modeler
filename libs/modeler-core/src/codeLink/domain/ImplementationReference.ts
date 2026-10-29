/**
 * Pure domain helpers for turning a Camunda implementation reference into the
 * filename / package shapes the workspace search needs. No `vscode` / `node`
 * dependencies — these are plain string transforms, unit-tested directly.
 */
import type { ImplementationKind } from "@miragon/bpmn-modeler-types";

export type { ImplementationKind };

/** Source-file extensions a JVM-language Camunda delegate/bean can live in. */
export const JVM_EXTENSIONS = ["java", "kt", "groovy", "scala"] as const;

// Node job workers, searched on top of the JVM sources for a literal.
const SCRIPT_WORKER_EXTENSIONS = ["js", "ts"] as const;

/**
 * The files with one of a set of extensions, as the glob a host lists and as
 * the test the fs-walk fallback applies, so the two select the same files.
 */
export interface SourceFileSet {
    /**
     * A `WorkspacePort` glob for the files named `stem`, all of them by
     * default; the port expands its `{a,b}` group.
     */
    readonly glob: (stem?: string) => string;
    readonly includes: (path: string) => boolean;
}

function sourceFileSet(extensions: readonly string[]): SourceFileSet {
    return {
        glob: (stem = "*") => `**/${stem}.{${extensions.join(",")}}`,
        includes: (path) => extensions.some((extension) => path.endsWith(`.${extension}`)),
    };
}

export const JVM_SOURCE_FILES = sourceFileSet(JVM_EXTENSIONS);

/** Every file a delegate, bean or job worker can live in. */
export const SOURCE_FILES = sourceFileSet([...JVM_EXTENSIONS, ...SCRIPT_WORKER_EXTENSIONS]);

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
