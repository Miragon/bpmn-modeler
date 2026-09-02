/**
 * Modeler-specific messages for the VS Code extension ↔ webview communication protocol.
 *
 * Extends the base {@link Query} and {@link Command} abstractions from {@link messages.ts}
 * with all concrete message types required by the BPMN, DMN, and form modeler features:
 *
 * Queries (extension host → webview):
 * - {@link BpmnFileQuery}                 — deliver BPMN XML and detected engine type for rendering
 * - {@link DmnFileQuery}                  — deliver DMN XML for rendering
 * - {@link FormFileQuery}                 — deliver Camunda Form JSON for rendering
 * - {@link FormInputValuesQuery}          — deliver ephemeral form preview input data
 * - {@link ElementTemplatesQuery}         — deliver the resolved element-template list
 * - {@link BpmnlintResultsQuery}          — deliver host-computed bpmnlint results (or null to deactivate)
 * - {@link BpmnlintInPageQuery}           — tell the webview to run its in-page linter (zero-config default, or a covered workspace config)
 * - {@link BpmnModelerSettingQuery}       — deliver modeler settings (e.g. alignToOrigin)
 * - {@link DmnModelerSettingQuery}         — deliver DMN modeler settings (colorTheme only)
 * - {@link PropertiesPanelStateQuery}     — deliver the global default visibility of the properties panel
 * - {@link ClipboardQuery}                — deliver clipboard text (host mediates sandboxed reads)
 * - {@link UpdateScriptContentQuery}      — push updated script content from a virtual editor to the modeler
 * - {@link UpdateScriptFormatQuery}       — push a script-format choice (Quick-Pick) back to the modeler
 * - {@link ImplementationStatusQuery}     — push the per-activity implementation-resolution map for context-pad visibility
 *
 * Commands (webview → extension host):
 * - {@link GetBpmnFileCommand}                — webview is ready; request the BPMN file
 * - {@link GetDmnFileCommand}                 — webview is ready; request the DMN file
 * - {@link GetFormFileCommand}                — webview is ready; request the form file
 * - {@link GetFormInputValuesCommand}         — request ephemeral form preview input data
 * - {@link UpdateFormOutputValuesCommand}     — publish current form preview output data
 * - {@link GetElementTemplatesCommand}        — request the current element-template list
 * - {@link GetBpmnlintConfigCommand}          — webview is ready; trigger a host lint pass
 * - {@link GetBpmnModelerSettingCommand}      — request current modeler settings
 * - {@link GetDmnModelerSettingCommand}       — request current DMN modeler settings
 * - {@link GetPropertiesPanelStateCommand}    — request the global properties-panel visibility default
 * - {@link SetPropertiesPanelStateCommand}    — report a user toggle so the host can update the global default
 * - {@link UpdateLintResultsCommand}          — push the webview's own in-page lint findings back to the host
 * - {@link GetClipboardCommand}               — request clipboard text from the host
 * - {@link SetClipboardCommand}               — ask the host to write text to the clipboard
 * - {@link GetDiagramAsSVGCommand}            — request an SVG export of the current diagram
 * - {@link OpenScriptEditorCommand}           — request the host to open a script task in a VS Code editor
 * - {@link UpdateScriptVariablesCommand}      — push the re-extracted process-variable model to the host
 * - {@link NavigateToReferencedModelCommand}  — jump to the referenced BPMN/DMN/form file
 * - {@link NavigateToImplementationCommand}   — jump to the source file implementing a task
 * - {@link SyncActivitiesCommand}             — push the diagram's task implementation references so the host maintains the activity→code map
 *
 * @see messages.ts for the base {@link Query} and {@link Command} classes.
 */
import { Command, Query } from "./messages";
import { VariableDef } from "./processVariables";
import type {
    BpmnlintConfig,
    BpmnModelerSetting,
    BpmnViewerMode,
    DiffCounts,
    DiffOrigin,
    DiffSide,
    DmnModelerSetting,
    Engine,
    ImplementationEntry,
    ImplementationKind,
    LintResults,
    OpenScriptEditorRef,
    ScriptKind,
    ScriptTaskScript,
    Viewport,
} from "@miragon/bpmn-modeler-types";

// =================================== Queries ==================================>
export class BpmnFileQuery extends Query {
    public readonly content: string;

    public readonly engine: Engine;

    /**
     * Rendering mode. Defaults to `"modeler"` for backward compatibility; set
     * to `"viewer"` when the pane is one half of a git diff view.
     */
    public readonly viewerMode: BpmnViewerMode;
    public readonly documentRevision: number;

