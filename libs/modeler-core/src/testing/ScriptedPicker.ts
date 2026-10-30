import { Engine } from "@miragon/bpmn-modeler-types";

import { DeploymentPickerPort } from "../deployment/domain/ports";
import { MigrationScope } from "../migration/domain/MigrationPlan";
import { MigrationPickerPort } from "../migration/domain/ports";
import { UserCancelledError } from "../kernel/domain/errors";
import { LocatePrompts, PickerPort } from "../kernel/domain/hostPorts";
import { classifyLocateResult, LocateResult } from "../kernel/domain/locateResult";
import { NewModelEngine } from "../kernel/domain/newModelEngine";
import { ChoicePrompt, ConfirmRequest, SearchPrompt } from "../kernel/domain/prompts";

export interface PickerAnswers {
    newModelEngine?: NewModelEngine;
    migrationScope?: MigrationScope;
    engineVersion?: string;
    workspaceFiles?: string[];
    payloadFile?: { filePath: string; label: string };
    scriptLanguage?: string;
    locatedFile?: string;
    confirmDestructive?: boolean;
    deploymentTarget?: string;
    deploymentStatusAction?: "switch" | "verify";
}

/** Scripted answers to the generic prompts, keyed by prompt id. */
export type PromptAnswers = Readonly<Record<string, unknown>>;

export interface Prompt {
    readonly method: keyof (PickerPort & DeploymentPickerPort & MigrationPickerPort);
    readonly args: readonly unknown[];
}

/**
 * Answers each prompt from `answers`. An unanswered prompt is dismissed with
 * the port's own convention for that prompt (throw, `[]`, `null`, `undefined`
 * or `false`), so a test exercises the caller's cancel path by leaving it out.
 */
export class ScriptedPicker implements PickerPort, DeploymentPickerPort, MigrationPickerPort {
    readonly prompts: Prompt[] = [];

    constructor(
        readonly answers: PickerAnswers = {},
        readonly promptAnswers: PromptAnswers = {},
    ) {}

    async choose<V>(_prompt: ChoicePrompt<V>): Promise<V | undefined> {
        return undefined;
    }

    async chooseMany<V>(_prompt: ChoicePrompt<V>): Promise<readonly V[]> {
        return [];
    }

    async confirm(_request: ConfirmRequest): Promise<boolean> {
        return false;
    }

    async searchAndChoose<R>(search: SearchPrompt<R>): Promise<{ outcome: R; chosen?: string }> {
        return { outcome: await search.search() };
    }

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

    async searchAndPickLocatedFile(
        prompts: LocatePrompts,
        search: () => Promise<LocateResult>,
    ): Promise<{ outcome: LocateResult; chosen?: string }> {
        this.prompts.push({ method: "searchAndPickLocatedFile", args: [prompts] });
        const outcome = await search();
        const isAmbiguous = classifyLocateResult(outcome).kind === "ambiguous";
        return { outcome, chosen: isAmbiguous ? this.answers.locatedFile : undefined };
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
