/**
 * The single-file matchers that decide whether one source file implements a
 * given `(kind, reference)`.
 *
 * The matchers are the load-bearing piece. They are shared verbatim by the
 * always-on map's two cheap operations — *verifying* an already-linked file
 * still implements its activity, and *live-linking* a just-saved file to an
 * unresolved activity — and by the locator's batched scan, so all three agree on
 * what "implements" means without re-walking the workspace per reference.
 *
 * No `vscode` / Node host modules — only `path` (string math). The matchers
 * operate on content the caller already read, so this stays unit-testable
 * against plain strings.
 */
import { posix } from "path";

import {
    beanToClassName,
    extractBeanName,
    fqcnToGlobPath,
    ImplementationKind,
    JVM_EXTENSIONS,
} from "./ImplementationReference";
import { BEAN_ANNOTATION_PREFIX, commentAndCdataRanges, isInsideRanges } from "./sourceText";

/**
 * `camunda:class` is a fully-qualified name, so the file path *is* the proof —
 * no content read needed. The package path must sit on a segment boundary
 * (start of path or after `/`) so a no-package `Foo` does not falsely match
 * `MyFoo.java`.
 */
export function matchesClassPath(fqcn: string, absolutePath: string): boolean {
    const packagePath = fqcnToGlobPath(fqcn);
    return JVM_EXTENSIONS.some((ext) => {
        const suffix = `${packagePath}.${ext}`;
        return absolutePath === suffix || absolutePath.endsWith(`/${suffix}`);
    });
}

/**
 * Whether the file is the conventional implementing class for a bean id —
 * `myBean` → `MyBean.java`. The first guess the locator makes for a
 * delegate/expression binding, matched on the file's basename alone.
 */
export function matchesBeanClassName(bean: string, absolutePath: string): boolean {
    const className = beanToClassName(bean);
    const base = posix.basename(absolutePath);
    return JVM_EXTENSIONS.some((ext) => base === `${className}.${ext}`);
}

/**
 * Whether `content` declares a worker for a free-form literal (external-task
 * topic or Zeebe job type) — the literal appears quoted, e.g.
 * `@JobWorker(type = "payment")` or `taskType: "payment"`.
 */
export function contentImplementsLiteral(content: string, literal: string): boolean {
    return matchesOutsideComments(content, new RegExp(`["']${escapeRegex(literal)}["']`));
}

/**
 * Whether `content` declares a Spring/CDI bean carrying the exact bean id, e.g.
 * `@Service("myBean")` — the fallback when the class file name differs from the
 * bean (an explicitly named `@Component(value = "myBean")`).
 */
export function contentDeclaresBean(content: string, bean: string): boolean {
    return matchesOutsideComments(
        content,
        new RegExp(`${BEAN_ANNOTATION_PREFIX}${escapeRegex(bean)}["']`),
    );
}

/**
 * The one decision both verification and live-linking ask: does the file at
 * `absolutePath` (with already-read `content`) implement `(kind, reference)`?
 * `content` is optional only for `javaClass`, which is decided by the path
 * alone; the content-based kinds report `false` when content is unavailable.
 */
export function fileMatchesEntry(
    kind: ImplementationKind,
    reference: string,
    absolutePath: string,
    content?: string,
): boolean {
    switch (kind) {
        case "javaClass":
            return matchesClassPath(reference, absolutePath);
        case "delegateExpression":
        case "expression": {
            const bean = extractBeanName(reference);
            if (!bean) {
                return false;
            }
            return (
                matchesBeanClassName(bean, absolutePath) ||
                (content !== undefined && contentDeclaresBean(content, bean))
            );
        }
        case "externalTopic":
        case "jobType":
            return content !== undefined && contentImplementsLiteral(content, reference);
    }
}

/** Escapes regex metacharacters so a user id/literal is matched verbatim. */
function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True if `pattern` matches at least one position outside an XML comment or
 * CDATA section — a commented-out declaration is not a real one. Mirrors the
 * workspace content search so the batched scan and these matchers never
 * disagree about the same file. For non-XML source the excluded ranges are
 * empty and matching behaves normally.
 *
 * Limitation: only XML comments/CDATA are excluded, not Java/JS line (`//`) or
 * block comments, so a commented-out annotation in a `.java` file can still
 * false-match. This is deliberate — a naive comment stripper would truncate on a
 * `//` inside a string literal and wrongly *hide* a real match (a worse failure
 * than an extra heuristic link). Revisit only with a real tokenizer if it bites.
 */
function matchesOutsideComments(content: string, pattern: RegExp): boolean {
    const excluded = commentAndCdataRanges(content);
    const global = new RegExp(
        pattern.source,
        pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
    );
    let match: RegExpExecArray | null;
    while ((match = global.exec(content)) !== null) {
        if (!isInsideRanges(excluded, match.index)) {
            return true;
        }
    }
    return false;
}
