import type { DefinitionSearchPort, ModelerCapabilities } from "@miragon/bpmn-modeler";
import {
    type FormReferenceStatusQuery,
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
    extractProcessVariables,
} from "@miragon/bpmn-modeler-shared";
import type { DetectedEngine } from "@miragon/bpmn-modeler-types";

import { isModelerHandle, type SurfaceHandle } from "../surface";
import type { HostChannel } from "./hostChannel";

// The first search indexes the workspace cold, which can walk a whole directory tree.
export const DEFINITION_SEARCH_TIMEOUT_MS = 30_000;

interface ProtocolCapabilityHandlers {
    FormReferenceStatusQuery(query: FormReferenceStatusQuery): void;
    WorkspaceDefinitionsQuery(query: WorkspaceDefinitionsQuery): void;
}

export interface ProtocolCapabilities {
    readonly capabilities: Required<ModelerCapabilities>;
    readonly handlers: ProtocolCapabilityHandlers;
    requestFormReferenceStatus(engine: DetectedEngine): void;
}

/** The form ids the host last reported as resolvable. */
export class FormReferenceAvailability {
    private availableFormIds: ReadonlySet<string> = new Set();
    private readonly listeners = new Set<() => void>();

    has(formId: string): boolean {
        return this.availableFormIds.has(formId);
    }

    onChanged(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /** @returns whether the set of available form ids changed. */
    update(formIds: readonly string[]): boolean {
        const nextFormIds = new Set(formIds);
        const changed =
            nextFormIds.size !== this.availableFormIds.size ||
            [...nextFormIds].some((formId) => !this.availableFormIds.has(formId));
        this.availableFormIds = nextFormIds;
        if (changed) {
            this.listeners.forEach((listener) => listener());
        }
        return changed;
    }
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
    const definitionSearch = createDefinitionSearchRequests(host);

    return {
        capabilities: {
            modelNavigation: {
                openReference: ({ id, kind }) =>
                    host.postMessage(new NavigateToReferencedModelCommand(id, kind)),
                isReferenceAvailable: ({ id, kind }) => kind !== "form" || formReferences.has(id),
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
            FormReferenceStatusQuery: (query) => {
                formReferences.update(query.formIds);
            },
            WorkspaceDefinitionsQuery: (query) => definitionSearch.receive(query),
        },
        requestFormReferenceStatus: (engine) => {
            if (engine === "c8") {
                host.postMessage(new GetFormReferenceStatusCommand());
            }
        },
    };
}
