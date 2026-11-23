import type {
    AddOnActionResultPayload,
    AddOnPayload,
    AddOnRequestPayload,
    CodeAddOnPayload,
    TemplateAddOnPayload,
} from "@miragon/bpmn-modeler-shared";

import {
    allowed,
    type MockCatalog,
    revoked,
    STILL_LOADED_NOTE,
    templateIn,
    templatesSwitched,
} from "./mockCatalog";

/* The answers copy the core's flows so the preview reads like a host; the core stays their home. */

const IN_REPOSITORY = " in every worktree of its repository";
const FOLLOW_UP: Record<
    CodeAddOnPayload["kind"],
    { readonly allowed: string; readonly revoked: string }
> = {
    plugin: { allowed: "Open editors reload with it.", revoked: "Open editors reload without it." },
    rulePackage: { allowed: "Open editors lint again with it.", revoked: STILL_LOADED_NOTE },
};

type Done = { readonly result: AddOnActionResultPayload; readonly changed: boolean };

/** Answers the view's add-on requests and changes {@link MockCatalog} as the core's flows would. */
export class PreviewRequests {
    private staleOnce: boolean;

    constructor(
        private readonly catalog: MockCatalog,
        options: { readonly stale?: boolean } = {},
    ) {
        this.staleOnce = options.stale ?? false;
    }

    act(request: AddOnRequestPayload): Done {
        const before = this.catalog.revision;
        const result = this.actOn(request);
        return { result, changed: this.catalog.revision !== before };
    }

    private actOn(request: AddOnRequestPayload): AddOnActionResultPayload {
        switch (request.kind) {
            case "allow":
                return this.allow(request.addOnId);
            case "revoke":
                return this.revoke(request.addOnId);
            case "enable":
            case "disable":
                return this.changeRow<TemplateAddOnPayload>(request.addOnId, (row) =>
                    templateIn(row, request.kind === "enable" ? "enabled" : "disabled"),
                );
            case "enableTemplates":
            case "disableTemplates":
                return this.switchSource(request.sourceId, request.kind === "disableTemplates");
            case "removeMarketplace":
                this.catalog.removeSource(request.sourceId);
                return { kind: "reportedByFlow" };
            case "addMarketplace":
            case "updateMarketplaces":
                return { kind: "reportedByFlow" };
            case "pruneCache":
                return { kind: "done", message: "Removed 2 unused plugin copies." };
            case "refresh":
                this.catalog.bumpRevision();
                return { kind: "done" };
        }
    }

    private allow(addOnId: string): AddOnActionResultPayload {
        if (this.staleOnce) {
            this.staleOnce = false;
            this.catalog.bumpRevision();
            return {
                kind: "refused",
                reason: "staleView",
                message: "The list changed since you looked at it. Check it again, then allow.",
            };
        }
        return this.changeRow<CodeAddOnPayload>(
            addOnId,
            allowed,
            (row) => `Allowed ${row.name}${IN_REPOSITORY}. ${FOLLOW_UP[row.kind].allowed}`,
        );
    }

    private revoke(addOnId: string): AddOnActionResultPayload {
        return this.changeRow<CodeAddOnPayload>(
            addOnId,
            revoked,
            (row) => `Revoked ${row.name}${IN_REPOSITORY}. ${FOLLOW_UP[row.kind].revoked}`,
        );
    }

    private switchSource(sourceId: string, disable: boolean): AddOnActionResultPayload {
        this.catalog.changeSource(sourceId, (source) => templatesSwitched(source, disable));
        return { kind: "done" };
    }

    private changeRow<R extends AddOnPayload>(
        addOnId: string,
        change: (row: R) => R,
        message?: (row: R) => string,
    ): AddOnActionResultPayload {
        const row = this.catalog.rowOf(addOnId) as R | undefined;
        if (row === undefined) {
            return {
                kind: "refused",
                reason: "unknownAddOn",
                message: "This add-on is no longer listed.",
            };
        }
        this.catalog.replaceRow(addOnId, change(row));
        return { kind: "done", ...(message && { message: message(row) }) };
    }
}
