/** @jsxImportSource @bpmn-io/properties-panel/preact */
/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Verbatim: a `SelectEntry` that auto-focuses a sibling entry when the option
 * set grows (e.g. after "Create new …"). `disabled` flows through the spread.
 */
import { useEffect } from "@bpmn-io/properties-panel/preact/hooks";

import { query as domQuery } from "min-dom";

import { SelectEntry, usePrevious } from "@bpmn-io/properties-panel";

export default function ReferenceSelectEntry(props: any) {
    const { autoFocusEntry, element, getOptions } = props;

    const options = getOptions(element);
    const prevOptions = usePrevious(options);

    // auto focus specific other entry when options changed
    useEffect(() => {
        if (autoFocusEntry && prevOptions && options.length > prevOptions.length) {
            const entry = domQuery(`[data-entry-id="${autoFocusEntry}"]`);

            const focusableInput = domQuery(".bio-properties-panel-input", entry as any);

            if (focusableInput) {
                (focusableInput as HTMLInputElement).select();
            }
        }
    }, [options]);

    return <SelectEntry {...props} />;
}
