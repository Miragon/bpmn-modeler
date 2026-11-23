import { describe, expect, it } from "vitest";

import {
    TargetSavedQuery,
    type DeploymentTargetPayload,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import { DEFAULT_MODELER_SETTINGS } from "../../kernel/domain/modelerSettings";
import { DeploymentTarget, DeploymentTargets, TargetChange } from "./deploymentTarget";
import { conventionalRoutes } from "./engineRoutes";
import { DuplicateDeploymentTargetError } from "./errors";
// The deployment webview cannot depend on the core, so its browser preview's copy is pinned from here.
import { previewFormDefaults } from "../../../../../apps/deployment-webview/src/adapter/out/browserPreview/deployPreview";
import { PreviewTargets } from "../../../../../apps/deployment-webview/src/adapter/out/browserPreview/targetsPreview";

type Edit =
    | { readonly kind: "create"; readonly target: DeploymentTargetPayload }
    | {
          readonly kind: "save";
          readonly target: DeploymentTargetPayload;
          readonly previousName?: string;
      }
    | { readonly kind: "delete"; readonly name: string };

interface Outcome {
    readonly names: readonly string[];
    readonly refusal?: string;
}

const payload = (name: string): DeploymentTargetPayload => ({
    name,
    engine: "c7",
    endpoint: "https://edited.test",
    tenantId: "",
    authType: "none",
});
const create = (name: string): Edit => ({ kind: "create", target: payload(name) });
const save = (name: string, previousName?: string): Edit => ({
    kind: "save",
    target: payload(name),
    previousName,
});
const remove = (name: string): Edit => ({ kind: "delete", name });

const namesOf = (targets: readonly { readonly name: string }[]): string[] =>
    targets.map(({ name }) => name);

function editTargets(targets: DeploymentTargets, edit: Edit): TargetChange {
    switch (edit.kind) {
        case "create":
            return targets.add(DeploymentTarget.create(edit.target));
        case "save":
            return targets.upsert(DeploymentTarget.create(edit.target), edit.previousName);
        case "delete":
            return targets.remove(edit.name);
    }
}

function editPreview(preview: PreviewTargets, edit: Edit): Query[] {
    switch (edit.kind) {
        case "create":
            return preview.create(edit.target);
        case "save":
            return preview.save(edit.target, edit.previousName);
        case "delete":
            return preview.delete(edit.name);
    }
}

/** Both sides start from the preview's sample targets. */
function sampleTargets(): DeploymentTargets {
    return new DeploymentTargets(
        new PreviewTargets().list().targets.map((sample) => DeploymentTarget.create(sample)),
    );
}

function coreOutcome(edit: Edit): Outcome {
    const targets = sampleTargets();
    try {
        return { names: namesOf(editTargets(targets, edit).targets) };
    } catch (error) {
        if (!(error instanceof DuplicateDeploymentTargetError)) {
            throw error;
        }
        return { names: namesOf(targets.targets), refusal: error.message };
    }
}

function previewOutcome(edit: Edit): Outcome {
    const preview = new PreviewTargets();
    const [reply] = editPreview(preview, edit);
    if (!(reply instanceof TargetSavedQuery)) {
        throw new Error(`The preview answered ${edit.kind} with ${reply?.type}.`);
    }
    const names = namesOf(preview.list().targets);
    return reply.success ? { names } : { names, refusal: reply.message };
}

describe("the deployment webview's browser preview", () => {
    it.each<[string, Edit]>([
        ["creates a target under a new name", create("staging")],
        ["creates a target under its trimmed name", create(" staging ")],
        ["refuses to create a target under a taken name", create("dev")],
        ["refuses to create a target whose trimmed name is taken", create(" dev")],
        ["overwrites a target saved under its own name", save("dev", "dev")],
        ["overwrites a target saved under its padded own name", save("dev ", "dev")],
        ["reads a padded previous name as the target's own", save("dev", " dev")],
        ["adds a saved target the list does not hold", save("staging")],
        ["renames a target", save("local", "dev")],
        ["refuses a rename onto another target", save("prod", "dev")],
        ["refuses a rename onto another target's padded name", save(" prod", "dev")],
        ["deletes a target", remove("dev")],
        ["deletes a target by its padded name", remove(" dev")],
        ["deletes nothing for a name no target holds", remove("staging")],
    ])("%s as every host does", (_, edit) => {
        expect(previewOutcome(edit)).toEqual(coreOutcome(edit));
    });

    // Only "prod" has auth settings, so a lookup that lands on no target answers differently.
    it.each<[string, string]>([
        ["finds a target by its name", "prod"],
        ["finds a target by its padded name", " prod "],
        ["finds no target for a name none holds", "staging"],
    ])("%s for a credentials lookup as every host does", (_, name) => {
        const preview = new PreviewTargets();
        const found = sampleTargets().find(name);

        expect(preview.authOf(name)).toEqual(
            found === undefined ? { authType: "none" } : preview.authOf(found.name),
        );
    });

    it("offers the routes a host with the default C8 API version sends", () => {
        expect(previewFormDefaults().defaults.conventionalRoutes).toEqual(
            conventionalRoutes(DEFAULT_MODELER_SETTINGS.c8ApiVersion),
        );
    });
});
