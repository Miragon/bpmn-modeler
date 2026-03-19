/**
 * Modeler-specific messages for the VS Code extension ↔ webview communication protocol.
 *
 * Extends the base {@link Query} and {@link Command} abstractions from {@link messages.ts}
 * with all concrete message types required by the BPMN and DMN modeler features:
 *
 * Queries (extension host → webview):
 * - {@link BpmnFileQuery}            — deliver BPMN XML and detected engine type for rendering
 * - {@link DmnFileQuery}             — deliver DMN XML for rendering
 * - {@link ElementTemplatesQuery}    — deliver the resolved element-template list
 * - {@link BpmnModelerSettingQuery}  — deliver modeler settings (e.g. alignToOrigin)
 * - {@link ClipboardQuery}           — deliver clipboard text (host mediates sandboxed reads)
 *
 * Commands (webview → extension host):
 * - {@link GetBpmnFileCommand}            — webview is ready; request the BPMN file
 * - {@link GetDmnFileCommand}             — webview is ready; request the DMN file
 * - {@link GetElementTemplatesCommand}    — request the current element-template list
 * - {@link GetBpmnModelerSettingCommand}  — request current modeler settings
 * - {@link GetClipboardCommand}           — request clipboard text from the host
 * - {@link SetClipboardCommand}           — ask the host to write text to the clipboard
 * - {@link GetDiagramAsSVGCommand}        — request an SVG export of the current diagram
 *
 * @see messages.ts for the base {@link Query} and {@link Command} classes.
 */
import { Command, Query } from "./messages";

// =================================== Queries ==================================>
export class BpmnFileQuery extends Query {
    public readonly content: string;

    public readonly engine: "c7" | "c8";

    constructor(content: string, engine: "c7" | "c8") {
        super("BpmnFileQuery");
        this.content = content;
        this.engine = engine;
    }
}

export class DmnFileQuery extends Query {
    public readonly content: string;

    constructor(content: string) {
        super("DmnFileQuery");
        this.content = content;
    }
}

export class ElementTemplatesQuery extends Query {
    public readonly elementTemplates: JSON[];

    constructor(elementTemplates: any[]) {
        super("ElementTemplatesQuery");
        this.elementTemplates = elementTemplates;
    }
}

export interface BpmnModelerSetting {
    readonly alignToOrigin: boolean;
    readonly showTransactionBoundaries: boolean;
}

export class BpmnModelerSettingQuery extends Query {
    public readonly setting: BpmnModelerSetting;

    constructor(setting: BpmnModelerSetting) {
        super("BpmnModelerSettingQuery");
        this.setting = setting;
    }
}

export class ClipboardQuery extends Query {
    public readonly text: string;

    constructor(text: string) {
        super("ClipboardQuery");
        this.text = text;
    }
}

export class TextClipboardQuery extends Query {
    public readonly text: string;

    constructor(text: string) {
        super("TextClipboardQuery");
        this.text = text;
    }
}

// <================================== Queries ===================================
//
// =================================== Commands ==================================>
export class GetBpmnFileCommand extends Command {
    constructor() {
        super("GetBpmnFileCommand");
    }
}

export class GetDiagramAsSVGCommand extends Command {
    svg?: string;

    constructor() {
        super("GetDiagramAsSVGCommand");
    }
}

export class GetDmnFileCommand extends Command {
    constructor() {
        super("GetDmnFileCommand");
    }
}

export class GetElementTemplatesCommand extends Command {
    constructor() {
        super("GetElementTemplatesCommand");
    }
}

export class GetBpmnModelerSettingCommand extends Command {
    constructor() {
        super("GetBpmnModelerSettingCommand");
    }
}

export class GetClipboardCommand extends Command {
    constructor() {
        super("GetClipboardCommand");
    }
}

export class SetClipboardCommand extends Command {
    public readonly text: string;

    constructor(text: string) {
        super("SetClipboardCommand");
        this.text = text;
    }
}

export class GetTextClipboardCommand extends Command {
    constructor() {
        super("GetTextClipboardCommand");
    }
}

export class SetTextClipboardCommand extends Command {
    public readonly text: string;

    constructor(text: string) {
        super("SetTextClipboardCommand");
        this.text = text;
    }
}

// <================================== Commands ===================================

// =================================== Errors ==================================>
export class NoModelerError extends Error {
    constructor() {
        super("Modeler is not initialized!");
    }
}

// <================================== Errors ===================================

// =================================== Functions ==================================>
/**
 * Create a list of information that will be sent to the backend and get logged.
 * @param errors A list of further information.
 */
export function formatErrors(errors: string[]): string {
    let msg = "";
    if (errors && errors.length > 0) {
        for (const message of errors) {
            msg += `\n- ${message}`;
        }
    }
    return msg;
}

// <================================== Functions ===================================

// =================================== Deployment ==================================>

/** Discriminant values for supported authentication types. */
export type AuthTypePayload = "none" | "basic" | "oauth2";

/** Serialisable auth configuration exchanged between extension host and webview. */
export interface AuthConfigPayload {
    readonly authType: AuthTypePayload;
    readonly username?: string;
    readonly password?: string;
    readonly clientId?: string;
    readonly clientSecret?: string;
    readonly tokenEndpoint?: string;
    readonly audience?: string;
}

