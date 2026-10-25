import { Engine } from "@miragon/bpmn-modeler-types";

import { MigrationScope } from "../migration/domain/MigrationPlan";
import { UserCancelledError } from "../shared/domain/errors";
import { PickerPort } from "../shared/domain/hostPorts";
import { NewModelEngine } from "../shared/domain/newModelEngine";

export interface PickerAnswers {
    newModelEngine?: NewModelEngine;
    migrationScope?: MigrationScope;
    engineVersion?: string;
    workspaceFiles?: string[];
    payloadFile?: { filePath: string; label: string };
    scriptLanguage?: string;
    referencedModel?: string;
    confirmDestructive?: boolean;
    deploymentTarget?: string;
    deploymentStatusAction?: "switch" | "verify";
}

export interface Prompt {
    readonly method: keyof PickerPort;
    readonly args: readonly unknown[];
}

/**
 * Answers each prompt from `answers`. An unanswered prompt is dismissed with
 * the port's own convention for that prompt (throw, `[]`, `null`, `undefined`
 * or `false`), so a test exercises the caller's cancel path by leaving it out.
 */
export class ScriptedPicker implements PickerPort {
    readonly prompts: Prompt[] = [];

    constructor(readonly answers: PickerAnswers = {}) {}

    async pickNewModelEngine(placeHolder: string): Promise<NewModelEngine> {
        this.prompts.push({ method: "pickNewModelEngine", args: [placeHolder] });
        return answerOrCancel(this.answers.newModelEngine);
    }

    async pickMigrationScope(c7Count: number, c8Count: number): Promise<MigrationScope> {
        this.prompts.push({ method: "pickMigrationScope", args: [c7Count, c8Count] });
        return answerOrCancel(this.answers.migrationScope);
    }

    async pickEngineVersion(platform: Engine, versions: readonly string[]): Promise<string> {
        this.prompts.push({ method: "pickEngineVersion", args: [platform, versions] });
        return answerOrCancel(this.answers.engineVersion);
    }

    async pickWorkspaceFiles(opts: {
        glob: string;
        exclude?: string | null;
        placeholder: string;
        limit?: number;
    }): Promise<string[]> {
        this.prompts.push({ method: "pickWorkspaceFiles", args: [opts] });
        return this.answers.workspaceFiles ?? [];
    }

    async pickPayloadFile(paths: string[]): Promise<{ filePath: string; label: string } | null> {
        this.prompts.push({ method: "pickPayloadFile", args: [paths] });
        return this.answers.payloadFile ?? null;
    }

    async pickScriptLanguage(currentFormat: string): Promise<string | undefined> {
        this.prompts.push({ method: "pickScriptLanguage", args: [currentFormat] });
        return this.answers.scriptLanguage;
    }

    async searchAndPickReferencedModel<R extends { kind: string; paths?: string[] }>(
        placeholder: string,
        search: () => Promise<R>,
    ): Promise<{ outcome: R; chosen?: string }> {
        this.prompts.push({ method: "searchAndPickReferencedModel", args: [placeholder] });
        const outcome = await search();
        const isMultiMatch = (outcome.paths?.length ?? 0) > 1;
        return { outcome, chosen: isMultiMatch ? this.answers.referencedModel : undefined };
    }

    async confirmDestructive(options: {
        title: string;
        confirmLabel: string;
        details: string[];
    }): Promise<boolean> {
        this.prompts.push({ method: "confirmDestructive", args: [options] });
        return this.answers.confirmDestructive ?? false;
    }

    async pickDeploymentTarget(names: string[]): Promise<string | undefined> {
        this.prompts.push({ method: "pickDeploymentTarget", args: [names] });
        return this.answers.deploymentTarget;
    }

    async pickDeploymentStatusAction(opts: {
        targetName?: string;
        canVerify: boolean;
    }): Promise<"switch" | "verify" | undefined> {
        this.prompts.push({ method: "pickDeploymentStatusAction", args: [opts] });
        return this.answers.deploymentStatusAction;
    }
}

function answerOrCancel<T>(answer: T | undefined): T {
    if (answer === undefined) {
        throw new UserCancelledError();
    }
    return answer;
}
