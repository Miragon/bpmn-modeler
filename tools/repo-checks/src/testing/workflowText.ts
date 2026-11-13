import type { SourceFile } from "@miragon/architecture-testing";

const YARN_COMMAND = /^\s*(?:- )?run: (?:corepack )?yarn (.+?)\s*$/gm;
const FOCUS = /^workspaces focus (.+)$/;

/** A one-line `VARIABLE='…'` or `VARIABLE="…"` in a `run:` script. */
export function workflowAssignment(workflow: SourceFile, variable: string): string {
    const assignment = new RegExp(`^\\s*${variable}=(?:'([^']+)'|"([^"]+)")$`, "m").exec(
        workflow.text,
    );
    if (!assignment) {
        throw new Error(`${workflow.path} assigns no ${variable}`);
    }
    return assignment[1] ?? assignment[2];
}

/** A double-quoted assignment expands one `${VARIABLE}`, as the workflow's shell does. */
export function workflowPattern(workflow: SourceFile, variable: string): RegExp {
    const value = workflowAssignment(workflow, variable);
    return new RegExp(
        value.replace(/\$\{(\w+)\}/, (_reference, referenced: string) =>
            workflowAssignment(workflow, referenced),
        ),
    );
}

export function triggerPaths(workflow: SourceFile, event: "push" | "pull_request"): string[] {
    const block = new RegExp(
        `^ {2}${event}:\\n(?: {4}(?!paths:).*\\n)*? {4}paths:\\n((?: {6}- '[^']+'\\n)+)`,
        "m",
    ).exec(workflow.text);
    if (!block) {
        throw new Error(`${workflow.path} has no ${event} paths`);
    }
    return [...block[1].matchAll(/- '([^']+)'/g)].map(([, path]) => path);
}

function oneLineYarnCommands(workflow: SourceFile): string[] {
    return [...workflow.text.matchAll(YARN_COMMAND)].map(([, command]) => command);
}

/** Only a one-line `run:` counts, so a focus folded into a block scalar fails loudly. */
export function focusedWorkspaces(workflow: SourceFile): string[] {
    const workspaces = oneLineYarnCommands(workflow).flatMap(
        (command) => FOCUS.exec(command)?.[1].split(/\s+/) ?? [],
    );
    if (workspaces.length === 0) {
        throw new Error(`${workflow.path} has no one-line \`run: yarn workspaces focus …\``);
    }
    return workspaces;
}

/** The arguments of each one-line `run: yarn …` step but the focused install. */
export function yarnRunSteps(workflow: SourceFile): string[] {
    const steps = oneLineYarnCommands(workflow).filter((command) => !FOCUS.test(command));
    if (steps.length === 0) {
        throw new Error(`${workflow.path} has no one-line \`run: yarn …\` step`);
    }
    return steps;
}

/** The ids in the job's `if:` that test `contains(fromJSON(…affected-targets), '<id>')`. */
export function jobConditionTargets(workflow: SourceFile, job: string): string[] {
    const jobBlock = new RegExp(`^ {2}${job}:\\n((?:(?: {4}.*)?\\n)*)`, "m").exec(
        workflow.text,
    )?.[1];
    const condition = jobBlock && /^ {4}if: (.*(?:\n {6}.*)*)/m.exec(jobBlock)?.[1];
    const targets = [
        ...(condition ?? "").matchAll(/contains\(fromJSON\([^)]*\), '([^']+)'\)/g),
    ].map(([, target]) => target);
    if (targets.length === 0) {
        throw new Error(`${workflow.path} job ${job} names no Vitest target in its if`);
    }
    return targets;
}
