import { describe, expect, expectTypeOf, it } from "vitest";

import {
    ADD_ONS_VIEW_COMMAND_TYPES,
    AddOnActionKindPayload,
    AddOnActionResultPayload,
    AddOnActionResultQuery,
    AddOnCatalogPayload,
    AddOnCatalogQuery,
    AddOnRefusalPayload,
    AddOnRequestCommand,
    AddOnRequestPayload,
    AddOnRevealPayload,
    CatalogActionKindPayload,
    CodeAddOnKindPayload,
    CodeStatePayload,
    GetAddOnCatalogCommand,
    GroupKindPayload,
    LogErrorCommand,
    LogInfoCommand,
    Query,
    RevealAddOnsQuery,
    SourceActionKindPayload,
    SourceKindPayload,
    TemplateStatePayload,
} from "@miragon/bpmn-modeler-shared";

import { RecordingNotifier } from "../../../testing/RecordingNotifier";
import type { AddOnCatalogModel, AddOnReveal } from "../../domain/addOnCatalogModel";
import type {
    AddOnActionKind,
    CatalogActionKind,
    CodeAddOnKind,
    CodeState,
    GroupKind,
    SourceActionKind,
    SourceKind,
    TemplateState,
} from "../../domain/addOnIds";
import type { AddOnActionResult, AddOnRefusal, AddOnRequest } from "../../domain/addOnRequests";
import { AddOnViewMessages } from "./AddOnViewMessages";

const MODEL: AddOnCatalogModel = {
    revision: 7,
    groups: [],
    actions: [{ kind: "pruneCache", label: "Remove unused plugin copies" }],
};
const REVEAL: AddOnReveal = {
    kind: "rows",
    revealId: 1,
    addOnIds: ["plugin:/work/.camunda/plugins/resize"],
};
const ALLOW: AddOnRequest = { kind: "allow", addOnId: "plugin:/work/x", revision: 7 };

function setUp(
    answer: (request: AddOnRequest) => Promise<AddOnActionResult> = async () => ({
        kind: "done",
    }),
) {
    const logger = new RecordingNotifier();
    const posted: Query[] = [];
    const requests: AddOnRequest[] = [];
    const messages = new AddOnViewMessages(
        (request) => {
            requests.push(request);
            return answer(request);
        },
        logger,
        (message) => posted.push(message),
    );
    return { logger, posted, requests, messages };
}

