declare module "bpmn-js-properties-panel" {
    export const useService;
    export const BpmnPropertiesPanelModule;
    export const BpmnPropertiesProviderModule;
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
}

declare module "camunda-bpmn-js-behaviors/lib/util/ElementUtil" {
    export const createElement;
}

declare module "@bpmn-io/element-template-chooser" {
    export const ElementTemplateChooserModule;
}

declare module "bpmn-js-token-simulation" {
    export const TokenSimulationModule;
}

declare module "bpmn-js-create-append-anything" {
    export const CreateAppendElementTemplatesModule;
    export const CreateAppendAnythingModule;
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
    export function createReviver(moddle: any): (key: string, value: any) => any;
}
