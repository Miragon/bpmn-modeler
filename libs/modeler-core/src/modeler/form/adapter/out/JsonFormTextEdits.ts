import { applyEdits, modify } from "jsonc-parser";

import {
    FormEngineSelection,
    readFormEngineMetadata,
    sameFormEngineMetadata,
} from "../../domain/formEngine";
import { FormTextEdits } from "../../port/FormTextEdits";

export class JsonFormTextEdits implements FormTextEdits {
    withEngine(content: string, metadata: FormEngineSelection): string | undefined {
        if (!readFormEngineMetadata(content)) return undefined;
        const indent = /\n([ \t]+)\S/.exec(content)?.[1];
        const formattingOptions = {
            insertSpaces: !indent?.includes("\t"),
            tabSize: indent?.length ?? 2,
            eol: content.includes("\r\n") ? "\r\n" : "\n",
        };
        try {
            let updated = content;
            for (const key of ["executionPlatform", "executionPlatformVersion"] as const) {
                updated = applyEdits(
                    updated,
                    modify(updated, [key], metadata[key], { formattingOptions }),
                );
            }
            const declared = readFormEngineMetadata(updated);
            return declared && sameFormEngineMetadata(declared, metadata) ? updated : undefined;
        } catch {
            return undefined;
        }
    }
}
