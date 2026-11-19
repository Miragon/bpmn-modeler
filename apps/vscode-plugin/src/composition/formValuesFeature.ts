import { ExtensionContext } from "vscode";

import type { EditorSessionStore, NotifierPort } from "@miragon/bpmn-modeler-core";
import {
    FORM_INPUT_VALUES_SCHEME,
    FORM_OUTPUT_VALUES_SCHEME,
    FormValueFiles,
    FormValuesController,
} from "../modeler/form/adapter/in/FormValuesController";
import { inMemoryViewUris } from "../shared/adapter/out/inMemoryViewUris";
import { InMemoryFileSystemProvider } from "../shared/adapter/out/InMemoryFileSystemProvider";
import { closeUnservedTabs } from "../shared/adapter/out/unservedTabs";

/**
 * The values a form takes and returns, as JSON beside it: their in-memory
 * files, the controller that keeps them in step with the form, and the sweep
 * that closes a values tab whose session is gone.
 */
export function register(
    context: ExtensionContext,
    deps: { readonly editorStore: EditorSessionStore; readonly notifier: NotifierPort },
): FormValuesController {
    const formValues = new FormValuesController(
        deps.editorStore,
        deps.notifier,
        registeredFormValueFiles(context),
    );
    formValues.register(context);
    closeUnservedTabs(context, (tab) => formValues.isUnservedTab(tab), deps.notifier);
    return formValues;
}

/** The values' files: the input writable while its session serves it, the output read-only. */
export function registeredFormValueFiles(
    context: Pick<ExtensionContext, "subscriptions"> = { subscriptions: [] },
): FormValueFiles {
    return {
        input: InMemoryFileSystemProvider.registered(context, FORM_INPUT_VALUES_SCHEME, {
            editorMayCreateFiles: false,
        }),
        output: InMemoryFileSystemProvider.registered(context, FORM_OUTPUT_VALUES_SCHEME, {
            readOnly: true,
        }),
        viewUris: inMemoryViewUris,
    };
}