/** Shared payload shape used in deploy commands and queries. */
export interface DeploymentConfigPayload {
    readonly deploymentName: string;
    readonly tenantId: string;
    readonly endpoint: string;
    readonly engine: "c7" | "c8";
    readonly mainFilePath: string;
    readonly additionalFilePaths: string[];
    readonly auth: AuthConfigPayload;
}

/** Pre-populated defaults sent from the extension host to the deployment form. */
export interface DeploymentFormDefaults {
    readonly deploymentName: string;
    readonly tenantId: string;
    readonly endpoint: string;
    readonly engine: "c7" | "c8";
    readonly authType: AuthTypePayload;
    readonly tokenEndpoint?: string;
    readonly audience?: string;
}

// --- Webview → Extension commands ---

/** Sent by the deployment webview on load to request pre-populated form defaults. */
export class RequestFormDefaultsCommand extends Command {
    constructor() {
        super("RequestFormDefaultsCommand");
    }
}

/** Sent by the deployment webview when the user clicks Deploy. */
export class DeployCommand extends Command {
    public readonly config: DeploymentConfigPayload;

    constructor(config: DeploymentConfigPayload) {
        super("DeployCommand");
        this.config = config;
    }
}

/** Sent by the deployment webview when the user clicks the + button for additional files. */
export class RequestAdditionalFilesCommand extends Command {
    constructor() {
        super("RequestAdditionalFilesCommand");
    }
}

/** Sent by the deployment webview to request previously stored credentials. */
export class RequestStoredCredentialsCommand extends Command {
    constructor() {
        super("RequestStoredCredentialsCommand");
    }
}

// --- Extension → Webview queries ---

/** Sent by the extension host to pre-populate the deployment form. */
export class FormDefaultsQuery extends Query {
    public readonly defaults: DeploymentFormDefaults;

    constructor(defaults: DeploymentFormDefaults) {
        super("FormDefaultsQuery");
        this.defaults = defaults;
    }
}

/** Sent by the extension host after a deployment attempt completes. */
export class DeploymentResultQuery extends Query {
    public readonly success: boolean;

    public readonly message: string;

    public readonly deploymentId: string | undefined;

    constructor(success: boolean, message: string, deploymentId?: string) {
        super("DeploymentResultQuery");
        this.success = success;
        this.message = message;
        this.deploymentId = deploymentId;
    }
}

/** Sent by the extension host with previously stored credentials. */
export class StoredCredentialsQuery extends Query {
    public readonly auth: AuthConfigPayload;

    constructor(auth: AuthConfigPayload) {
        super("StoredCredentialsQuery");
        this.auth = auth;
    }
}

/** Sent by the extension host with the paths selected via QuickPick. */
export class AdditionalFilesQuery extends Query {
    public readonly filePaths: string[];

    constructor(filePaths: string[]) {
        super("AdditionalFilesQuery");
        this.filePaths = filePaths;
    }
}

// <================================== Deployment ===================================

// =================================== Start Instance ==================================>

/** Serialisable start-instance configuration exchanged between extension host and webview. */
export interface StartInstanceConfigPayload {
    readonly processDefinitionKey: string;
    readonly endpoint: string;
    readonly engine: "c7" | "c8";
    readonly auth: AuthConfigPayload;
    readonly payloadFilePath: string;
}

// --- Webview → Extension commands ---

/** Sent by the webview when the user clicks Start Instance. */
export class StartInstanceCommand extends Command {
    public readonly config: StartInstanceConfigPayload;

    constructor(config: StartInstanceConfigPayload) {
        super("StartInstanceCommand");
        this.config = config;
    }
}

/** Sent by the webview to request payload file discovery and QuickPick selection. */
export class RequestPayloadFilesCommand extends Command {
    constructor() {
        super("RequestPayloadFilesCommand");
    }
}

/** Sent by the webview to request the process definition key from the current BPMN file. */
export class RequestProcessDefinitionKeyCommand extends Command {
    constructor() {
        super("RequestProcessDefinitionKeyCommand");
    }
}

// --- Extension → Webview queries ---

/** Sent by the extension host after a start-instance attempt completes. */
export class StartInstanceResultQuery extends Query {
    public readonly success: boolean;

    public readonly message: string;

    public readonly processInstanceId: string | undefined;

    constructor(success: boolean, message: string, processInstanceId?: string) {
        super("StartInstanceResultQuery");
        this.success = success;
        this.message = message;
        this.processInstanceId = processInstanceId;
    }
}

/** Sent by the extension host with the single payload file selected via QuickPick. */
export class SelectedPayloadFileQuery extends Query {
    public readonly filePath: string;

    public readonly label: string;

    constructor(filePath: string, label: string) {
        super("SelectedPayloadFileQuery");
        this.filePath = filePath;
        this.label = label;
    }
}

/** Sent by the extension host with the process definition key extracted from BPMN. */
export class ProcessDefinitionKeyQuery extends Query {
    public readonly processDefinitionKey: string;

    constructor(processDefinitionKey: string) {
        super("ProcessDefinitionKeyQuery");
        this.processDefinitionKey = processDefinitionKey;
    }
}

// <================================== Start Instance ===================================
