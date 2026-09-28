/**
 * Typed adapter around the private state and helpers of bpmn-js-bpmnlint's
 * `linting` service, which the incremental relint reuses instead of forking the
 * vendor. Confining that reach here — with a runtime shape assertion and a
 * pinned upstream-shape test — turns a silent breakage on a dependency bump
 * into a loud, located failure.
 */
import type { LintResults } from "@miragon/bpmn-modeler-types";

import type { ElementIssue, ElementIssues } from "./lintIssueDiff";

interface VendorLinting {
    _issues: ElementIssues;
    _overlayIds: Record<string, string | undefined>;
    lint(): Promise<LintResults>;
    update(): void;
    isActive(): boolean;
    _formatIssues(results: LintResults): ElementIssues;
    _createElementIssues(elementId: string, elementIssues: ElementIssue[]): void;
    _clearOverlays(): void;
    _updateButton(): void;
    _fireComplete(issues: ElementIssues): void;
}

const VENDOR_METHODS = [
    "lint",
    "update",
    "isActive",
    "_formatIssues",
    "_createElementIssues",
    "_clearOverlays",
    "_updateButton",
    "_fireComplete",
] as const;

const VENDOR_STATE = ["_issues", "_overlayIds"] as const;

function assertVendorLinting(linting: unknown): asserts linting is VendorLinting {
    const candidate = linting as Record<string, unknown> | null;
    const missingMember = [
        ...VENDOR_METHODS.filter((name) => typeof candidate?.[name] !== "function"),
        ...VENDOR_STATE.filter(
            (name) => typeof candidate?.[name] !== "object" || candidate[name] === null,
        ),
    ];
    if (missingMember.length > 0) {
        throw new Error(
            "bpmn-js-bpmnlint linting internal shape changed: missing " +
                `${missingMember.join(", ")}. Update lintingInternals.ts and its shape test.`,
        );
    }
}

export class LintingInternals {
    private readonly linting: VendorLinting;

    constructor(linting: unknown) {
        assertVendorLinting(linting);
        this.linting = linting;
    }

    replaceUpdate(update: () => void): void {
        this.linting.update = update;
    }

    lint(): Promise<LintResults> {
        return this.linting.lint();
    }

    isActive(): boolean {
        return this.linting.isActive();
    }

    formatIssues(results: LintResults): ElementIssues {
        return this.linting._formatIssues(results);
    }

    renderedIssues(): ElementIssues {
        return this.linting._issues;
    }

    storeIssues(issues: ElementIssues): void {
        this.linting._issues = issues;
    }

    overlayIdOf(overlayKey: string): string | undefined {
        return this.linting._overlayIds[overlayKey];
    }

    forgetOverlayId(overlayKey: string): void {
        delete this.linting._overlayIds[overlayKey];
    }

    createElementOverlays(elementId: string, elementIssues: ElementIssue[]): void {
        this.linting._createElementIssues(elementId, elementIssues);
    }

    clearOverlays(): void {
        this.linting._clearOverlays();
    }

    updateButton(): void {
        this.linting._updateButton();
    }

    fireComplete(issues: ElementIssues): void {
        this.linting._fireComplete(issues);
    }
}