    constructor(
        content: string,
        engine: Engine,
        viewerMode: BpmnViewerMode = "modeler",
        documentRevision = 0,
    ) {
        super("BpmnFileQuery");
        this.content = content;
        this.engine = engine;
        this.viewerMode = viewerMode;
        this.documentRevision = documentRevision;
    }
}

export class DmnFileQuery extends Query {
    public readonly content: string;
    public readonly documentRevision: number;

    constructor(content: string, documentRevision = 0) {
        super("DmnFileQuery");
        this.content = content;
        this.documentRevision = documentRevision;
    }
}

export class FormFileQuery extends Query {
    public readonly content: string;
    public readonly documentRevision: number;

    constructor(content: string, documentRevision = 0) {
        super("FormFileQuery");
        this.content = content;
        this.documentRevision = documentRevision;
    }
}

/** Delivers the current in-memory process variables used to render a form preview. */
export class FormInputValuesQuery extends Query {
    public readonly content: string;

    constructor(content: string) {
        super("FormInputValuesQuery");
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

/**
 * Delivers the host-computed bpmnlint results for the open document so the
 * webview only renders overlays — it no longer runs the linter itself.
 *
 * Linting moved to the extension host (a full Node context) so it can resolve
 * custom `bpmnlint-plugin-*` rules and `plugin:<pkg>/recommended` configs against the
 * workspace `node_modules` exactly like the bpmnlint CLI — the browser bundle
 * could only ever see the built-in rules baked into it. A `null` result tells the
 * webview to deactivate linting and hide the lint button (no `.bpmnlintrc` found,
 * or a read/parse failure), keeping the no-config experience identical to today.
 */
export class BpmnlintResultsQuery extends Query {
    public readonly results: LintResults | null;

    constructor(results: LintResults | null) {
        super("BpmnlintResultsQuery");
        this.results = results;
    }
}

/**
 * Tells the webview the user has switched linting **off** (the
 * `miragon.bpmnModeler.linting.enabled` setting is `false`), as opposed to
 * linting merely being inactive (no `.bpmnlintrc`, or a host failure), which
 * {@link BpmnlintResultsQuery} with `null` already signals.
 *
 * The distinction matters for the webview affordance: an *inactive* linter
 * hides its chip entirely, but a *disabled* one shows a muted "Linting off"
 * chip so the user can turn it back on from inside the canvas — the pill they
 * would otherwise use is gone. Carries no payload; the state is the message.
 */
export class BpmnLintDisabledQuery extends Query {
    constructor() {
        super("BpmnLintDisabledQuery");
    }
}

/**
 * Tells the webview to run its **own in-page** linter. Two tiers travel on this
 * one message:
 *
 *  - **Payload-free** (zero-config default tier) — no workspace `.bpmnlintrc`:
 *    the webview's {@link BrowserLinter} derives the engine-aware zero-config
 *    default from the live modeler itself, so nothing has to travel.
 *  - **With `config`** (covered workspace tier) — a workspace `.bpmnlintrc`
 *    exists and the host's
 *    escalation pre-check ({@link staticUnresolvedModdleExtensions}) proved the
 *    bundled resolver can cover it: the host lints it in-page against the
 *    supplied `config` instead of running the Node linter on every edit. If the
 *    webview then reports non-empty `unresolved`, the host escalates that session
 *    to the Node linter and supersedes the in-page run.
 *
 * `configToken` is an opaque per-session version stamp echoed back on
 * {@link UpdateLintResultsCommand} so a stale in-page run against config V1 can
 * never (de-)escalate a freshly edited V2 (the host mints a new token per config
 * version). The webview treats it as an opaque value — store and echo, never
 * interpret. Both fields are absent for the payload-free tier.
 *
 * The webview then pushes its findings back through {@link UpdateLintResultsCommand}.
 * A workspace-config session that the host lints host-side (escalated tier)
 * pushes results instead, and any such push wins: {@link BpmnlintResultsQuery} /
 * {@link BpmnLintDisabledQuery} switch the webview back to the external tier and
 * supersede an in-page run.
 */
export class BpmnlintInPageQuery extends Query {
    public readonly config?: BpmnlintConfig;

    public readonly configToken?: string;

    constructor(config?: BpmnlintConfig, configToken?: string) {
        super("BpmnlintInPageQuery");
        this.config = config;
        this.configToken = configToken;
    }
}

/**
 * Centres the canvas on an element by id. VS Code strips the range for custom
 * editors and fires no diagnostic-click event, so a Problems-panel bpmnlint
 * finding reaches its element through a command link that posts this instead.
 */
export class FocusElementQuery extends Query {
    public readonly elementId: string;

    constructor(elementId: string) {
        super("FocusElementQuery");
        this.elementId = elementId;
    }
}

export class BpmnModelerSettingQuery extends Query {
    public readonly setting: BpmnModelerSetting;

    constructor(setting: BpmnModelerSetting) {
        super("BpmnModelerSettingQuery");
        this.setting = setting;
    }
}

export class DmnModelerSettingQuery extends Query {
    public readonly setting: DmnModelerSetting;

    constructor(setting: DmnModelerSetting) {
        super("DmnModelerSettingQuery");
        this.setting = setting;
    }
}

/**
 * Delivers the globally persisted default visibility of the BPMN properties
 * panel to a newly opened webview.  The webview uses this value only when its
 * own webview state has no `panelVisible` entry yet — once a live webview has
 * its own state, it ignores further global changes so that toggling the panel
 * on one side-by-side diagram does not affect its neighbour.
 */
export class PropertiesPanelStateQuery extends Query {
    public readonly visible: boolean;

    constructor(visible: boolean) {
        super("PropertiesPanelStateQuery");
        this.visible = visible;
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

/**
 * Persists a script-format choice (e.g. picked via Quick-Pick when the
 * BPMN model had no language set yet) back to the BPMN model so subsequent
 * opens skip the prompt. Mirrors {@link UpdateScriptContentQuery}'s
 * addressing scheme.
 */
export class UpdateScriptFormatQuery extends Query {
    public readonly elementId: string;

    public readonly kind: ScriptKind;

    public readonly listenerIndex: number | undefined;

    public readonly scriptFormat: string;

    constructor(
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        scriptFormat: string,
    ) {
        super("UpdateScriptFormatQuery");
        this.elementId = elementId;
        this.kind = kind;
        this.listenerIndex = listenerIndex;
        this.scriptFormat = scriptFormat;
    }
}

/**
 * Delivers updated script content from a virtual VS Code editor back to the
 * BPMN modeler webview so it can write the change into the right moddle
 * property and persist it through the bpmn-js command stack.
 *
 * For listener kinds, {@link listenerIndex} addresses the listener within
 * the parent's filtered list of listeners of that specific type.
 */
export class UpdateScriptContentQuery extends Query {
    public readonly elementId: string;

    public readonly kind: ScriptKind;

    public readonly listenerIndex: number | undefined;

    public readonly content: string;

    constructor(
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        content: string,
    ) {
        super("UpdateScriptContentQuery");
        this.elementId = elementId;
        this.kind = kind;
        this.listenerIndex = listenerIndex;
        this.content = content;
    }
}

/**
 * Broadcasts the host's *full* set of currently-open inline-script editors for
 * one BPMN editor so the webview can make the matching properties-panel script
 * fields read-only (single-writer arbitration): while a script tab owns the
 * content, a panel edit would be silently clobbered by the next keystroke
 * streamed from that tab.
 *
 * A full-set broadcast (not a delta) is sent on every open/close/handshake:
 * the webview reloads whenever the host hides and re-shows it, wiping any
 * incremental lock state, so only an idempotent replace stays correct across
 * reloads. An empty array means nothing is open — the panel is fully editable.
 */
export class UpdateOpenScriptEditorsQuery extends Query {
    public readonly openScripts: OpenScriptEditorRef[];

    constructor(openScripts: OpenScriptEditorRef[]) {
        super("UpdateOpenScriptEditorsQuery");
        this.openScripts = openScripts;
    }
}

/**
 * Delivers the user's language selection to the webview for live translation.
 */
export class LanguageQuery extends Query {
    public readonly locale: string;

    constructor(locale: string) {
        super("LanguageQuery");
        this.locale = locale;
    }
}

/**
 * Pushes the host's maintained activity→code map down to the webview as a flat
 * `key → resolved` lookup so the "Go to implementation" context-pad entry can
 * hide for tasks whose implementation does not exist in the workspace.
 *
 * Keys are built with `implementationStatusKey` (from
 * `@miragon/bpmn-modeler-types`) — `${activityId}::${reference}`,
 * not the bare activity id. Folding the reference into the key makes a reference
 * edit self-invalidating: the new reference produces a key the webview has not
 * seen yet, so the entry shows optimistically until the host's next push lands,
 * instead of briefly reusing the stale resolution of the old reference.
 *
 * A missing key means "unknown" — the webview shows the entry optimistically.
 * Only an explicit `false` hides it. That is what keeps a cold first open
 * flash-free (show, never flash-to-hidden) while still hiding once the host has
 * confirmed there is nothing to navigate to.
 */
export class ImplementationStatusQuery extends Query {
    public readonly resolved: Record<string, boolean>;

    constructor(resolved: Record<string, boolean>) {
        super("ImplementationStatusQuery");
        this.resolved = resolved;
    }
}

/** Resolvable top-level form ids in the current workspace search scope. */
export class FormReferenceStatusQuery extends Query {
    public readonly formIds: string[];

    constructor(formIds: string[]) {
        super("FormReferenceStatusQuery");
        this.formIds = formIds;
    }
}

/**
 * <================================== Queries ===================================
 *
 * =================================== Commands ==================================>
 */
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

export class GetFormFileCommand extends Command {
    constructor() {
        super("GetFormFileCommand");
    }
}

/** Requests the non-persistent input JSON associated with this form editor session. */
export class GetFormInputValuesCommand extends Command {
    constructor() {
        super("GetFormInputValuesCommand");
    }
}

/** Publishes the form preview's current submit data to its read-only virtual document. */
export class UpdateFormOutputValuesCommand extends Command {
    public readonly content: string;

    constructor(content: string) {
        super("UpdateFormOutputValuesCommand");
        this.content = content;
    }
}

export class GetElementTemplatesCommand extends Command {
    constructor() {
        super("GetElementTemplatesCommand");
    }
}

/**
 * Sent by the BPMN webview on (re)load to trigger a host lint pass. The host
 * discovers the nearest `.bpmnlintrc`, runs bpmnlint, and answers with
 * {@link BpmnlintResultsQuery}. Hosts that do not implement lint discovery (e.g.
 * the IntelliJ bridge) simply have no handler for it, so linting stays dormant
 * and the webview is unaffected.
 */
export class GetBpmnlintConfigCommand extends Command {
    constructor() {
        super("GetBpmnlintConfigCommand");
    }
}

export class GetBpmnModelerSettingCommand extends Command {
    constructor() {
        super("GetBpmnModelerSettingCommand");
    }
}

export class GetDmnModelerSettingCommand extends Command {
    constructor() {
        super("GetDmnModelerSettingCommand");
    }
}

/**
 * Webview-side trigger used during startup to request the host's current
 * global default for the properties-panel visibility.  The host answers with
 * {@link PropertiesPanelStateQuery}.
 */
export class GetPropertiesPanelStateCommand extends Command {
    constructor() {
        super("GetPropertiesPanelStateCommand");
    }
}

/**
 * Informs the extension host that the user has toggled the properties panel
 * in this webview.  The host persists the new value as the global default so
 * the next freshly opened BPMN webview picks it up.  Existing, already-open
 * webviews keep their own in-memory state and are intentionally not updated.
 */
export class SetPropertiesPanelStateCommand extends Command {
    public readonly visible: boolean;

    constructor(visible: boolean) {
        super("SetPropertiesPanelStateCommand");
        this.visible = visible;
    }
}

/**
 * Sent by the BPMN webview when the user toggles linting from inside the canvas
 * — the "Turn off linting" affordance on the lint pill, or the "Enable" action
 * on the disabled chip. The host persists the choice to the
 * `miragon.bpmnModeler.linting.enabled` User setting (the single source of
 * truth), which re-lints and pushes the new state back down, so the webview
 * never flips its own overlays optimistically. Hosts without the setting (e.g.
 * the IntelliJ bridge) simply ignore it and linting is unaffected.
 */
export class SetLintingEnabledCommand extends Command {
    public readonly enabled: boolean;

    constructor(enabled: boolean) {
        super("SetLintingEnabledCommand");
        this.enabled = enabled;
    }
}

/**
 * Sent by the BPMN webview after every **in-page** lint pass so the host can
 * feed its own chrome — the VS Code Problems panel and status bar — from results
 * the webview computed. Fired whenever the host activated in-page linting via
 * {@link BpmnlintInPageQuery}, in either tier: the payload-free zero-config
 * default or the covered workspace-config in-page run. An escalated workspace
 * session lints host-side instead and never receives this. `unresolved` carries
 * the rules the browser resolver could not honour (informational for the default
 * tier; the escalation trigger for the covered workspace tier — a non-empty list
 * flips the session to the Node linter). Hosts without a Problems surface (the
 * IntelliJ
 * bridge) accept it and update whatever chrome they have.
 *
 * `configToken` echoes the token the driving {@link BpmnlintInPageQuery} carried
 * (absent for the payload-free default tier) so the host can pair a run with the
 * config version it linted and drop a stale run against a superseded config.
 */
export class UpdateLintResultsCommand extends Command {
    public readonly results: LintResults;

    public readonly unresolved: readonly string[];

    public readonly configToken?: string;

    constructor(results: LintResults, unresolved: readonly string[], configToken?: string) {
        super("UpdateLintResultsCommand");
        this.results = results;
        this.unresolved = unresolved;
        this.configToken = configToken;
    }
}

export class GetClipboardCommand extends Command {
    constructor() {
        super("GetClipboardCommand");
    }
}

/**
 * Sent by the BPMN webview when the user clicks the "Navigate to referenced
 * model" context-pad entry for a Call Activity, Business Rule Task, or User
 * Task. The host searches the workspace for `.bpmn`, `.dmn`, or `.form` files
 * declaring the requested id and either opens the unique
 * match, shows a QuickPick when several files match, or shows an info
 * notification when no match is found.
 */
export type ReferenceKind = "process" | "decision" | "form";

export class NavigateToReferencedModelCommand extends Command {
    public readonly referenceId: string;

    public readonly referenceKind: ReferenceKind;

    constructor(referenceId: string, referenceKind: ReferenceKind) {
        super("NavigateToReferencedModelCommand");
        this.referenceId = referenceId;
        this.referenceKind = referenceKind;
    }
}

/** Requests the resolvable Camunda Form ids for context-pad visibility. */
export class GetFormReferenceStatusCommand extends Command {
    constructor() {
        super("GetFormReferenceStatusCommand");
    }
}

/**
 * Sent by the BPMN webview when the user clicks "Go to implementation" on a
 * service / send / business-rule task that carries a Camunda implementation
 * reference. The host resolves the {@link reference} according to {@link kind}
 * and opens the unique source file, shows a QuickPick on multiple matches, or
 * an info notification when nothing resolves.
 *
 * Only the reference string and its kind cross the boundary — workspace file
 * paths never leave the host. Resolution happens on click, on demand.
 */
export class NavigateToImplementationCommand extends Command {
    public readonly reference: string;

    public readonly kind: ImplementationKind;

    constructor(reference: string, kind: ImplementationKind) {
        super("NavigateToImplementationCommand");
        this.reference = reference;
        this.kind = kind;
    }
}

/**
 * Sent by the BPMN webview whenever the diagram's set of task implementation
 * references may have changed (on import and after edits, debounced). Carries
 * the full current list so the host can diff it against the activity→code map
 * it already holds and do filesystem work only for the delta.
 *
 * This is intentionally a cheap list of id/kind/reference strings, never
 * resolved paths — resolution is the host's job and stays on the host.
 */
export class SyncActivitiesCommand extends Command {
    public readonly entries: ImplementationEntry[];

    constructor(entries: ImplementationEntry[]) {
        super("SyncActivitiesCommand");
        this.entries = entries;
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

/**
 * Sent by the BPMN webview when the user activates "Edit Script" on a
 * scriptable element (script task, execution listener, or task listener).
 *
 * The host opens the inline script in an editor tab (backed by a real file
 * under the config folder's `tmp/scripting/` directory) and
 * streams edits back via {@link UpdateScriptContentQuery}. {@link kind} and
 * {@link listenerIndex} together address which script's content is being
 * edited so the host can supply the correct type stubs and the webview can
 * route updates back to the right moddle property.
 *
 * For listener kinds, {@link eventName} (e.g. `"start"`, `"create"`) is the
 * listener's `event` attribute and is surfaced in the editor tab title.
 *
 * {@link variables} seeds the host's process-variable model so completion is
 * accurate from the first keystroke; it is an optional trailing parameter so
 * older webview/host pairs that don't send it stay compatible.
 */
export class OpenScriptEditorCommand extends Command {
    public readonly elementId: string;

    public readonly kind: ScriptKind;

    public readonly listenerIndex: number | undefined;

    public readonly eventName: string | undefined;

    public readonly scriptFormat: string;

    public readonly content: string;

    public readonly variables: VariableDef[];

    constructor(
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        eventName: string | undefined,
        scriptFormat: string,
        content: string,
        variables: VariableDef[] = [],
    ) {
        super("OpenScriptEditorCommand");
        this.elementId = elementId;
        this.kind = kind;
        this.listenerIndex = listenerIndex;
        this.eventName = eventName;
        this.scriptFormat = scriptFormat;
        this.content = content;
        this.variables = variables;
    }
}

/**
 * Host → webview: asks the active BPMN editor for every `bpmn:ScriptTask` that
 * carries an inline script, so the "Generate Script Files for Script Tasks"
 * command can materialise them all at once. Carries no payload — the webview
 * owns the element scan and replies with a single {@link OpenScriptEditorsCommand}.
 */
export class OpenAllScriptTasksQuery extends Query {
    constructor() {
        super("OpenAllScriptTasksQuery");
    }
}

/**
 * Webview → host: the batch reply to {@link OpenAllScriptTasksQuery}, carrying
 * every inline script task in the diagram plus one shared process-variable model.
 *
 * A single bulk reply (rather than the webview re-firing N
 * {@link OpenScriptEditorCommand}s) lets the host materialise the script files
 * sequentially with a `for … await` loop: {@link ModelerEditorController}
 * dispatches incoming messages concurrently, so N separate commands would stack
 * the per-script format quick-picks. The command only writes files to disk — no
 * tabs are opened; live sync begins when the user opens a generated file.
 * {@link variables} is sent once because it is identical for every script in the
 * same diagram.
 */
export class OpenScriptEditorsCommand extends Command {
    public readonly scripts: ScriptTaskScript[];

    public readonly variables: VariableDef[];

    constructor(scripts: ScriptTaskScript[], variables: VariableDef[] = []) {
        super("OpenScriptEditorsCommand");
        this.scripts = scripts;
        this.variables = variables;
    }
}

/**
 * Sent by the BPMN webview when a script's content changed in the *model*
 * while a host editor tab owns it — canvas undo/redo or an external document
 * reload rewrites the moddle property underneath the tab. The host overwrites
 * the open buffer with {@link content} so the tab reflects what the user asked
 * for (single-writer: the model side wins for non-keystroke mutations).
 *
 * `content === undefined` means the element or its script no longer exists
 * (deletion, element replace): the host closes the tab and deletes the file.
 *
 * The webview only posts on a real difference against the last content it
 * applied or received for that script, so keystrokes the tab itself streamed
 * in via {@link UpdateScriptContentQuery} never echo back.
 */
export class UpdateScriptSourceCommand extends Command {
    public readonly elementId: string;

    public readonly kind: ScriptKind;

    public readonly listenerIndex: number | undefined;

    public readonly content: string | undefined;

    constructor(
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        content: string | undefined,
    ) {
        super("UpdateScriptSourceCommand");
        this.elementId = elementId;
        this.kind = kind;
        this.listenerIndex = listenerIndex;
        this.content = content;
    }
}

/**
 * Sent by the BPMN webview whenever the process-variable model changes (debounced
 * + change-gated on the webview side) so open script editors get live variable
 * completion without reopening. Carries the full re-extracted model — the host
 * replaces, never merges.
 */
export class UpdateScriptVariablesCommand extends Command {
    public readonly variables: VariableDef[];

    constructor(variables: VariableDef[]) {
        super("UpdateScriptVariablesCommand");
        this.variables = variables;
    }
}

// <================================== Commands ===================================

// =================================== Deployment ==================================>

/**
 * Discriminant values for supported authentication types.
 */
export type AuthTypePayload = "none" | "basic" | "oauth2";

/**
 * Serialisable auth configuration exchanged between extension host and webview.
 */
export interface AuthConfigPayload {
    readonly authType: AuthTypePayload;
    readonly username?: string;
    readonly password?: string;
    readonly clientId?: string;
    readonly clientSecret?: string;
    readonly tokenEndpoint?: string;
    readonly audience?: string;
}

/**
 * Shared payload shape used in deploy commands and queries.
 */
export interface DeploymentConfigPayload {
    readonly deploymentName: string;
    readonly tenantId: string;
    readonly endpoint: string;
    readonly engine: Engine;
    readonly mainFilePath: string;
    readonly additionalFilePaths: string[];
    readonly auth: AuthConfigPayload;
}

/**
 * Pre-populated defaults sent from the extension host to the deployment form.
 */
export interface DeploymentFormDefaults {
    readonly deploymentName: string;
    readonly tenantId: string;
    readonly endpoint: string;
    readonly engine: Engine;
    readonly authType: AuthTypePayload;
    readonly tokenEndpoint?: string;
    readonly audience?: string;
}

// --- Webview → Extension commands ---

/**
 * Sent by the deployment webview on load to request pre-populated form defaults.
 */
export class RequestFormDefaultsCommand extends Command {
    constructor() {
        super("RequestFormDefaultsCommand");
    }
}

/**
 * Sent by the deployment webview when the user clicks Deploy.
 */
export class DeployCommand extends Command {
    public readonly config: DeploymentConfigPayload;

    constructor(config: DeploymentConfigPayload) {
        super("DeployCommand");
        this.config = config;
    }
}

/**
 * Sent by the deployment webview when the user clicks the + button for additional files.
 */
export class RequestAdditionalFilesCommand extends Command {
    constructor() {
        super("RequestAdditionalFilesCommand");
    }
}

/**
 * Sent by the deployment webview to request previously stored credentials.
 */
export class RequestStoredCredentialsCommand extends Command {
    constructor() {
        super("RequestStoredCredentialsCommand");
    }
}

// --- Extension → Webview queries ---

/**
 * Sent by the extension host to pre-populate the deployment form.
 */
export class FormDefaultsQuery extends Query {
    public readonly defaults: DeploymentFormDefaults;

    constructor(defaults: DeploymentFormDefaults) {
        super("FormDefaultsQuery");
        this.defaults = defaults;
    }
}

/**
 * Sent by the extension host after a deployment attempt completes.
 */
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

/**
 * Sent by the extension host with previously stored credentials.
 */
export class StoredCredentialsQuery extends Query {
    public readonly auth: AuthConfigPayload;

    constructor(auth: AuthConfigPayload) {
        super("StoredCredentialsQuery");
        this.auth = auth;
    }
}

/**
 * Sent by the extension host with the paths selected via QuickPick.
 */
export class AdditionalFilesQuery extends Query {
    public readonly filePaths: string[];

    constructor(filePaths: string[]) {
        super("AdditionalFilesQuery");
        this.filePaths = filePaths;
    }
}

// <================================== Deployment ===================================

// =================================== Start Instance ==================================>

/**
 * Serialisable start-instance configuration exchanged between extension host and webview.
 */
export interface StartInstanceConfigPayload {
    readonly processDefinitionKey: string;
    readonly endpoint: string;
    readonly engine: Engine;
    readonly auth: AuthConfigPayload;
    readonly payloadFilePath: string;
}

// --- Webview → Extension commands ---

/**
 * Sent by the webview when the user clicks Start Instance.
 */
export class StartInstanceCommand extends Command {
    public readonly config: StartInstanceConfigPayload;

    constructor(config: StartInstanceConfigPayload) {
        super("StartInstanceCommand");
        this.config = config;
    }
}

/**
 * Sent by the webview to request payload file discovery and QuickPick selection.
 */
export class RequestPayloadFilesCommand extends Command {
    constructor() {
        super("RequestPayloadFilesCommand");
    }
}

/**
 * Sent by the webview to request the process definition key from the current BPMN file.
 */
export class RequestProcessDefinitionKeyCommand extends Command {
    constructor() {
        super("RequestProcessDefinitionKeyCommand");
    }
}

// --- Extension → Webview queries ---

/**
 * Sent by the extension host after a start-instance attempt completes.
 */
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

/**
 * Sent by the extension host with the single payload file selected via QuickPick.
 */
export class SelectedPayloadFileQuery extends Query {
    public readonly filePath: string;

    public readonly label: string;

    constructor(filePath: string, label: string) {
        super("SelectedPayloadFileQuery");
        this.filePath = filePath;
        this.label = label;
    }
}

/**
 * Sent by the extension host with the process definition key extracted from BPMN.
 */
export class ProcessDefinitionKeyQuery extends Query {
    public readonly processDefinitionKey: string;

    constructor(processDefinitionKey: string) {
        super("ProcessDefinitionKeyQuery");
        this.processDefinitionKey = processDefinitionKey;
    }
}

// <================================== Start Instance ===================================

// =================================== BPMN Diff ==================================>

/**
 * Sent from the extension host to each webview pane once a diff pair is armed
 * and `bpmn-js-differ` has produced its result.  Each side receives only the
 * element ids relevant to its canvas (e.g. `_removed` ids on the `before`
 * side only; `_added` on `after` only; `_changed` and `_layoutChanged` on
 * both because the elements exist in both versions).
 */
export class ApplyDiffHighlightsQuery extends Query {
    public readonly side: DiffSide;

    public readonly added: readonly string[];

    public readonly removed: readonly string[];

    public readonly changed: readonly string[];

    public readonly layoutChanged: readonly string[];

    public readonly counts: DiffCounts;

    /**
     * Pre-merged, sequence-flow-ordered list of all ids the stepper should
     * cycle through (start event → end event order, with removed elements
     * anchored next to surviving neighbours).  Both panes receive the same
     * array so Next/Prev keeps the two cursors in lockstep.
     */
    public readonly navigationOrder: readonly string[];

    /**
     * How the diff was opened.  Drives origin-specific legend affordances:
     * compare-files panes show a filename label and a swap button; SCM panes
     * show neither because VS Code already carries that information on the
     * tab title.
     */
    public readonly origin: DiffOrigin;

    /**
     * Basename of this pane's document URI, rendered on the legend when
     * {@link origin} is `compare-files`.  Always sent (even for `scm` origin)
     * so the message shape stays uniform; the webview decides whether to
     * display it based on {@link origin}.
     */
    public readonly paneFilename: string;

    constructor(
        side: DiffSide,
        added: readonly string[],
        removed: readonly string[],
        changed: readonly string[],
        layoutChanged: readonly string[],
        counts: DiffCounts,
        navigationOrder: readonly string[],
        origin: DiffOrigin,
        paneFilename: string,
    ) {
        super("ApplyDiffHighlightsQuery");
        this.side = side;
        this.added = added;
        this.removed = removed;
        this.changed = changed;
        this.layoutChanged = layoutChanged;
        this.counts = counts;
        this.navigationOrder = navigationOrder;
        this.origin = origin;
        this.paneFilename = paneFilename;
    }
}

/**
 * Sent from the host to a pane to apply the partner pane's viewport.  The
 * receiving pane must suppress its next outgoing `ViewportChangedCommand` to
 * avoid a feedback loop.
 */
export class SyncViewportQuery extends Query {
    public readonly viewport: Viewport;

    constructor(viewport: Viewport) {
        super("SyncViewportQuery");
        this.viewport = viewport;
    }
}

/**
 * Sent from a viewer pane after a user-initiated pan or zoom.  The host
 * forwards the viewport to the partner pane via {@link SyncViewportQuery}.
 */
export class ViewportChangedCommand extends Command {
    public readonly viewport: Viewport;

    constructor(viewport: Viewport) {
        super("ViewportChangedCommand");
        this.viewport = viewport;
    }
}

/**
 * Sent from a viewer pane after the user advances the diff stepper.  The host
 * forwards the new cursor index to the partner pane via {@link SyncCursorQuery}
 * so both panes' steppers stay in lockstep.  The index refers to a position in
 * the shared `navigationOrder` array carried on {@link ApplyDiffHighlightsQuery}.
 */
export class CursorChangedCommand extends Command {
    public readonly index: number;

    constructor(index: number) {
        super("CursorChangedCommand");
        this.index = index;
    }
}

/**
 * Sent from the host to a pane to apply the partner pane's stepper cursor.
 * The receiving pane focuses (or anchors) the element at the given index in
 * its local `navigationOrder` and must NOT re-emit `CursorChangedCommand`,
 * otherwise the two panes would ping-pong indefinitely.
 */
export class SyncCursorQuery extends Query {
    public readonly index: number;

    constructor(index: number) {
        super("SyncCursorQuery");
        this.index = index;
    }
}

/**
 * Sent from a viewer pane once it has finished importing the initial XML
 * diagram.  The host tracks this per pane to know when a diff pair is armed
 * (both panes ready) and it can safely post {@link ApplyDiffHighlightsQuery}.
 */
export class DiffReadyCommand extends Command {
    constructor() {
        super("DiffReadyCommand");
    }
}

/**
 * Sent from a compare-files viewer pane when the user clicks the swap button
 * on the legend.  The host looks up the session from the sending pane's URI,
 * verifies the origin is `compare-files`, and reopens the diff with the two
 * URIs swapped.  SCM panes never emit this — the button is hidden there.
 */
export class SwapCompareSidesCommand extends Command {
    constructor() {
        super("SwapCompareSidesCommand");
    }
}

// <================================== BPMN Diff ===================================
