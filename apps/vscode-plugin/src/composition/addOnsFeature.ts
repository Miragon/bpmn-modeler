import { ExtensionContext } from "vscode";

import {
    AddOnsFeature,
    ApprovalReviewPort,
    BpmnEditorFeature,
    BpmnPluginsFeature,
    ListReview,
    MarketplaceAddOnSource,
    RouteLookup,
    ViewReview,
} from "@miragon/bpmn-modeler-core";
import { AddOnsViewProvider } from "../addOns/adapter/in/AddOnsViewProvider";
import { VsCodeBrandModeSignal } from "../addOns/adapter/in/VsCodeBrandModeSignal";
import { VsCodeAddOnsViewReveal } from "../addOns/adapter/out/VsCodeAddOnsViewReveal";
import { createWebviewNonce } from "../shared/adapter/out/webviewNonce";
import { SharedDeps } from "./sharedDeps";

/** Review… of the plugins and the rule packages, and the reveal `register` connects. */
export interface AddOnsViewReviews {
    readonly reveal: VsCodeAddOnsViewReveal;
    readonly plugin: ApprovalReviewPort;
    readonly rulePackage: ApprovalReviewPort;
}

/**
 * Built before the BPMN editor, which takes the reviews, while the catalog
 * is built later from the editor's owners. Review… opens the Add-ons view
 * when it lists every pending item, else the list to check.
 */
export function createViewReviews(deps: SharedDeps): AddOnsViewReviews {
    const reveal = new VsCodeAddOnsViewReveal();
    return {
        reveal,
        plugin: new ViewReview("plugin", reveal, new ListReview(deps.picker)),
        rulePackage: new ViewReview("rulePackage", reveal, new ListReview(deps.picker)),
    };
}

/**
 * The add-on catalog over the plugin, rule package and template owners the
 * BPMN editor built, the approval list they share, the template switches and
 * the marketplace commands, shown in the Add-ons view, where Review…
 * opens it.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
    handles: {
        editor: BpmnEditorFeature;
        plugins: BpmnPluginsFeature;
        marketplaces: MarketplaceAddOnSource;
        reviews: AddOnsViewReviews;
    },
): { addOns: AddOnsFeature; addOnsViewRoutes: RouteLookup } {
    const addOns = new AddOnsFeature({
        workspace: deps.vsWorkspace,
        settings: deps.vsSettings,
        notifier: deps.notifier,
        approvals: deps.pluginApprovals,
        settingChanges: {
            onDidChange: (listener) => deps.preferences.onDidChangeSetting(listener),
        },
        restart: "reloadWindow",
        plugins: handles.plugins.inventory,
        rulePackages: handles.editor.rulePackageInventory,
        templates: handles.editor.templateInventory,
        marketplaces: handles.marketplaces,
        templatePreferences: deps.templatePreferences,
    });
    context.subscriptions.push(addOns);
    const brandMode = new VsCodeBrandModeSignal(
        () => deps.vsSettings.getColorTheme(),
        (listener) => deps.preferences.onDidChangeSetting(listener),
    );
    const view = new AddOnsViewProvider(
        addOns,
        context.extensionUri,
        createWebviewNonce,
        brandMode,
    );
    view.register(context);
    handles.reviews.reveal.connect(addOns, view);
    return { addOns, addOnsViewRoutes: addOns.panelRoutes };
}
