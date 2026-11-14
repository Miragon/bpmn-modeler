import {
    AddOnActionResultQuery,
    AddOnCatalogQuery,
    AddOnAboutQuery,
    AddOnRequestCommand,
    AddOnsViewCommandType,
    Command,
    GetAddOnAboutCommand,
    ProtocolCommandType,
    OpenAddOnDetailCommand,
    Query,
    RevealAddOnsQuery,
    ShowAddOnQuery,
} from "@miragon/bpmn-modeler-shared";

import { LoggerPort } from "../../../kernel/port/hostPorts";
import { routeWebviewLogCommand } from "../../../editorSession/service/webviewLog";
import {
    MessageRoute,
    RouteLookup,
    WebviewMessageRouter,
} from "../../../editorSession/service/WebviewMessageRouter";
import type { AddOnCatalogModel, AddOnReveal } from "../../domain/addOnCatalogModel";
import { AddOnAbout, NO_ABOUT } from "../../domain/addOnAbout";
import {
    AddOnActionResult,
    AddOnRequest,
    addOnRequestOf,
    CATALOG_NOT_OFFERED,
    REQUEST_FAILED,
} from "../../domain/addOnRequests";

/**
 * Speaks the add-ons view protocol for one panel, so no host translates it:
 * a host passes what the panel's page posts and a `post` that delivers to it.
 */
export class AddOnViewMessages implements RouteLookup {
    private readonly router = WebviewMessageRouter.fromTable<AddOnsViewCommandType, void>({
        LogInfoCommand: [(command) => this.log(command)],
        LogErrorCommand: [(command) => this.log(command)],
        GetAddOnCatalogCommand: [() => this.repost()],
        AddOnRequestCommand: [(command) => this.request(command)],
        OpenAddOnDetailCommand: [(command) => this.openDetail(command)],
        GetAddOnAboutCommand: [(command) => this.about(command)],
    });
    private model?: AddOnCatalogModel;
    /** Held only until a listening page has it, so a page loaded later lands on no old rows. */
    private reveal?: AddOnReveal;
    private pageListening = false;
    private disposed = false;
    /** A detail page's one add-on; a list page has none. */
    private shownId?: string;

    /**
     * @param actOn the core's answer to a request the page made, in a shape it knows
     * @param panel what the page opens in a tab, the add-on a detail page shows, and where a detail's README and license come from
     */
    constructor(
        private readonly actOn: (request: AddOnRequest) => Promise<AddOnActionResult>,
        private readonly logger: LoggerPort,
        private readonly post: (message: Query) => void,
        private readonly panel: {
            readonly openDetail?: (addOnId: string, model?: AddOnCatalogModel) => void;
            readonly shows?: string;
            readonly about?: (targetId: string) => Promise<AddOnAbout>;
        } = {},
    ) {
        if (panel.shows !== undefined) this.show(panel.shows);
    }

    /** A detail page's add-on; it goes before any catalog, so the page never shows another first. */
    show(addOnId: string): void {
        this.shownId = addOnId;
        this.send(new ShowAddOnQuery(addOnId));
    }

    modelBuilt(model: AddOnCatalogModel): void {
        this.model = model;
        this.send(new AddOnCatalogQuery(model));
    }

    revealed(reveal: AddOnReveal): void {
        this.reveal = this.pageListening ? undefined : reveal;
        this.send(new RevealAddOnsQuery(reveal));
    }

    /** A host may discard a hidden page and load it anew once shown. */
    pageHidden(): void {
        this.pageListening = false;
    }

    async handle(command: Command): Promise<void> {
        await this.router.dispatch(command, undefined);
    }

    routeOf(type: ProtocolCommandType): MessageRoute {
        return this.router.routeOf(type);
    }

    dispose(): void {
        this.disposed = true;
    }

    private log(command: Command): void {
        routeWebviewLogCommand(this.logger, command, "addOns");
    }

    /**
     * A page that loads after a push would otherwise wait for the next build,
     * and lose a reveal for good. It holds a reveal until a model lists its rows.
     */
    private repost(): void {
        this.pageListening = true;
        if (this.shownId !== undefined) this.send(new ShowAddOnQuery(this.shownId));
        if (this.model !== undefined) this.send(new AddOnCatalogQuery(this.model));
        if (this.reveal !== undefined) this.send(new RevealAddOnsQuery(this.reveal));
        this.reveal = undefined;
    }

    private openDetail({ addOnId }: OpenAddOnDetailCommand): void {
        this.panel.openDetail?.(addOnId, this.model);
    }

    private async about({ targetId }: GetAddOnAboutCommand): Promise<void> {
        let about = NO_ABOUT;
        try {
            about = (await this.panel.about?.(targetId)) ?? NO_ABOUT;
        } catch (error) {
            this.logError(error);
        }
        this.send(new AddOnAboutQuery(targetId, about));
    }

    private async request({ requestId, request }: AddOnRequestCommand): Promise<void> {
        const known = addOnRequestOf(request);
        if (known === undefined) {
            this.logger.logWarning("Refused an add-ons view request in no shape the core knows.");
        }
        const result = known === undefined ? CATALOG_NOT_OFFERED : await this.answerTo(known);
        this.send(new AddOnActionResultQuery(requestId, result));
    }

    /** The page frees a busy row only on a result. */
    private async answerTo(request: AddOnRequest): Promise<AddOnActionResult> {
        try {
            return await this.actOn(request);
        } catch (error) {
            this.logError(error);
            return REQUEST_FAILED;
        }
    }

    private send(message: Query): void {
        if (this.disposed) return;
        try {
            this.post(message);
        } catch (error) {
            this.logError(error);
        }
    }

    private logError(error: unknown): void {
        this.logger.logError(error instanceof Error ? error : new Error(String(error)));
    }
}