describe("AddOnViewMessages", () => {
    describe("pins each protocol copy to its home", () => {
        it("pins the whole messages", () => {
            expectTypeOf<AddOnCatalogPayload>().toEqualTypeOf<AddOnCatalogModel>();
            expectTypeOf<AddOnRequestPayload>().toEqualTypeOf<AddOnRequest>();
            expectTypeOf<AddOnActionResultPayload>().toEqualTypeOf<AddOnActionResult>();
            expectTypeOf<AddOnRevealPayload>().toEqualTypeOf<AddOnReveal>();
        });

        it("pins each value set", () => {
            expectTypeOf<CodeStatePayload>().toEqualTypeOf<CodeState>();
            expectTypeOf<TemplateStatePayload>().toEqualTypeOf<TemplateState>();
            expectTypeOf<SourceKindPayload>().toEqualTypeOf<SourceKind>();
            expectTypeOf<GroupKindPayload>().toEqualTypeOf<GroupKind>();
            expectTypeOf<CodeAddOnKindPayload>().toEqualTypeOf<CodeAddOnKind>();
            expectTypeOf<AddOnActionKindPayload>().toEqualTypeOf<AddOnActionKind>();
            expectTypeOf<SourceActionKindPayload>().toEqualTypeOf<SourceActionKind>();
            expectTypeOf<CatalogActionKindPayload>().toEqualTypeOf<CatalogActionKind>();
            expectTypeOf<AddOnRefusalPayload>().toEqualTypeOf<AddOnRefusal>();
        });
    });

    it.each(ADD_ONS_VIEW_COMMAND_TYPES)("routes %s", (type) => {
        expect(setUp().messages.routeOf(type)).toEqual({ kind: "handled" });
    });

    it("posts each model the core built", () => {
        const { messages, posted } = setUp();

        messages.modelBuilt(MODEL);

        expect(posted).toEqual([new AddOnCatalogQuery(MODEL)]);
    });

    it("posts each reveal", () => {
        const { messages, posted } = setUp();

        messages.revealed(REVEAL);

        expect(posted).toEqual([new RevealAddOnsQuery(REVEAL)]);
    });

    it("answers a request with the core's result under the request's id", async () => {
        const { messages, posted, requests } = setUp(async () => ({
            kind: "done",
            message: "Allowed Resize.",
        }));

        await messages.handle(new AddOnRequestCommand(4, ALLOW));

        expect(requests).toEqual([ALLOW]);
        expect(posted).toEqual([
            new AddOnActionResultQuery(4, { kind: "done", message: "Allowed Resize." }),
        ]);
    });

    it("answers a request the core failed on as failed, under the request's id, and logs why", async () => {
        const { messages, posted, logger } = setUp(async () => {
            throw new Error("approval store unwritable");
        });

        await messages.handle(new AddOnRequestCommand(6, ALLOW));

        expect(posted).toEqual([
            new AddOnActionResultQuery(6, {
                kind: "failed",
                message: "Could not do this. The log says why.",
            }),
        ]);
        expect(logger.logged("error")).toHaveLength(1);
    });

    it("refuses a request in no shape the core knows, logs it and asks nothing", async () => {
        const { messages, posted, requests, logger } = setUp();

        await messages.handle(
            new AddOnRequestCommand(5, {
                kind: "deleteEverything",
            } as unknown as AddOnRequestPayload),
        );

        expect(requests).toEqual([]);
        expect(posted).toEqual([
            new AddOnActionResultQuery(5, {
                kind: "refused",
                reason: "notOffered",
                message: "The list offers no such action now. Check it again.",
            }),
        ]);
        expect(logger.logged("warning")).toHaveLength(1);
    });

    it("posts the last model and then the last reveal again when the page asks", async () => {
        const { messages, posted } = setUp();
        messages.modelBuilt({ ...MODEL, revision: 6 });
        messages.modelBuilt(MODEL);
        messages.revealed(REVEAL);
        posted.length = 0;

        await messages.handle(new GetAddOnCatalogCommand());

        expect(posted).toEqual([new AddOnCatalogQuery(MODEL), new RevealAddOnsQuery(REVEAL)]);
    });

    it("posts the last reveal again when the page asks before the first model", async () => {
        const { messages, posted } = setUp();
        messages.revealed(REVEAL);
        posted.length = 0;

        await messages.handle(new GetAddOnCatalogCommand());

        expect(posted).toEqual([new RevealAddOnsQuery(REVEAL)]);
    });

    it("posts a reveal again only to the page that loads after it, not to a page that loads later", async () => {
        const { messages, posted } = setUp();
        messages.modelBuilt(MODEL);
        messages.revealed(REVEAL);
        await messages.handle(new GetAddOnCatalogCommand());
        posted.length = 0;

        await messages.handle(new GetAddOnCatalogCommand());

        expect(posted).toEqual([new AddOnCatalogQuery(MODEL)]);
    });

    it("posts no reveal again that reached a page already listening", async () => {
        const { messages, posted } = setUp();
        messages.modelBuilt(MODEL);
        await messages.handle(new GetAddOnCatalogCommand());
        messages.revealed(REVEAL);
        posted.length = 0;

        await messages.handle(new GetAddOnCatalogCommand());

        expect(posted).toEqual([new AddOnCatalogQuery(MODEL)]);
    });

    it("posts a reveal again that arrived after its page was hidden, as the host may load it anew", async () => {
        const { messages, posted } = setUp();
        messages.modelBuilt(MODEL);
        await messages.handle(new GetAddOnCatalogCommand());
        messages.pageHidden();
        messages.revealed(REVEAL);
        posted.length = 0;

        await messages.handle(new GetAddOnCatalogCommand());

        expect(posted).toEqual([new AddOnCatalogQuery(MODEL), new RevealAddOnsQuery(REVEAL)]);
    });

    it("posts nothing when the page asks before the first model and any reveal", async () => {
        const { messages, posted } = setUp();

        await messages.handle(new GetAddOnCatalogCommand());

        expect(posted).toEqual([]);
    });

    it("logs the page's log lines tagged as the add-ons view's", async () => {
        const { messages, logger } = setUp();

        await messages.handle(new LogInfoCommand("rendered"));
        await messages.handle(new LogErrorCommand("broke", "at render"));

        expect(logger.logs).toEqual([
            { level: "info", message: "[webview:addOns] rendered" },
            { level: "error", message: "[webview:addOns] broke\nat render" },
        ]);
    });

    it("posts nothing once disposed, a result that arrives later included", async () => {
        let answer: (result: AddOnActionResult) => void = () => undefined;
        const { messages, posted } = setUp(
            () => new Promise<AddOnActionResult>((resolve) => (answer = resolve)),
        );
        messages.modelBuilt(MODEL);
        const handled = messages.handle(new AddOnRequestCommand(1, ALLOW));
        posted.length = 0;

        messages.dispose();
        answer({ kind: "done" });
        await handled;
        messages.modelBuilt(MODEL);
        messages.revealed(REVEAL);
        await messages.handle(new GetAddOnCatalogCommand());

        expect(posted).toEqual([]);
    });

    it("logs a post that throws and keeps posting", () => {
        const logger = new RecordingNotifier();
        let calls = 0;
        const messages = new AddOnViewMessages(
            async () => ({ kind: "done" }),
            logger,
            () => {
                calls++;
                throw new Error("webview gone");
            },
        );

        messages.modelBuilt(MODEL);
        messages.revealed(REVEAL);

        expect(calls).toBe(2);
        expect(logger.logged("error")).toHaveLength(2);
    });
});
