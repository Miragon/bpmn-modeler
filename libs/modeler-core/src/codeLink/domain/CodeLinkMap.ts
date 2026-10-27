import { ImplementationEntry } from "@miragon/bpmn-modeler-types";

import { CODE_LINK_SCHEMA_VERSION, CodeLinkMapJson } from "./codeLinkArtifact";

export interface CodeLink extends ImplementationEntry {
    readonly paths: readonly string[];
}

export interface SyncPlan {
    readonly retained: CodeLinkMap;
    readonly toVerify: readonly CodeLink[];
    readonly toResolve: readonly ImplementationEntry[];
}

export type SourceFileChange =
    | { readonly kind: "written"; readonly path: string; readonly content: string | undefined }
    | { readonly kind: "deleted"; readonly path: string };

export class CodeLinkMap {
    static readonly empty = new CodeLinkMap(new Map());

    private constructor(private readonly linksById: ReadonlyMap<string, CodeLink>) {}

    static fromArtifact(_json: CodeLinkMapJson, _workspaceRoot: string): CodeLinkMap {
        return CodeLinkMap.empty;
    }

    static admits(_entry: ImplementationEntry): boolean {
        return false;
    }

    get links(): readonly CodeLink[] {
        return [];
    }

    isResolved(_activityId: string): boolean {
        return false;
    }

    planSync(_incoming: readonly ImplementationEntry[]): SyncPlan {
        return { retained: this, toVerify: [], toResolve: [] };
    }

    applyVerification(_survivors: ReadonlyMap<string, readonly string[]>): {
        map: CodeLinkMap;
        toResolve: readonly ImplementationEntry[];
    } {
        return { map: this, toResolve: [] };
    }

    applyResolution(
        _entries: readonly ImplementationEntry[],
        _resolved: ReadonlyMap<string, readonly string[]>,
    ): CodeLinkMap {
        return this;
    }

    applyFileChange(_change: SourceFileChange): { map: CodeLinkMap; changed: boolean } {
        return { map: this, changed: false };
    }

    statusSnapshot(): Record<string, boolean> {
        return {};
    }

    toArtifact(params: {
        bpmnFile: string;
        workspaceRoot: string;
        generatedAt: string;
    }): CodeLinkMapJson {
        return {
            schemaVersion: CODE_LINK_SCHEMA_VERSION,
            bpmnFile: params.bpmnFile,
            generatedAt: params.generatedAt,
            entries: [],
        };
    }
}
