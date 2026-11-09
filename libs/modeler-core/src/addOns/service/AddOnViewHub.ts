import { LoggerPort, WorkspacePort } from "../../kernel/port/hostPorts";
import type { AddOnCatalogModel } from "../domain/addOnCatalogModel";
import { AddOnActionResult, AddOnRequest, CLOSED_VIEW } from "../domain/addOnRequests";
import { AddOnCatalogService } from "./AddOnCatalogService";
import { AddOnWatchers } from "./AddOnWatchers";

export interface AddOnViewConnection {
    /** A new model is posted once the action's effects are listed. */
    handle(request: AddOnRequest): Promise<AddOnActionResult>;
    setVisible(visible: boolean): void;
    dispose(): void;
}

interface AttachedView {
    readonly post: (model: AddOnCatalogModel) => void;
    visible: boolean;
}

/**
 * Posts every model to the visible views. A hidden view gets the latest one
 * once it is shown, and the catalog reads again then, since nothing tells it
 * about another window's write or a package installed meanwhile.
 */
export class AddOnViewHub {
    private readonly views = new Set<AttachedView>();
    private readonly built: { dispose(): void };

    constructor(
        private readonly catalog: AddOnCatalogService,
        private readonly watchers: AddOnWatchers,
        private readonly workspace: WorkspacePort,
        private readonly logger: LoggerPort,
    ) {
        this.built = catalog.onDidBuild((model) =>
            this.views.forEach((view) => {
                if (view.visible) this.post(view, model);
            }),
        );
    }

    attach(post: (model: AddOnCatalogModel) => void, visible: boolean): AddOnViewConnection {
        const view: AttachedView = { post, visible };
        this.views.add(view);
        this.followViews();
        if (visible) this.refresh();
        return {
            handle: (request) =>
                this.views.has(view) ? this.catalog.handle(request) : Promise.resolve(CLOSED_VIEW),
            setVisible: (nowVisible) => this.setVisible(view, nowVisible),
            dispose: () => {
                this.views.delete(view);
                this.followViews();
            },
        };
    }

    refresh(): void {
        if (this.views.size > 0) this.watchers.follow(this.workspace.getWorkspaceFolderPaths());
        this.catalog.invalidate();
    }

    dispose(): void {
        this.built.dispose();
        this.views.clear();
        this.followViews();
    }

    private setVisible(view: AttachedView, visible: boolean): void {
        if (!this.views.has(view)) return;
        const shown = visible && !view.visible;
        view.visible = visible;
        this.followViews();
        if (!shown) return;
        const latest = this.catalog.latest();
        if (latest !== undefined) this.post(view, latest);
        this.refresh();
    }

    private followViews(): void {
        if (this.views.size === 0) this.watchers.dispose();
        else this.watchers.follow(this.workspace.getWorkspaceFolderPaths());
        this.catalog.setActive([...this.views].some(({ visible }) => visible));
    }

    private post(view: AttachedView, model: AddOnCatalogModel): void {
        try {
            view.post(model);
        } catch (error) {
            this.logger.logError(error instanceof Error ? error : new Error(String(error)));
        }
    }
}
