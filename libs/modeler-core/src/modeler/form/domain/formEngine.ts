import { ENGINE_EXECUTION_PLATFORM, ENGINES, Engine } from "@miragon/bpmn-modeler-types";

import { ChoicePrompt } from "../../../kernel/domain/prompts";
import { StatusView } from "../../../kernel/domain/statusView";
import { ENGINE_VERSION_STATUS_TOOLTIP } from "../../../kernel/domain/engineVersionStatus";

export interface FormEngineMetadata {
    readonly executionPlatform?: unknown;
    readonly executionPlatformVersion?: unknown;
}

export interface FormEngineSelection {
    readonly executionPlatform: string;
    readonly executionPlatformVersion: string;
}

export type FormEngineChange =
    | { readonly kind: "unchanged" }
    | { readonly kind: "changed"; readonly metadata: FormEngineSelection };

const FORM_VERSIONS: Record<Engine, readonly string[]> = {
    c8: ["8.8.0", "8.9.0", "8.10.0"],
    c7: ["7"],
};
const FORM_PLATFORM_LABEL: Record<Engine, string> = { c8: "Camunda Cloud", c7: "Camunda 7" };
const FORM_PLATFORM_PICKER_ORDER: readonly Engine[] = ["c8", "c7"];

export function readFormEngineMetadata(content: string): FormEngineMetadata | undefined {
    try {
        const root: unknown = JSON.parse(content);
        if (typeof root !== "object" || root === null || Array.isArray(root)) return undefined;
        const { executionPlatform, executionPlatformVersion } = root as FormEngineMetadata;
        return { executionPlatform, executionPlatformVersion };
    } catch {
        return undefined;
    }
}

export function formPlatformPrompt(): ChoicePrompt<Engine> {
    return {
        id: "formExecutionPlatform",
        placeholder: "Select execution platform",
        items: FORM_PLATFORM_PICKER_ORDER.map((engine) => ({
            label: FORM_PLATFORM_LABEL[engine],
            value: engine,
        })),
    };
}

export function formVersionPrompt(engine: Engine): ChoicePrompt<string> {
    return {
        id: `${engine}FormEngineVersion`,
        placeholder: `Select ${FORM_PLATFORM_LABEL[engine]} engine version`,
        items: FORM_VERSIONS[engine].map((version) => ({ label: version, value: version })),
    };
}

export function formEngineChange(
    current: FormEngineMetadata,
    engine: Engine | undefined,
    version: string | undefined,
): FormEngineChange {
    if (engine === undefined || version === undefined || !FORM_VERSIONS[engine].includes(version)) {
        return { kind: "unchanged" };
    }
    const metadata = {
        executionPlatform: ENGINE_EXECUTION_PLATFORM[engine],
        executionPlatformVersion: version,
    };
    return sameFormEngineMetadata(current, metadata)
        ? { kind: "unchanged" }
        : { kind: "changed", metadata };
}

export function sameFormEngineMetadata(
    first: FormEngineMetadata,
    second: FormEngineMetadata,
): boolean {
    return (
        JSON.stringify(first.executionPlatform) === JSON.stringify(second.executionPlatform) &&
        JSON.stringify(first.executionPlatformVersion) ===
            JSON.stringify(second.executionPlatformVersion)
    );
}

export function formEngineStatusView(metadata: FormEngineMetadata | undefined): StatusView {
    if (!metadata) {
        return { text: "Invalid Form JSON", icon: "warning", tone: "warning" };
    }
    const engine = ENGINES.find(
        (value) => ENGINE_EXECUTION_PLATFORM[value] === metadata.executionPlatform,
    );
    const supported =
        engine !== undefined &&
        FORM_VERSIONS[engine].includes(metadata.executionPlatformVersion as string);
    const platform = engine
        ? FORM_PLATFORM_LABEL[engine]
        : displayValue(metadata.executionPlatform);
    return {
        text: `${platform} (${displayValue(metadata.executionPlatformVersion)})`,
        icon: "engine",
        tooltip: ENGINE_VERSION_STATUS_TOOLTIP,
        tone: supported ? "neutral" : "warning",
        action: "changeEngineVersion",
    };
}

function displayValue(value: unknown): string {
    return value === undefined
        ? "Not configured"
        : typeof value === "string"
          ? value
          : JSON.stringify(value);
}
