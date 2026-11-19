import type { ExtensionContext } from "vscode";

import {
    FORM_INPUT_VALUES_SCHEME,
    FORM_OUTPUT_VALUES_SCHEME,
    type FormValueFiles,
} from "../modeler/form/adapter/in/FormValuesController";
import { inMemoryViewUris } from "../shared/adapter/out/inMemoryViewUris";
import { InMemoryFileSystemProvider } from "../shared/adapter/out/InMemoryFileSystemProvider";

/** The form's value files registered as the editor feature registers them, input first. */
export function registeredFormValueFiles(
    context: Pick<ExtensionContext, "subscriptions"> = { subscriptions: [] },
): FormValueFiles {
    return {
        input: InMemoryFileSystemProvider.registered(context, FORM_INPUT_VALUES_SCHEME),
        output: InMemoryFileSystemProvider.registered(context, FORM_OUTPUT_VALUES_SCHEME, {
            readOnly: true,
        }),
        viewUris: inMemoryViewUris,
    };
}
