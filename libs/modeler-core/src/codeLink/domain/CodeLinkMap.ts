import { ImplementationEntry, implementationStatusKey } from "@miragon/bpmn-modeler-types";

import {
    CODE_LINK_SCHEMA_VERSION,
    CodeLinkMapJson,
    toAbsolute,
    toRelative,
} from "./codeLinkArtifact";
import { ImplementationTarget } from "./ImplementationTarget";

/**
 * One activity and the files that implement it. `paths` are absolute (the
 * `uri.path` form the workspace speaks), so they can be read back and compared
 * against watcher events; the artifact relativises them.
 */
export interface CodeLink extends ImplementationEntry {
    readonly paths: readonly string[];
}

export interface SyncPlan {
    /** The held links whose activity the diagram still binds the same way. */
    readonly retained: CodeLinkMap;
    /** The retained links with files, whose files are read again. */
    readonly toVerify: readonly CodeLink[];
    /** The new and changed activities. */
    readonly toResolve: readonly ImplementationEntry[];
}

export type SourceFileChange =
    | { readonly kind: "written"; readonly path: string; readonly content: string | undefined }
    | { readonly kind: "unreadable"; readonly path: string }
    | { readonly kind: "deleted"; readonly path: string };

/**
 * The activity→code map of one open diagram. An activity is resolved exactly
 * when a file is linked to it; that is derived, never stored. Every operation
 * returns a new map.
 */
export class CodeLinkMap {
    static readonly empty = new CodeLinkMap(new Map());

    private constructor(private readonly linksById: ReadonlyMap<string, CodeLink>) {}

    /** The persisted `resolved` flag is ignored: the paths decide. */
    static fromArtifact(json: CodeLinkMapJson, workspaceRoot: string): CodeLinkMap {
        return CodeLinkMap.of(
            json.entries
                .filter((entry) => CodeLinkMap.admits(entry))
                .map((entry) =>
                    linkOf(
                        entry,
                        entry.paths.map((path) => toAbsolute(path, workspaceRoot)),
                    ),
                ),
        );
    }

    /** An entry that crossed a message boundary is typed, but not checked. */
    static admits(entry: ImplementationEntry): boolean {
        return (
            typeof entry.activityId === "string" &&
            entry.activityId.length > 0 &&
            typeof entry.reference === "string" &&
            entry.reference.length > 0 &&
            ImplementationTarget.isKnownKind(entry.kind)
        );
    }

    private static of(links: readonly CodeLink[]): CodeLinkMap {
        return new CodeLinkMap(new Map(links.map((link) => [link.activityId, link])));
    }

    get links(): readonly CodeLink[] {
        return [...this.linksById.values()];
    }

    isResolved(activityId: string): boolean {
        return (this.linksById.get(activityId)?.paths.length ?? 0) > 0;
    }

    /**
     * An unchanged unresolved activity is neither verified nor resolved again:
     * the source watcher links it once a file implements it.
     */
    planSync(incoming: readonly ImplementationEntry[]): SyncPlan {
        const admitted = new Map(
            incoming
                .filter((entry) => CodeLinkMap.admits(entry))
                .map((entry) => [entry.activityId, entry]),
        );
        const retained = this.links.filter((link) => {
            const entry = admitted.get(link.activityId);
            return entry?.kind === link.kind && entry.reference === link.reference;
        });
        const retainedIds = new Set(retained.map((link) => link.activityId));
        return {
            retained: CodeLinkMap.of(retained),
            toVerify: retained.filter((link) => link.paths.length > 0),
            toResolve: [...admitted.values()].filter((entry) => !retainedIds.has(entry.activityId)),
        };
    }

    /**
     * `survivors` holds, per verified activity, the linked files that still
     * implement it. Verification only narrows a link; an activity that loses
     * its last file is resolved again.
     */
    applyVerification(survivors: ReadonlyMap<string, readonly string[]>): {
        map: CodeLinkMap;
        toResolve: readonly ImplementationEntry[];
    } {
        const toResolve: ImplementationEntry[] = [];
        const links = this.links.map((link) => {
            const surviving = survivors.get(link.activityId);
            if (surviving === undefined || link.paths.length === 0) {
                return link;
            }
            const verified = linkOf(
                link,
                link.paths.filter((path) => surviving.includes(path)),
            );
            if (verified.paths.length === 0) {
                toResolve.push(bindingOf(link));
            }
            return verified;
        });
        return { map: CodeLinkMap.of(links), toResolve };
    }

    applyResolution(
        entries: readonly ImplementationEntry[],
        resolved: ReadonlyMap<string, readonly string[]>,
    ): CodeLinkMap {
        const links = new Map(this.linksById);
        for (const entry of entries) {
            links.set(entry.activityId, linkOf(entry, resolved.get(entry.activityId) ?? []));
        }
        return new CodeLinkMap(links);
    }

    /**
     * A written file is linked exactly when it implements the activity and
     * unlinked when it stops doing so, whether or not the activity was
     * resolved; a deleted file leaves every link.
     */
    applyFileChange(change: SourceFileChange): { map: CodeLinkMap; changed: boolean } {
        const held = this.links;
        const links = held.map((link) => linkAfter(change, link));
        const changed = links.some((link, index) => link !== held[index]);
        return { map: changed ? CodeLinkMap.of(links) : this, changed };
    }

    /** Keyed by {@link implementationStatusKey}, the lookup the webview reads. */
    statusSnapshot(): Record<string, boolean> {
        return Object.fromEntries(
            this.links.map((link) => [
                implementationStatusKey(link.activityId, link.reference),
                link.paths.length > 0,
            ]),
        );
    }

    /** Lists unresolved activities too, so tooling reading the file sees every task. */
    toArtifact(params: {
        bpmnFile: string;
        workspaceRoot: string;
        generatedAt: string;
    }): CodeLinkMapJson {
        return {
            schemaVersion: CODE_LINK_SCHEMA_VERSION,
            bpmnFile: params.bpmnFile,
            generatedAt: params.generatedAt,
            entries: this.links.map((link) => ({
                ...bindingOf(link),
                resolved: link.paths.length > 0,
                paths: link.paths.map((path) => toRelative(path, params.workspaceRoot)),
            })),
        };
    }
}

function bindingOf(entry: ImplementationEntry): ImplementationEntry {
    return { activityId: entry.activityId, kind: entry.kind, reference: entry.reference };
}

function linkOf(entry: ImplementationEntry, paths: readonly string[]): CodeLink {
    return { ...bindingOf(entry), paths: [...new Set(paths)] };
}

function linkAfter(change: SourceFileChange, link: CodeLink): CodeLink {
    const linked = link.paths.includes(change.path);
    const implemented =
        change.kind === "written" &&
        ImplementationTarget.of(link.kind, link.reference).isImplementedBy(
            change.path,
            change.content,
        );
    if (implemented && !linked) {
        return linkOf(link, [...link.paths, change.path]);
    }
    if (!implemented && linked) {
        return linkOf(
            link,
            link.paths.filter((path) => path !== change.path),
        );
    }
    return link;
}
