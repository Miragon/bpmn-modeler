import type { DefinitionSearchPort, ModelerCapabilities } from "@miragon/bpmn-modeler";
import {
    type FormReferenceStatusQuery,
    type FormPreviewQuery,
    GetFormPreviewCommand,
    GetFormReferenceStatusCommand,
    LogWarningCommand,
    NavigateToImplementationCommand,
    NavigateToReferencedModelCommand,
    OpenScriptEditorCommand,
    SearchWorkspaceDefinitionsCommand,
    SyncActivitiesCommand,
    UpdateScriptSourceCommand,
    type WorkspaceDefinitionsQuery,
    createReplyRegistry,
} from "@miragon/bpmn-modeler-shared";
import {
    DEFAULT_FORM_PREVIEW_AUTOMATIC,
    type DetectedEngine,
    engineSupports,
    extractProcessVariables,
    referenceKindSupports,
} from "@miragon/bpmn-modeler-types";

import { FormReferenceAvailability } from "../../domain/formReferenceAvailability";
import { isModelerHandle, type SurfaceHandle } from "../../domain/surface";
import type { HostChannel } from "../../port/hostChannel";
import { createFormPreview } from "./formPreview";

// The first search indexes the workspace cold, which can walk a whole directory tree.
export const DEFINITION_SEARCH_TIMEOUT_MS = 30_000;
export const FORM_PREVIEW_TIMEOUT_MS = 30_000;

interface ProtocolCapabilityHandlers {
    FormPreviewQuery(query: FormPreviewQuery): void;
    FormReferenceStatusQuery(query: FormReferenceStatusQuery): void;
    WorkspaceDefinitionsQuery(query: WorkspaceDefinitionsQuery): void;
}

export interface ProtocolCapabilities {
    readonly capabilities: Required<ModelerCapabilities>;
    readonly handlers: ProtocolCapabilityHandlers;
    requestFormReferenceStatus(engine: DetectedEngine): void;
    setFormPreviewAutomatic(enabled: boolean): void;
    dispose(): void;
}

function createDefinitionSearchRequests(host: HostChannel): {
    port: DefinitionSearchPort;
    receive(answer: WorkspaceDefinitionsQuery): void;
} {
    const replies = createReplyRegistry<WorkspaceDefinitionsQuery>(DEFINITION_SEARCH_TIMEOUT_MS);
    return {
        port: {
            search: async ({ kind, text }) => {
                const { requestId, reply } = replies.open();
                host.postMessage(new SearchWorkspaceDefinitionsCommand(requestId, kind, text));
                const answer = await reply;
                if (!answer) {
                    host.postMessage(
                        new LogWarningCommand("No workspace search reply from the host"),
                    );
                    throw new Error("The host did not answer the search");
                }
                if (answer.failed) {
                    throw new Error("The host could not search other models");
                }
                return answer.definitions;
            },
        },
        receive: (answer) => replies.settle(answer.requestId, answer),
    };
}

/**
 * The default capability adapter that every real host (VS Code, IntelliJ,
 * Theia) runs through: each port posts its protocol command to the host, and
 * the host's answers come back through {@link ProtocolCapabilities.handlers}.
 *
 * `scripting` is always populated even though its DI cluster is C7-only;
 * `capabilityModules` gates the registration, so the surplus port on C8 is inert.
 */
export function createProtocolCapabilities(
    host: HostChannel,
    getSurface: () => SurfaceHandle,
): ProtocolCapabilities {
    const formReferences = new FormReferenceAvailability();
    let formPreviewAutomatic = DEFAULT_FORM_PREVIEW_AUTOMATIC;
    const automaticListeners = new Set<() => void>();
    const definitionSearch = createDefinitionSearchRequests(host);
    const previewReplies = createReplyRegistry<FormPreviewQuery>(FORM_PREVIEW_TIMEOUT_MS);
    const preview = createFormPreview(
        async (id, automatic) => {
            const { requestId, reply } = previewReplies.open();
            host.postMessage(new GetFormPreviewCommand(requestId, id, automatic));
            const answer = await reply;
            return (
                answer?.result ?? {
                    kind: "unavailable",
                    reason: "timeout",
                }
            );
        },
        undefined,
        (message) => host.postMessage(new LogWarningCommand(message)),
    );

    return {
        capabilities: {
            modelNavigation: {
                formPreview: {
                    open: (request) => preview.open(request),
                    isAutomaticEnabled: () => formPreviewAutomatic,
                    onAutomaticChanged: (listener) => {
                        automaticListeners.add(listener);
                        return () => {
                            automaticListeners.delete(listener);
                        };
                    },
                },
                openReference: ({ id, kind, namespace }) =>
                    host.postMessage(new NavigateToReferencedModelCommand(id, kind, namespace)),
                isReferenceAvailable: ({ id, kind }) =>
                    !referenceKindSupports(kind, "availabilityStatus") || formReferences.has(id),
                isReferenceAvailabilityKnown: () => formReferences.known,
                onReferenceAvailabilityChanged: (listener) => formReferences.onChanged(listener),
            },
            codeLink: {
                navigateToImplementation: (reference, kind) =>
                    host.postMessage(new NavigateToImplementationCommand(reference, kind)),
                syncActivities: (entries) => host.postMessage(new SyncActivitiesCommand(entries)),
            },
            scripting: {
                // The process-variable model is re-extracted per open so
                // completion reflects the diagram at the moment the tab opens.
                openScriptEditor: (event) => {
                    const surface = getSurface();
                    host.postMessage(
                        new OpenScriptEditorCommand(
                            event.elementId,
                            event.kind,
                            event.listenerIndex,
                            event.eventName,
                            event.scriptFormat,
                            event.content,
                            // Scripting is a modeler-only cluster (C7), but the
                            // port closes over the polymorphic surface.
                            isModelerHandle(surface)
                                ? extractProcessVariables(surface.getDefinitions())
                                : [],
                        ),
                    );
                },
                scriptSourceChanged: (event) =>
                    host.postMessage(
                        new UpdateScriptSourceCommand(
                            event.elementId,
                            event.kind,
                            event.listenerIndex,
                            event.content,
                        ),
                    ),
            },
            definitionSearch: definitionSearch.port,
        },
        handlers: {
            FormPreviewQuery: (query) => previewReplies.settle(query.requestId, query),
            FormReferenceStatusQuery: (query) => {
                formReferences.update(query.formIds);
            },
            WorkspaceDefinitionsQuery: (query) => definitionSearch.receive(query),
        },
        requestFormReferenceStatus: (engine) => {
            if (engineSupports(engine, "formReferenceStatus")) {
                host.postMessage(new GetFormReferenceStatusCommand());
            }
        },
        setFormPreviewAutomatic: (enabled) => {
            if (formPreviewAutomatic === enabled) return;
            formPreviewAutomatic = enabled;
            automaticListeners.forEach((listener) => listener());
        },
        dispose: () => {
            automaticListeners.clear();
            preview.dispose();
            previewReplies.cancelAll();
        },
    };
}
