import { ImplementationEntry } from "@miragon/bpmn-modeler-types";

import { NotifierPort, WorkspacePort } from "../../kernel/domain/hostPorts";
import {
    ContentSearchResult,
    escapeRegex,
    findFilesExcluding,
    searchFilesContent,
} from "../../kernel/service/workspaceFileSearch";
import {
    contentImplementsLiteral,
    matchesBeanClassName,
    matchesClassPath,
} from "../domain/ImplementationTarget";
import {
    beanToClassName,
    extractBeanName,
    fqcnToGlobPath,
    ImplementationKind,
    JVM_EXTENSIONS,
    SOURCE_EXTENSIONS,
} from "../domain/ImplementationReference";
import { SourceFileFacts } from "../domain/SourceFileFacts";
import { BEAN_ANNOTATION_PREFIX } from "../domain/sourceText";
import { DirectSourceCatalog, InspectedSource, SourceCatalog } from "./SourceIndex";

// Max length of a reference echoed back into a user-facing log line.
const REFERENCE_DISPLAY_LIMIT = 120;

// Brace-expansion glob fragments. VS Code's `findFiles` expands `{a,b}`.
const JVM_GLOB_EXT = `{${JVM_EXTENSIONS.join(",")}}`;
const SOURCE_GLOB_EXT = `{${SOURCE_EXTENSIONS.join(",")}}`;

/** A reference only file content can settle, with the bean id it names, if any. */
interface ContentTarget {
    activityId: string;
    reference: string;
    bean?: string;
}

/**
 * Outcome of locating the source file(s) implementing a task reference.
 * Mirrors `navigation`'s `LocateResult` so the navigation service can be a
 * near-clone.
 *
 * - `no-search-scope` — nothing to search (no folder open, no source URI).
 * - `all-unreadable` — candidates were found but every read failed.
 * - `matches` — `paths` may be empty (nothing matched) or hold one/many hits.
 */
export type LocateImplementationResult =
    | { kind: "no-search-scope" }
    | { kind: "all-unreadable"; attempted: number; failures: string[] }
    | { kind: "matches"; paths: string[]; readFailures: string[] };

/**
 * Resolves a Camunda implementation reference to workspace source file(s),
 * picking a per-kind strategy and building on the shared workspace-search
 * primitives ({@link findFilesExcluding} / {@link searchFilesContent}).
 *
 * Deterministic for `javaClass` (FQCN → exact class-file glob); heuristic for
 * the rest. Heuristics are safe because a wrong/missing guess surfaces as an
 * info notification or a QuickPick — never a bad silent jump — handled by the
 * {@link ImplementationNavigationService} that consumes this result.
 */
export class ImplementationLocator {
    constructor(
        private readonly vsWorkspace: WorkspacePort,
        private readonly notifier: NotifierPort,
    ) {}

    async resolve(
        reference: string,
        kind: ImplementationKind,
        sourceDocumentPath?: string,
    ): Promise<LocateImplementationResult> {
        this.notifier.logInfo(
            `[code-link] resolving ${kind} reference="${truncate(reference)}" ` +
                `sourceUri=${sourceDocumentPath ?? "<none>"}`,
        );

        if (kind === "javaClass") {
            return this.resolveJavaClass(reference, sourceDocumentPath);
        }
        if (kind === "delegateExpression" || kind === "expression") {
            return this.resolveBean(reference, sourceDocumentPath);
        }
        // externalTopic | jobType — both resolve by searching for the literal.
        return this.resolveLiteral(reference, sourceDocumentPath);
    }

