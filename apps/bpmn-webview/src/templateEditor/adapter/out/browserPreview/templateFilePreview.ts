import { ElementTemplateFileQuery, LanguageQuery, type Query } from "@miragon/bpmn-modeler-shared";

import { type Engine, isEngine } from "@miragon/bpmn-modeler-types";

import c7Samples from "../../../../__fixtures__/c7-samples.json";
import c8Samples from "../../../../__fixtures__/c8-samples.json";
import { mockTemplateFile } from "../../../../__fixtures__/mock-template-files";

const SAMPLES: Record<Engine, unknown> = { c7: c7Samples, c8: c8Samples };

/**
 * The C8 sample templates, the C7 ones for `?engine=c7`, or a
 * {@link mockTemplateFile} for `?file=`; `?lang=de` switches the language
 * once the first template is shown.
 */
export function previewTemplateFile(search: string): Query[] {
    const params = new URLSearchParams(search);
    const engine = params.get("engine");
    const samples = SAMPLES[isEngine(engine) ? engine : "c8"];
    const file =
        mockTemplateFile(params.get("file") ?? "") ?? `${JSON.stringify(samples, null, 2)}\n`;
    const lang = params.get("lang");
    return lang
        ? [new ElementTemplateFileQuery(file), new LanguageQuery(lang)]
        : [new ElementTemplateFileQuery(file)];
}
