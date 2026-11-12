import { describe, expect, it } from "vitest";

import {
    PLUGIN_APPROVAL_NOTICE_ID,
    PLUGIN_APPROVAL_PROMPT_ID,
} from "../../bpmnPlugins/domain/pluginApproval";
import { PluginCatalog } from "../../bpmnPlugins/service/PluginCatalog";
import { WorkspacePluginLocator } from "../../bpmnPlugins/service/WorkspacePluginLocator";
import {
    createTestHost,
    fingerprintHasher,
    ReviewAnswers,
    ScriptedReview,
    TestHostOptions,
} from "../../testing";
import { ListReview } from "../adapter/out/ListReview";
import { allowanceOf, allowanceRowOf, LOCAL_HOST } from "../domain/allowance";
import { ApprovalReviewPort } from "../port/approvalPorts";
import { ApprovalQuestion } from "./ApprovalQuestion";
import { ArtifactService } from "./ArtifactService";
import { QuestionQueue } from "./QuestionQueue";

const PLUGINS = "/work/.camunda/plugins";
const RESIZE = `${PLUGINS}/resize-tasks`;
const PALETTE = `${PLUGINS}/reduced-palette`;
const DOCUMENT = "/work/order.bpmn";
const REVIEW = { [PLUGIN_APPROVAL_NOTICE_ID]: "review" };

function setUp(
    options: Pick<TestHostOptions, "noticeAnswers" | "promptAnswers"> & {
        review?: (host: ReturnType<typeof createTestHost>) => ApprovalReviewPort;
        reviewAnswers?: ReviewAnswers;
    } = {},
) {
    const host = createTestHost({
        folders: ["/work"],
        files: {
            [`${RESIZE}/plugin.json`]: '{ "name": "Resize Tasks", "script": "client.js" }',
            [`${RESIZE}/client.js`]: "registerResize();",
            [`${PALETTE}/plugin.json`]: '{ "name": "Reduced Palette", "script": "client.js" }',
            [`${PALETTE}/client.js`]: "registerPalette();",
        },
        noticeAnswers: options.noticeAnswers,
        promptAnswers: options.promptAnswers,
    });
    const catalog = new PluginCatalog(
        new WorkspacePluginLocator(
            new ArtifactService(host.workspace, host.settings, host.notifier),
            host.workspace,
            fingerprintHasher,
            host.allowances,
            host.notifier,
        ),
        host.pluginApprovals,
        host.contentRows,
        host.workspaceTrust,
        host.notifier,
    );
    const scripted = new ScriptedReview(options.reviewAnswers);
    const question = new ApprovalQuestion(
        catalog,
        options.review?.(host) ?? scripted,
        host.actionNotifier,
        host.workspace,
        new QuestionQueue(),
    );
    const askAboutDocument = async () => question.ask((await catalog.pluginsFor(DOCUMENT)).pending);
    return { host, catalog, scripted, askAboutDocument };
}

describe("ApprovalQuestion", () => {
    it("leaves the pending code to the view at once, without a list and without allowing it", async () => {
        const { host, scripted, askAboutDocument } = setUp({
            noticeAnswers: REVIEW,
            reviewAnswers: { [PLUGIN_APPROVAL_PROMPT_ID]: "leftForView" },
        });

        const allowed = await askAboutDocument();

        expect(allowed).toEqual([]);
        expect(host.picker.prompts).toEqual([]);
        expect(
            scripted.requests.map(({ prompt, artifactIds, workspaceFolders }) => [
                prompt.id,
                artifactIds,
                workspaceFolders,
            ]),
        ).toEqual([[PLUGIN_APPROVAL_PROMPT_ID, [RESIZE, PALETTE], ["/work"]]]);
        expect(host.pluginApprovals.read()).toEqual([]);
    });

    it("asks no notice again this session about code left to the view", async () => {
        const { host, askAboutDocument } = setUp({
            noticeAnswers: REVIEW,
            reviewAnswers: { [PLUGIN_APPROVAL_PROMPT_ID]: "leftForView" },
        });
        await askAboutDocument();

        await askAboutDocument();

        expect(host.actionNotifier.notices).toHaveLength(1);
    });

    it("does not ask again about code left to the view once its content changed", async () => {
        const { host, askAboutDocument } = setUp({
            noticeAnswers: REVIEW,
            reviewAnswers: { [PLUGIN_APPROVAL_PROMPT_ID]: "leftForView" },
        });
        await askAboutDocument();

        await host.workspace.writeFile(`${RESIZE}/client.js`, "registerResizE();");
        await askAboutDocument();

        expect(host.actionNotifier.notices.map(({ message }) => message)).toEqual([
            "2 BPMN plugins in this workspace are not allowed yet.",
        ]);
    });

    it("allows the checked code the review answers", async () => {
        const { host, askAboutDocument } = setUp({
            noticeAnswers: REVIEW,
            reviewAnswers: { [PLUGIN_APPROVAL_PROMPT_ID]: [RESIZE] },
        });

        const allowed = await askAboutDocument();

        expect(allowed.map(({ id }) => id)).toEqual([RESIZE]);
        expect(host.pluginApprovals.read()).toEqual([
            allowanceRowOf(allowanceOf("plugin", RESIZE, { kind: "noRepository" }, LOCAL_HOST)),
        ]);
    });

    it("declines everything when the notice is closed, and never opens the review", async () => {
        const { host, scripted, askAboutDocument } = setUp();

        await askAboutDocument();
        await askAboutDocument();

        expect(scripted.requests).toEqual([]);
        expect(host.actionNotifier.notices).toHaveLength(1);
        expect(host.pluginApprovals.read()).toEqual([]);
    });

    it("asks with the host's list through ListReview, as before the review seam", async () => {
        const { host, askAboutDocument } = setUp({
            noticeAnswers: REVIEW,
            promptAnswers: { [PLUGIN_APPROVAL_PROMPT_ID]: [PALETTE] },
            review: (testHost) => new ListReview(testHost.picker),
        });

        const allowed = await askAboutDocument();

        expect(host.picker.prompts.map(({ method }) => method)).toEqual(["chooseMany"]);
        expect(allowed.map(({ id }) => id)).toEqual([PALETTE]);
    });
});
