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

/** Narrow API surface returned by `activate()` for e2e tests only. */
export interface TestApi {
    diff: {
        sessionFor(uri: string): { origin: string; paneCount: number } | undefined;
    };
}

/**
 * Activation is pure composition: build the shared collaborators once, then let
 * each feature wire itself via its own `register()`. Adding a feature means
 * adding one file and one line here.
 *
 * The register order is observable (it is the order custom editors, providers,
 * and commands become available): diff → script → marketplace (service) →
 * deployment → BPMN editor → DMN and Form editors → marketplace (commands) →
 * add-on catalog → template preview → compare → commands. Handles flow forward only: the BPMN
 * editor routes into diff's controller, the script editor's contribution, the
 * marketplace service and the deployment status; later features reuse handles
 * the earlier ones returned.
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
    const { diffController, diffStore } = diffFeature.register(context, deps);
    const script = scriptFeature.register(context, deps);
    // Service built before the BPMN editor (which merges its cache); commands
    // deferred after, since they re-run the resulting template service.
    const { marketplaceSvc, templateSources } = templateMarketplaceFeature.register(context, deps);
    // Before the BPMN editor so its status bar participant can join the BPMN
    // session participant list (the same forward hand-off as the script editor).
    const { deploymentStatusParticipant } = deploymentFeature.register(context, deps);
    const { editor: bpmnEditor, plugins } = bpmnEditorFeature.register(context, deps, {
        diffController,
        templateSources,
        deploymentStatusParticipant,
        scriptEditor: script.editorContribution,
    });
    editorFeature.register(context, deps);
    const { marketplaces } = templateMarketplaceFeature.registerCommands(context, deps, {
        marketplaceSvc,
        templatesSvc: bpmnEditor.templates,
    });
    addOnsFeature.register(context, deps, { editor: bpmnEditor, plugins, marketplaces });
    elementTemplateFeature.register(context, deps);
    compareFeature.register(context, deps, { diffController });
    commandsFeature.register(context, deps, {
        bpmnService: bpmnEditor.bpmnService,
        layoutSvc: bpmnEditor.layout,
        coreWriteRenderer: bpmnEditor,
    });

    return {
        diff: {
            sessionFor(uri: string) {
                const session = diffStore.findByUri(uri);
                if (!session) {
                    return undefined;
                }
                return { origin: session.origin, paneCount: session.attachedPanes().length };
            },
        },
    };
}
