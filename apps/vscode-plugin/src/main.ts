import { ExtensionContext } from "vscode";

import { setContext } from "./shared/adapter/out/extensionContext";
import { notifyIfNewRelease } from "./shared/adapter/out/releaseNotes";
import { buildSharedDeps } from "./composition/sharedDeps";
import * as diffFeature from "./composition/diffFeature";
import * as scriptFeature from "./composition/scriptFeature";
import * as bpmnEditorFeature from "./composition/bpmnEditorFeature";
import * as editorFeature from "./composition/editorFeature";
import * as elementTemplateFeature from "./composition/elementTemplateFeature";
import * as compareFeature from "./composition/compareFeature";
import * as commandsFeature from "./composition/commandsFeature";
import * as deploymentFeature from "./composition/deploymentFeature";
import * as templateMarketplaceFeature from "./composition/templateMarketplaceFeature";
import * as addOnsFeature from "./composition/addOnsFeature";
import * as elementXmlMergeFeature from "./composition/elementXmlMergeFeature";
import { createTestApi, TestApi } from "./composition/testApi";

/**
 * Activation is pure composition: build the shared collaborators once, then let
 * each feature wire itself via its own `register()`. Adding a feature means
 * adding one file and one line here.
 *
 * The register order is observable (it is the order custom editors, providers,
 * and commands become available): diff → script → marketplace (service) →
 * deployment → add-ons view reviews (reveal late-bound) → BPMN editor → DMN and
 * Form editors → marketplace (commands) → add-on catalog (connects the reveal) →
 * template preview → compare → commands. Handles flow forward only: the BPMN
 * editor routes into diff's controller, the script editor's contribution, the
 * marketplace service, the deployment status and the reviews; later features
 * reuse handles the earlier ones returned.
 */
export function activate(context: ExtensionContext): TestApi {
    setContext(context);

    const deps = buildSharedDeps(context);
    // Below buildSharedDeps so the release check can log through the notifier.
    void notifyIfNewRelease(
        context.extension.packageJSON.version,
        context.globalState,
        deps.notifier,
    );
    const {
        diffController,
        diffStore,
        dmnDiffController,
        dmnDiffStore,
        mergeSessions,
        conflictMarkers,
        buildMerge,
    } = diffFeature.register(context, deps);
    const mergeXml = elementXmlMergeFeature.register(context);
    const script = scriptFeature.register(context, deps);
    // Service built before the BPMN editor (which merges its cache); commands
    // deferred after, since they re-run the resulting template service.
    const { marketplaceSvc, templateSources } = templateMarketplaceFeature.register(context, deps);
    // Before the BPMN editor so its status bar participant can join the BPMN
    // session participant list (the same forward hand-off as the script editor).
    const { deploymentStatusParticipant } = deploymentFeature.register(context, deps);
    const reviews = addOnsFeature.createViewReviews(deps);
    const { editor: bpmnEditor, plugins } = bpmnEditorFeature.register(context, deps, {
        diffController,
        conflictMarkers,
        templateSources,
        deploymentStatusParticipant,
        scriptEditor: script.editorContribution,
        reviews,
    });
    const { formService } = editorFeature.register(context, deps, { dmnDiffController });
    const { marketplaces } = templateMarketplaceFeature.registerCommands(context, deps, {
        marketplaceSvc,
        templatesSvc: bpmnEditor.templates,
    });
    addOnsFeature.register(context, deps, {
        editor: bpmnEditor,
        plugins,
        marketplaces,
        reviews,
    });
    elementTemplateFeature.register(context, deps);
    compareFeature.register(context, deps, { diffController, dmnDiffController });
    commandsFeature.register(context, deps, {
        bpmnService: bpmnEditor.bpmnService,
        formService,
        layoutSvc: bpmnEditor.layout,
        elementIdReview: bpmnEditor.elementIdReview,
        coreWriteRenderer: bpmnEditor,
    });

    return createTestApi({
        editorStore: deps.editorStore,
        diffStore,
        dmnDiffStore,
        mergeSessions,
        buildMerge,
        mergeXml,
    });
}
