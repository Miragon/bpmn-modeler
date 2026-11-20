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
 * host sends back for it.
 */
export class PreviewTargets {
    private targets: DeploymentTargetPayload[] = [...SAMPLE_TARGETS];

    private activeName = "";

    list(): DeploymentTargetsQuery {
        return new DeploymentTargetsQuery(this.targets, this.activeName);
    }

    select(name: string): DeploymentTargetsQuery {
        this.activeName = name;
        return this.list();
    }

    create(target: DeploymentTargetPayload): Query[] {
        if (this.isTaken(target.name)) {
            return [nameTaken(target.name)];
        }
        this.targets.push(target);
        this.activeName = target.name;
        return [new TargetSavedQuery(true, `Created target "${target.name}" (mock).`), this.list()];
    }

    save(target: DeploymentTargetPayload, previousName?: string): Query[] {
        if (this.isRenamedOntoAnother(target, previousName)) {
            return [nameTaken(target.name)];
        }
        this.targets = this.targets.filter(
            ({ name }) => name !== target.name && name !== previousName,
        );
        this.targets.push(target);
        this.activeName = target.name;
        return [new TargetSavedQuery(true, `Saved target "${target.name}" (mock).`), this.list()];
    }

    delete(name: string): Query[] {
        this.targets = this.targets.filter((target) => target.name !== name);
        if (this.activeName === name) {
            this.activeName = "";
        }
        return [new TargetSavedQuery(true, `Deleted target "${name}" (mock).`), this.list()];
    }

    /** A name no target holds has no auth to look up. */
    authOf(name: string): AuthConfigPayload {
        const target = this.targets.find((entry) => entry.name === name);
        return {
            authType: target?.authType ?? "none",
            tokenEndpoint: target?.tokenEndpoint,
            audience: target?.audience,
        };
    }

    private isTaken(name: string): boolean {
        return this.targets.some((target) => target.name === name);
    }

    private isRenamedOntoAnother(target: DeploymentTargetPayload, previousName?: string): boolean {
        const isRename = previousName !== undefined && previousName !== target.name;
        return isRename && this.isTaken(target.name);
    }
}

function nameTaken(name: string): TargetSavedQuery {
    return new TargetSavedQuery(false, `A deployment target named "${name}" already exists.`);
}
