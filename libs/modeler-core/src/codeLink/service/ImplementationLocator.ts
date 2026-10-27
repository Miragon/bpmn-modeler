import { ImplementationEntry } from "@miragon/bpmn-modeler-types";

import { NotifierPort, WorkspacePort } from "../../kernel/domain/hostPorts";
import {
    ContentSearchResult,
    findFilesExcluding,
    searchFilesContent,
} from "../../kernel/service/workspaceFileSearch";
import { ImplementationKind } from "../domain/ImplementationReference";
import { ContentSearch, ImplementationTarget } from "../domain/ImplementationTarget";
import { DirectSourceCatalog, SourceCatalog } from "./SourceIndex";

// Max length of a reference echoed back into a user-facing log line.
const REFERENCE_DISPLAY_LIMIT = 120;

/** A reference only file content can settle. */
interface ContentTarget {
    activityId: string;
    target: ImplementationTarget;
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
 * searching what its {@link ImplementationTarget} names with the shared
 * workspace-search primitives ({@link findFilesExcluding} / {@link searchFilesContent}).
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

        const target = ImplementationTarget.of(kind, reference);
        if (!target.isSearchable) {
            this.notifier.logInfo(
                `[code-link] nothing to search for in ${kind} reference "${truncate(reference)}"`,
            );
            return { kind: "matches", paths: [], readFailures: [] };
        }

        const byName = await this.findByFileName(target, sourceDocumentPath);
        if (byName === undefined) {
            return { kind: "no-search-scope" };
        }
        const contentSearch = target.contentSearchAfter(byName);
        if (contentSearch === undefined) {
            return { kind: "matches", paths: byName, readFailures: [] };
        }
        return this.searchContent(contentSearch, sourceDocumentPath);
    }

    /**
     * Resolves many references in a single workspace pass — the batched
     * counterpart to {@link resolve}, built for the always-on map where
     * resolving the drift per entry would re-walk the tree N times.
     *
     * One candidate scan; then a content-free pass settles `javaClass` and
     * filename-matched beans by path alone, and the remaining content-based
     * references (literals, and beans whose class file is named differently)
     * are decided from each candidate's `SourceFileFacts`, reading a file
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
        // left needs a content scan.
        const contentTargets: ContentTarget[] = [];
        for (const entry of entries) {
            const target = ImplementationTarget.of(entry.kind, entry.reference);
            const byName = candidates.filter((path) => target.matchesFileName(path));
            if (target.contentSearchAfter(byName) === undefined) {
                result.set(entry.activityId, byName);
            } else {
                contentTargets.push({ activityId: entry.activityId, target });
            }
        }

        if (contentTargets.length === 0) {
            return result;
        }

        const withContent = contentTargets.some(({ target }) => !target.isDecidedByFacts);
        const matchedTargets = await Promise.all(
            candidates.map(async (path) => {
                const source = await catalog.inspect(path, withContent);
                return source
                    ? contentTargets.filter(({ target }) =>
                          target.isDeclaredIn(source.facts, source.content),
                      )
                    : [];
            }),
        );
        candidates.forEach((path, index) => {
            for (const { activityId } of matchedTargets[index]) {
                result.get(activityId)!.push(path);
            }
        });
        return result;
    }

    /** @returns `[]` for a target no file name implements. */
    private async findByFileName(
        target: ImplementationTarget,
        sourceDocumentPath: string | undefined,
    ): Promise<string[] | undefined> {
        if (target.fileNameGlob === undefined) {
            return [];
        }
        return findFilesExcluding(this.vsWorkspace, target.fileNameGlob, {
            sourceDocumentPath,
            logger: this.notifier,
            matchesWalkedFile: (path) => target.matchesFileName(path),
        });
    }

    /**
     * Lists candidate source files for a content scan, with the same
     * findFiles → fs-walk fallback the file-name search uses.
     */
    private async searchContent(
        search: ContentSearch,
        sourceDocumentPath: string | undefined,
    ): Promise<LocateImplementationResult> {
        const sources = await findFilesExcluding(
            this.vsWorkspace,
            `**/*.{${search.extensions.join(",")}}`,
            {
                sourceDocumentPath,
                logger: this.notifier,
                matchesWalkedFile: (path) =>
                    search.extensions.some((ext) => path.endsWith(`.${ext}`)),
            },
        );
        if (sources === undefined) {
            return { kind: "no-search-scope" };
        }
        return toResult(
            sources,
            await searchFilesContent(this.vsWorkspace, sources, search.pattern, this.notifier),
        );
    }
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