    /**
     * Resolves many references in a single workspace pass — the batched
     * counterpart to {@link resolve}, built for the always-on map where
     * resolving the drift per entry would re-walk the tree N times.
     *
     * One candidate scan; then a content-free pass settles `javaClass` and
     * filename-matched beans by path alone, and the remaining content-based
     * references (literals, and beans whose class file is named differently)
     * are decided from each candidate's {@link SourceFileFacts}, reading a file
     * only when `sources` does not know it yet or a literal needs the content.
     *
     * @param sources The shared index of the document's workspace folders;
     *   without one the candidates are listed and read for this call only.
     * @returns activity id → matched absolute paths in candidate order. Every
     *   input id is present; an unresolved reference (or no search scope) maps
     *   to an empty array.
     */
    async resolveMany(
        entries: readonly ImplementationEntry[],
        sourceDocumentPath?: string,
        sources?: SourceCatalog,
    ): Promise<Map<string, string[]>> {
        const result = new Map<string, string[]>(entries.map((entry) => [entry.activityId, []]));
        if (entries.length === 0) {
            return result;
        }

        this.notifier.logInfo(`[code-link] batch-resolving ${entries.length} reference(s)`);
        const catalog =
            sources ?? new DirectSourceCatalog(this.vsWorkspace, this.notifier, sourceDocumentPath);
        const candidates = await catalog.listSources();
        if (candidates === undefined || candidates.length === 0) {
            return result;
        }

        // Path-only pass: anything decidable without reading a file. Whatever is
        // left (literals, and beans with no matching class-file name) needs a
        // content scan and is queued with the bean id it should look for.
        const contentTargets: ContentTarget[] = [];
        for (const entry of entries) {
            if (entry.kind === "javaClass") {
                result.set(
                    entry.activityId,
                    candidates.filter((path) => matchesClassPath(entry.reference, path)),
                );
                continue;
            }
            if (entry.kind === "delegateExpression" || entry.kind === "expression") {
                const bean = extractBeanName(entry.reference);
                if (!bean) {
                    continue;
                }
                const byName = candidates.filter((path) => matchesBeanClassName(bean, path));
                if (byName.length > 0) {
                    result.set(entry.activityId, byName);
                } else {
                    contentTargets.push({
                        activityId: entry.activityId,
                        reference: entry.reference,
                        bean,
                    });
                }
                continue;
            }
            // externalTopic | jobType — literal content search only.
            contentTargets.push({ activityId: entry.activityId, reference: entry.reference });
        }

        if (contentTargets.length === 0) {
            return result;
        }

        const withContent = contentTargets.some(
            (target) =>
                target.bean === undefined && !SourceFileFacts.decidesLiteral(target.reference),
        );
        const matchedTargets = await Promise.all(
            candidates.map(async (path) => {
                const source = await catalog.inspect(path, withContent);
                return source
                    ? contentTargets.filter((target) => implementsTarget(source, target))
                    : [];
            }),
        );
        candidates.forEach((path, index) => {
            for (const target of matchedTargets[index]) {
                result.get(target.activityId)!.push(path);
            }
        });
        return result;
    }

    /**
     * `camunda:class` is a fully-qualified class name, so the file path itself
     * is the answer — no content check needed. The package path is matched as a
     * suffix so the class is found under any source root (`src/main/java`, …).
     */
    private async resolveJavaClass(
        fqcn: string,
        sourceDocumentPath: string | undefined,
    ): Promise<LocateImplementationResult> {
        const packagePath = fqcnToGlobPath(fqcn);
        const paths = await findFilesExcluding(
            this.vsWorkspace,
            `**/${packagePath}.${JVM_GLOB_EXT}`,
            {
                sourceDocumentPath,
                logger: this.notifier,
                matchesWalkedFile: (path) => matchesClassPath(fqcn, path),
            },
        );
        if (paths === undefined) {
            return { kind: "no-search-scope" };
        }
        return { kind: "matches", paths, readFailures: [] };
    }

