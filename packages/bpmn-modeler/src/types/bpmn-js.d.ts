declare module "bpmn-js-properties-panel" {
    export const useService;
    export const BpmnPropertiesPanelModule;
    export const BpmnPropertiesProviderModule;
    export const CamundaPlatformPropertiesProviderModule;
    export const ZeebePropertiesProviderModule;
    export const CamundaPlatformTooltipProvider;
    export const ZeebeTooltipProvider;
}

declare module "@bpmn-io/properties-panel" {
    export const isSelectEntryEdited;
    export const SelectEntry;
    export const TextAreaEntry;
    // Additional primitives consumed by the inlined
    // @miragon/bpmn-modeler-properties-panel fork (#1441).
    export const Group;
    export const ListGroup;
    export const TextFieldEntry;
    export const CheckboxEntry;
    export const isTextFieldEntryEdited;
    export const isTextAreaEntryEdited;
    export const isCheckboxEntryEdited;
    export const usePrevious;
    export const FeelLanguageContext;
    export const Header;
    export const PropertiesPanel;
    export const DebounceInputModule;
    export const FeelPopupModule;
}

declare module "@bpmn-io/properties-panel/preact/jsx-runtime" {
    /* eslint-disable @typescript-eslint/no-explicit-any -- a JSX runtime shim is
       permissive by construction: the factory accepts any element type/props and
       the intrinsic-element namespace must admit arbitrary host attributes.
       Narrowing to `unknown` here would break every `.tsx` in the vendored
       properties-panel fork that resolves its JSX through this subpath. */
    export const jsx: (type: any, props: any, key?: any) => any;
    export const jsxs: (type: any, props: any, key?: any) => any;
    export const Fragment: any;

    // The properties-panel fork's `.tsx` files use this subpath as their
    // `@jsxImportSource`, so the automatic runtime resolves the JSX namespace
    // here. The vendored preact ships the real one, but this explicit shim
    // shadows it under the package build, so it must carry its own permissive
    // JSX namespace for intrinsic host elements (<div>, <p>, …) to typecheck.
    export namespace JSX {
        type Element = any;
        interface ElementClass {
            render: any;
        }
        interface ElementAttributesProperty {
            props: any;
        }
        interface ElementChildrenAttribute {
            children: any;
        }
        interface IntrinsicElements {
            [elemName: string]: any;
        }
        interface IntrinsicAttributes {
            [name: string]: any;
        }
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
}

declare module "bpmn-js-token-simulation" {
    export const TokenSimulationModule;
}

declare module "bpmn-js-token-simulation/lib/viewer" {
    const TokenSimulationViewerModule;
    export default TokenSimulationViewerModule;
}

declare module "bpmn-js-create-append-anything" {
    export const CreateAppendElementTemplatesModule;
    export const CreateAppendAnythingModule;
    export const RemoveTemplatesModule;

    interface CreateAppendOption {
        readonly actionName: string;
        readonly target: {
            readonly type: string;
            readonly eventDefinitionType?: string;
            readonly triggeredByEvent?: boolean;
            readonly isExpanded?: boolean;
        };
    }
    export const TASK: readonly CreateAppendOption[];
    export const GATEWAY: readonly CreateAppendOption[];
    export const SUBPROCESS: readonly CreateAppendOption[];
    export const ALL_EVENTS: readonly CreateAppendOption[];
    export const DATA_OBJECTS: readonly CreateAppendOption[];
    export const PARTICIPANT: readonly CreateAppendOption[];
}

declare module "camunda-transaction-boundaries/lib/index.js" {
    const TransactionBoundariesModule;
    export default TransactionBoundariesModule;
}

declare module "diagram-js-minimap" {
    const MinimapModule;
    export default MinimapModule;
}

declare module "bpmn-js-native-copy-paste/lib/PasteUtil.js" {
    export function createReviver(moddle: unknown): (key: string, value: unknown) => unknown;
}

declare module "bpmn-js-native-copy-paste" {
    const NativeCopyPasteModule;
    export default NativeCopyPasteModule;
}

declare module "diagram-js-grid" {
    const GridModule;
    export default GridModule;
}

declare module "@bpmn-io/align-to-origin" {
    const AlignToOriginModule;
    export default AlignToOriginModule;
}

declare module "bpmn-js-executable-fix" {
    const ExecutableFixModule;
    export default ExecutableFixModule;
}

declare module "bpmn-js-color-picker" {
    const ColorPickerModule;
    export default ColorPickerModule;
}

declare module "@bpmn-io/element-template-icon-renderer" {
    const ElementTemplateIconRendererModule;
    export default ElementTemplateIconRendererModule;
}

declare module "@camunda/example-data-properties-provider" {
    const ExampleDataPropertiesProviderModule;
    export default ExampleDataPropertiesProviderModule;
}

declare module "camunda-bpmn-js-behaviors/lib/camunda-platform" {
    const CamundaPlatformBehaviorsModule;
    export default CamundaPlatformBehaviorsModule;
}

declare module "camunda-bpmn-js-behaviors/lib/camunda-cloud" {
    const CamundaCloudBehaviorsModule;
    export default CamundaCloudBehaviorsModule;
}

declare module "bpmn-js-copy-as-image" {
    export const CopyAsImageModule;
}

declare module "bpmn-js-element-templates" {
    export const ElementTemplatesPropertiesProviderModule;
    export const CloudElementTemplatesPropertiesProviderModule;
}

declare module "@bpmn-io/variable-resolver" {
    export const CamundaVariableResolverModule;
    export const ZeebeVariableResolverModule;
}
