/**
 * Public, host-agnostic types and pure rules for the BPMN/DMN modeler.
 *
 * This barrel is the publishable half of the modeler's shared code: the
 * domain/model types and rules the `@miragon/bpmn-modeler` npm package needs,
 * compiled without the DOM (the DOM widgets are `@miragon/bpmn-modeler-browser`),
 * with **no** dependency on the Query/Command host protocol or `HostApi`, which
 * stay private in `@miragon/bpmn-modeler-shared`. The boundary is enforced by
 * eslint (`BND-PROTOCOL-PRIVATE`), not convention.
 *
 * It re-exports `lifecycle/service/` too, so it is not a pure module; a pure
 * importer uses `@miragon/bpmn-modeler-types/domain` (`domain.ts`).
 */
export * from "./lifecycle/service/asyncDebounce";
export * from "./lifecycle/service/flushableDebounceInput";
export * from "./engine/domain/engine";
export * from "./engine/domain/engineVersions";
export * from "./engine/domain/executionPlatformAttributes";
export * from "./elements/domain/elementTemplates";
export * from "./surface/domain/surfaceMode";
export * from "./lint/domain/lint";
export * from "./surface/domain/settings";
export * from "./elements/domain/elementIds";
export * from "./scripting/domain/scripting";
export * from "./scripting/domain/scriptSurface";
export * from "./scripting/domain/processVariables";
export * from "./references/domain/implementation";
export * from "./references/domain/referenceKind";
export * from "./diff/domain/diff";
export * from "./diff/domain/diffLegend";
export * from "./diff/domain/diffStepper";
export * from "./diff/domain/diffVocabulary";
export * from "./merge/domain/mergeVocabulary";
export * from "./merge/domain/mergeBuildNotes";
export * from "./merge/domain/mergeBuildNoteReaders";
export * from "./merge/domain/conflictMarkers";
export * from "./elements/domain/elementTypeNames";
export * from "./surface/domain/translate";
export * from "./geometry/domain/layout";
export * from "./surface/domain/errors";
export * from "./geometry/domain/canvasSize";
export * from "./lifecycle/service/disposableStore";
export * from "./surface/domain/surfaceThemeMode";
export * from "./references/domain/workspaceDefinitions";
export * from "./documents/domain/xmlMarkup";
export * from "./references/domain/formPreview";
export * from "./documents/domain/blankDocument";
export * from "./documents/domain/emptyDmn";
export * from "./surface/domain/pluginLoadReport";
export * from "./geometry/domain/polyline";