    /**
     * Delegate / expression bindings name a bean, not a file. First guess the
     * implementing class by capitalising the bean id and searching by filename;
     * if that finds nothing, fall back to a content search for a Spring/CDI
     * bean-naming annotation carrying the exact bean id.
     */
    private async resolveBean(
        expression: string,
        sourceDocumentPath: string | undefined,
    ): Promise<LocateImplementationResult> {
        const bean = extractBeanName(expression);
        if (!bean) {
            this.notifier.logInfo(
                `[code-link] no bean id found in expression "${truncate(expression)}"`,
            );
            return { kind: "matches", paths: [], readFailures: [] };
        }

        const className = beanToClassName(bean);
        const byName = await findFilesExcluding(
            this.vsWorkspace,
            `**/${className}.${JVM_GLOB_EXT}`,
            {
                sourceDocumentPath,
                logger: this.notifier,
                matchesWalkedFile: (path) => matchesBeanClassName(bean, path),
            },
        );
        if (byName === undefined) {
            return { kind: "no-search-scope" };
        }
        if (byName.length > 0) {
            return { kind: "matches", paths: byName, readFailures: [] };
        }

        // Fallback: the class file name differs from the bean (e.g. an
        // explicitly named `@Service("myBean")`), so scan source content.
        const sources = await this.collectSources(JVM_GLOB_EXT, JVM_EXTENSIONS, sourceDocumentPath);
        if (sources === undefined) {
            return { kind: "no-search-scope" };
        }
        const pattern = beanAnnotationPattern(bean);
        return toResult(
            sources,
            await searchFilesContent(this.vsWorkspace, sources, pattern, this.notifier),
        );
    }

    /**
     * External-task topics and Zeebe job types are free-form literals declared
     * on the worker side, so the only reliable signal is the quoted literal in
     * source — e.g. `@ExternalTaskSubscription("payment-topic")`,
     * `@JobWorker(type = "payment-service")`, or `taskType: "payment-service"`.
     */
    private async resolveLiteral(
        literal: string,
        sourceDocumentPath: string | undefined,
    ): Promise<LocateImplementationResult> {
        const sources = await this.collectSources(
            SOURCE_GLOB_EXT,
            SOURCE_EXTENSIONS,
            sourceDocumentPath,
        );
        if (sources === undefined) {
            return { kind: "no-search-scope" };
        }
        const pattern = new RegExp(`["']${escapeRegex(literal)}["']`);
        return toResult(
            sources,
            await searchFilesContent(this.vsWorkspace, sources, pattern, this.notifier),
        );
    }

    /**
     * Lists candidate source files for a content scan, with the same
     * findFiles → fs-walk fallback the deterministic paths use.
     */
    private collectSources(
        globExt: string,
        extensions: readonly string[],
        sourceDocumentPath: string | undefined,
    ): Promise<string[] | undefined> {
        return findFilesExcluding(this.vsWorkspace, `**/*.${globExt}`, {
            sourceDocumentPath,
            logger: this.notifier,
            matchesWalkedFile: (path) => extensions.some((ext) => path.endsWith(`.${ext}`)),
        });
    }
}

/**
 * Matches a Spring/CDI bean-naming annotation that carries the exact bean id,
 * e.g. `@Service("myBean")` or `@Component(value = "myBean")`.
 */
function beanAnnotationPattern(bean: string): RegExp {
    return new RegExp(`${BEAN_ANNOTATION_PREFIX}${escapeRegex(bean)}["']`);
}

function implementsTarget(source: InspectedSource, target: ContentTarget): boolean {
    if (target.bean !== undefined) {
        return source.facts.declaresBean(target.bean);
    }
    if (SourceFileFacts.decidesLiteral(target.reference)) {
        return source.facts.implementsLiteral(target.reference);
    }
    return (
        source.content !== undefined && contentImplementsLiteral(source.content, target.reference)
    );
}

function toResult(candidates: string[], search: ContentSearchResult): LocateImplementationResult {
    if (search.allUnreadable) {
        return {
            kind: "all-unreadable",
            attempted: candidates.length,
            failures: search.readFailures,
        };
    }
    return { kind: "matches", paths: search.matches, readFailures: search.readFailures };
}

function truncate(value: string): string {
    return value.length <= REFERENCE_DISPLAY_LIMIT
        ? value
        : `${value.slice(0, REFERENCE_DISPLAY_LIMIT - 1)}…`;
}
