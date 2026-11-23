import {
    DeploymentTargetsQuery,
    TargetSavedQuery,
    type AuthConfigPayload,
    type DeploymentTargetPayload,
    type Query,
} from "@miragon/bpmn-modeler-shared";

// Two so the sidebar's select, save and delete flow has something to act on.
const SAMPLE_TARGETS: readonly DeploymentTargetPayload[] = [
    {
        name: "dev",
        engine: "c7",
        endpoint: "http://localhost:8080/engine-rest",
        tenantId: "",
        authType: "none",
    },
    {
        name: "prod",
        engine: "c8",
        endpoint: "https://prod.example.com",
        tenantId: "acme",
        authType: "oauth2",
        tokenEndpoint: "https://login.example.com/oauth/token",
        audience: "zeebe-api",
    },
];

/**
 * The preview's deployment targets, held in memory and starting from two
 * samples, and the one that is active. Each change answers with the queries a
 * host sends back for it. Its target rules and refusal text copy the core's
 * `DeploymentTargets`; the core's `deploymentPreviewParity.spec.ts` pins them.
 */
export class PreviewTargets {
    private targets: DeploymentTargetPayload[] = [...SAMPLE_TARGETS];

    private activeName = "";

    list(): DeploymentTargetsQuery {
        return new DeploymentTargetsQuery(this.targets, this.activeName);
    }

    select(name: string): DeploymentTargetsQuery {
        this.activeName = name.trim();
        return this.list();
    }

    create(entered: DeploymentTargetPayload): Query[] {
        const target = withTrimmedName(entered);
        if (this.isTaken(target.name)) {
            return [nameTaken(target.name)];
        }
        this.targets.push(target);
        this.activeName = target.name;
        return [new TargetSavedQuery(true, `Created target "${target.name}" (mock).`), this.list()];
    }

    save(entered: DeploymentTargetPayload, previousName?: string): Query[] {
        const target = withTrimmedName(entered);
        const savedName = previousName?.trim() ?? target.name;
        if (savedName !== target.name && this.isTaken(target.name)) {
            return [nameTaken(target.name)];
        }
        this.targets = this.targets.filter(({ name }) => name !== savedName);
        this.targets.push(target);
        this.activeName = target.name;
        return [new TargetSavedQuery(true, `Saved target "${target.name}" (mock).`), this.list()];
    }

    delete(entered: string): Query[] {
        const name = entered.trim();
        this.targets = this.targets.filter((target) => target.name !== name);
        if (this.activeName === name) {
            this.activeName = "";
        }
        return [new TargetSavedQuery(true, `Deleted target "${name}" (mock).`), this.list()];
    }

    /** A name no target holds has no auth to look up. */
    authOf(name: string): AuthConfigPayload {
        const target = this.targets.find((entry) => entry.name === name.trim());
        return {
            authType: target?.authType ?? "none",
            tokenEndpoint: target?.tokenEndpoint,
            audience: target?.audience,
        };
    }

    private isTaken(name: string): boolean {
        return this.targets.some((target) => target.name === name);
    }
}

function withTrimmedName(target: DeploymentTargetPayload): DeploymentTargetPayload {
    return { ...target, name: target.name.trim() };
}

function nameTaken(name: string): TargetSavedQuery {
    return new TargetSavedQuery(false, `A deployment target named "${name}" already exists.`);
}
