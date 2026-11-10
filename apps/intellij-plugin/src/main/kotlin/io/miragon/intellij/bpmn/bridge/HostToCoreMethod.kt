package io.miragon.intellij.bpmn.bridge

/**
 * Every notification the host sends the core, by its wire name. [RpcChannel]
 * sends only these, and `ProtocolHandlerCoverageTest` holds them equal to the
 * descriptor's host→core methods, so the host cannot send a method the core
 * does not handle.
 */
internal enum class HostToCoreMethod(val wireName: String) {
    SESSION_REGISTER("session/register"),
    SESSION_SET_ACTIVE("session/setActive"),
    SESSION_DISPOSE("session/dispose"),
    WEBVIEW_MESSAGE("webview/message"),
    DOCUMENT_DID_CHANGE("document/didChange"),
    SETTINGS_DID_CHANGE("settings/didChange"),
    DIFF_OPEN("diff/open"),
    DIFF_WEBVIEW_MESSAGE("diff/webviewMessage"),
    DIFF_DISPOSE("diff/dispose"),
    DEPLOYMENT_STATE_SEED("deploymentState/seed"),
    DEPLOYMENT_WEBVIEW_MESSAGE("deployment/webviewMessage"),
    DEPLOYMENT_OPEN("deployment/open"),
    DEPLOYMENT_SWITCH_TARGET("deployment/switchTarget"),
    DEPLOYMENT_DEPLOY_FILES("deployment/deployFiles"),
    DEPLOYMENT_DEPLOY_ACTIVE("deployment/deployActive"),
    DEPLOYMENT_VERIFY("deployment/verify"),
    DEPLOYMENT_STATUS_BAR_MENU("deployment/statusBarMenu"),
    SCRIPT_DID_CHANGE("script/didChange"),
    SCRIPT_DID_CLOSE("script/didClose"),
    SCRIPT_OPEN_ALL("script/openAll"),
    SCRIPT_DID_OPEN_EXTERNAL("script/didOpenExternal"),
    MARKETPLACE_ADD("marketplace/add"),
    MARKETPLACE_UPDATE("marketplace/update"),
    MARKETPLACE_REMOVE("marketplace/remove"),
    MODELER_CHANGE_ENGINE_VERSION("modeler/changeEngineVersion"),
    LINTING_TOGGLE("linting/toggle"),
    MIGRATION_MIGRATE_ALL("migration/migrateAll"),
    LAYOUT_FORMAT("layout/format"),
    LAYOUT_CLEANUP("layout/cleanup"),
    PLUGIN_APPROVALS_DID_CHANGE("pluginApprovals/didChange"),
    TEMPLATE_PREFERENCES_DID_CHANGE("templatePreferences/didChange"),
    ADD_ONS_WEBVIEW_MESSAGE("addOns/webviewMessage"),
    ADD_ONS_OPEN("addOns/open"),
    ADD_ONS_REFRESH("addOns/refresh"),
    ADD_ONS_REVIEW("addOns/review"),
}
