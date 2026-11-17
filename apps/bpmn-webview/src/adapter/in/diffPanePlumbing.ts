import {
    asProtocolMessage,
    DiffPlaneChangedCommand,
    DiffReadyCommand,
    DiffSelectionChangedCommand,
    LogErrorCommand,
    NO_DIFF_SELECTION,
    type ProtocolMessage,
    type Query,
    ShowElementXmlChangesCommand,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";
import type { DiffSide } from "@miragon/bpmn-modeler-types";

import { DiffSideLabel, DiffViewer } from "@miragon/bpmn-modeler/viewer";
import { i18n } from "@miragon/bpmn-modeler-i18n";

import type { DiffPaneChannel } from "../../port/hostChannel";
import { createElementXmlChangesModule } from "./elementXmlContextPad";

// How the viewer names the plane a pane opens with, whatever its process is called.
const OPENING_PLANE = "";

/**
 * What every BPMN pane of a two-pane view does, whatever it marks: owns the
 * {@link DiffViewer} with the element XML context pad, imports the pane's
 * XML and reports it ready, keeps viewport, plane and selection in step with
 * the partner pane, and names the pane's side. A diff pane and a merge pane
 * add their own markers, legend and stepper on top.
 *
 *   - Incoming {@link SyncViewportQuery} → apply partner's viewport.
 *   - Incoming {@link SyncDiffPlaneQuery} → enter the partner's plane, or note
 *     that this version lacks it.
 *   - Incoming {@link SyncDiffSelectionQuery} → mirror the partner's selection
 *     without re-emitting, which would ping-pong the two panes forever.
 *   - Outgoing {@link ViewportChangedCommand} on user pan/zoom,
 *     {@link DiffPlaneChangedCommand} on a plane the user enters,
 *     {@link DiffSelectionChangedCommand} on every user selection, and
 *     {@link ShowElementXmlChangesCommand} from the context pad's entry.
 */
export class DiffPanePlumbing {
    readonly viewer: DiffViewer;

    private sideLabel: DiffSideLabel | undefined;

    private composeLabel: (() => string | undefined) | undefined;

    // Whether this version lacks the plane the user entered on the partner pane.
    private planeMissing = false;

    // The plane shown, as far as this pane saw it change; the viewer reports only the user's.
    private shownPlane = OPENING_PLANE;

    private initialImportSettled = false;

    private paintAfterImport: (() => void) | undefined;

    private hostShowsElementXmlChanges = false;

    constructor(
        private readonly canvas: HTMLElement,
        private readonly host: DiffPaneChannel,
        additionalModules: readonly unknown[] = [],
    ) {
        this.viewer = new DiffViewer(canvas, {
            additionalModules: [
                createElementXmlChangesModule({
                    canShowElementXmlChanges: () => this.hostShowsElementXmlChanges,
                    showElementXmlChanges: (elementId) =>
                        this.host.postMessage(new ShowElementXmlChangesCommand(elementId)),
                }),
                ...additionalModules,
            ],
        });

        this.viewer.onPlaneChanged((planeId) => {
            this.shownPlane = planeId;
            this.setPlaneMissing(false);
            this.host.postMessage(new DiffPlaneChangedCommand(planeId));
        });

        this.viewer.onViewportChanged((viewport) => {
            // On a plane the partner lacks, its coordinates would mean nothing there.
            if (!this.planeMissing) {
                this.host.postMessage(new ViewportChangedCommand(viewport));
            }
        });
        this.viewer.onSelectedElementChanged((elementId) => {
            this.host.postMessage(new DiffSelectionChangedCommand(elementId ?? NO_DIFF_SELECTION));
        });
        // A label composed of translated words cannot re-translate itself.
        i18n.onChange(() => this.showLabel());
    }

    /**
     * Listens to the host and imports the initial XML the caller already
     * received with the first {@link BpmnFileQuery}. Every query this class
     * does not follow itself goes to `onQuery`.
     */
    async start(initialContent: string, onQuery: (query: ProtocolMessage) => void): Promise<void> {
        window.addEventListener("message", (event: MessageEvent<Query>) => {
            const query = asProtocolMessage(event.data);
            if (!this.followPartner(query)) onQuery(query);
        });
        await this.loadInitial(initialContent);
    }

    /**
     * Runs `paint` once the initial import settled: at once after it, after it
     * otherwise, where a later paint replaces an earlier one; an empty canvas
     * would drop the markers. Nothing runs for an import that failed.
     */
    whenImported(paint: () => void): void {
        if (this.initialImportSettled) {
            paint();
        } else {
            this.paintAfterImport = paint;
        }
    }

    /**
     * Tags the body with the pane's side, so diff.css can render a divider on
     * the edge facing the partner pane: the two borders meet at VS Code's
     * sash, a visible hint of where to drag to resize the split.
     */
    tagSide(side: DiffSide): void {
        document.body.dataset.diffSide = side;
    }

    offerElementXmlChanges(offered: boolean): void {
        this.hostShowsElementXmlChanges = offered;
    }

    /** Names the pane's side with what `compose` returns, again whenever the language changes. */
    label(side: DiffSide, compose: () => string | undefined): void {
        this.sideLabel ??= new DiffSideLabel(this.canvas, side);
        this.composeLabel = compose;
        this.showLabel();
    }

    setPlaneMissing(missing: boolean): void {
        this.planeMissing = missing;
        this.sideLabel?.showPlaneMissing(missing);
    }

    /** Notes the plane the pane entered itself, a sub-process's or the opening one for none. */
    notePlaneShown(subProcess: string | undefined): void {
        this.shownPlane = subProcess ?? OPENING_PLANE;
        this.setPlaneMissing(false);
    }

    /**
     * Enters the plane the partner pane shows, a sub-process's or the opening
     * one for none, unless this pane shows it already; notes when this
     * version lacks it, so the viewport sync stops.
     */
    followPlane(subProcess: string | undefined): void {
        const planeId = subProcess ?? OPENING_PLANE;
        if (planeId === this.shownPlane) {
            this.setPlaneMissing(false);
            return;
        }
        this.enterPlane(planeId);
    }

    private enterPlane(planeId: string): void {
        const shown = this.viewer.showPlane(planeId);
        if (shown) this.shownPlane = planeId;
        this.setPlaneMissing(!shown);
    }

    private showLabel(): void {
        if (this.composeLabel) this.sideLabel?.showFilename(this.composeLabel());
    }

    private followPartner(query: ProtocolMessage): boolean {
        switch (query.type) {
            case "SyncDiffPlaneQuery":
                this.enterPlane(query.planeId);
                return true;
            case "SyncViewportQuery":
                if (!this.planeMissing) this.viewer.setViewport(query.viewport);
                return true;
            case "SyncDiffSelectionQuery":
                this.viewer.mirrorSelection(
                    query.elementId === NO_DIFF_SELECTION ? undefined : query.elementId,
                );
                return true;
            default:
                return false;
        }
    }

    private async loadInitial(content: string): Promise<void> {
        try {
            await this.viewer.importXML(content);
        } catch (error) {
            this.initialImportSettled = true;
            this.paintAfterImport = undefined;
            console.error("DiffViewer import failed", error);
            const e = error instanceof Error ? error : new Error(String(error));
            this.host.postMessage(
                new LogErrorCommand(`DiffViewer import failed: ${e.message}`, e.stack),
            );
            return;
        }
        this.initialImportSettled = true;
        this.paintAfterImport?.();
        this.paintAfterImport = undefined;
        this.host.postMessage(new DiffReadyCommand());
    }
}
