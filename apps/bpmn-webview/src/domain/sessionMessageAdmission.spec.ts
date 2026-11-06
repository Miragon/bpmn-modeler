import { describe, expect, it } from "vitest";

import { admitSessionMessage, type SessionMessageType } from "./sessionMessageAdmission";

const sessionMessageTypes = Object.keys({
    BpmnFileQuery: true,
    ElementTemplatesQuery: true,
    BpmnlintResultsQuery: true,
    BpmnLintDisabledQuery: true,
    BpmnlintInPageQuery: true,
    BpmnModelerSettingQuery: true,
    PropertiesPanelStateQuery: true,
    ClipboardQuery: true,
    TextClipboardQuery: true,
    LanguageQuery: true,
    GetDiagramAsSVGCommand: true,
    OpenAllScriptTasksQuery: true,
    FormatDiagramQuery: true,
    CleanupDiagramQuery: true,
    UpdateScriptContentQuery: true,
    UpdateScriptFormatQuery: true,
    UpdateOpenScriptEditorsQuery: true,
    ImplementationStatusQuery: true,
    FormReferenceStatusQuery: true,
    FormPreviewQuery: true,
    WorkspaceDefinitionsQuery: true,
    FocusElementQuery: true,
    TakeFocusQuery: true,
    FlushDocumentQuery: true,
    ReleaseDocumentFlushQuery: true,
} satisfies Record<SessionMessageType, true>) as SessionMessageType[];

const importBoundTypes: SessionMessageType[] = [
    "ElementTemplatesQuery",
    "BpmnModelerSettingQuery",
    "BpmnlintResultsQuery",
    "BpmnLintDisabledQuery",
    "BpmnlintInPageQuery",
    "LanguageQuery",
    "UpdateScriptContentQuery",
    "UpdateScriptFormatQuery",
    "UpdateOpenScriptEditorsQuery",
    "ImplementationStatusQuery",
];

const flushHandshakeTypes: SessionMessageType[] = [
    "FlushDocumentQuery",
    "ReleaseDocumentFlushQuery",
];

describe("admitSessionMessage", () => {
    it.each(importBoundTypes)("holds %s for the initial import", (type) => {
        expect(admitSessionMessage(type, { engineReloading: false })).toBe("importBound");
    });

    it.each(sessionMessageTypes.filter((type) => !importBoundTypes.includes(type)))(
        "routes %s right away",
        (type) => {
            expect(admitSessionMessage(type, { engineReloading: false })).toBe("route");
        },
    );

    it.each(flushHandshakeTypes)("still routes %s while the engine reload is pending", (type) => {
        expect(admitSessionMessage(type, { engineReloading: true })).toBe("route");
    });

    it.each(sessionMessageTypes.filter((type) => !flushHandshakeTypes.includes(type)))(
        "drops %s while the engine reload is pending",
        (type) => {
            expect(admitSessionMessage(type, { engineReloading: true })).toBe("drop");
        },
    );
});
