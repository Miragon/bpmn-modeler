import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { gitOutcome, runGit } from "./git";

export type GitOperation = "merge" | "rebase" | "cherry-pick" | "stash";

/** Each operation conflicts its own file in its own repository, so their Source Control rows tell them apart. */
export const CONFLICTED: Record<GitOperation, string> = {
    "merge": "merged.bpmn",
    "rebase": "rebased.bpmn",
    "cherry-pick": "picked.bpmn",
    "stash": "stashed.bpmn",
};

/** In the merge, main deleted the task with both of its flows while feature renamed it. */
export const REMOVAL_FILE = "removed.bpmn";
/** In the merge, both sides added this file, so a row that is no BPMN file is unmerged too. */
export const NOTES_FILE = "notes.txt";

export const repositoryFolder = (operation: GitOperation) => `${operation}-repo`;

/** A conflicted file as Git left it: its working file with the conflict markers and its index stages. */
export interface ConflictAsGitLeftIt {
    workingFile: string;
    stages: string;
}

export function unmergedStages(repository: string): Promise<string> {
    return runGit(repository, "ls-files", "-u");
}

function withoutCheckTask(processXml: string): string {
    return processXml
        .replace(/\s*<bpmn:task id="Task_Check"[\s\S]*?<\/bpmn:task>/, "")
        .replace(/\s*<bpmn:outgoing>Flow_To_Task<\/bpmn:outgoing>/, "")
        .replace(/\s*<bpmn:incoming>Flow_To_End<\/bpmn:incoming>/, "")
        .replace(/\s*<bpmn:sequenceFlow id="Flow_To_(Task|End)"[^>]*\/>/g, "")
        .replace(/\s*<bpmndi:BPMNShape id="Task_Check_di"[\s\S]*?<\/bpmndi:BPMNShape>/, "")
        .replace(/\s*<bpmndi:BPMNEdge id="Flow_To_(Task|End)_di"[\s\S]*?<\/bpmndi:BPMNEdge>/g, "");
}

/**
 * A repository whose one file conflicts after `operation`: both sides rename
 * the task. In the merge, feature alone also renames the end event, which the
 * merge takes from feature without asking, a second file conflicts on a task
 * main deleted and feature renamed, and both sides add a text file.
 */
async function conflictedRepository(
    workspace: string,
    operation: GitOperation,
    processXml: string,
): Promise<string> {
    const repository = join(workspace, repositoryFolder(operation));
    const file = join(repository, CONFLICTED[operation]);
    const removalFile = join(repository, REMOVAL_FILE);
    const notesFile = join(repository, NOTES_FILE);
    const isMerge = operation === "merge";
    const renamed = (name: string) => processXml.replace('name="Check order"', `name="${name}"`);
    const commitAll = (message: string) =>
        runGit(repository, "commit", "-q", "-a", "--no-verify", "-m", message);

    await mkdir(repository, { recursive: true });
    await runGit(repository, "init", "-q");
    await writeFile(file, processXml);
    await runGit(repository, "add", CONFLICTED[operation]);
    if (isMerge) {
        await writeFile(removalFile, processXml);
        await runGit(repository, "add", REMOVAL_FILE);
    }
    await runGit(repository, "commit", "-q", "--no-verify", "-m", "Add the order process");

    if (operation === "stash") {
        await writeFile(file, renamed("Check stashed order"));
        await runGit(repository, "stash", "push", "-q");
        await writeFile(file, renamed("Check main order"));
        await commitAll("Rename the check on main");
        await gitOutcome(repository, "stash", "pop");
        return repository;
    }

    await runGit(repository, "checkout", "-q", "-b", "feature");
    const featureVersion = renamed("Check feature order");
    await writeFile(
        file,
        isMerge
            ? featureVersion.replace('name="Order checked"', 'name="Order verified"')
            : featureVersion,
    );
    if (isMerge) {
        await writeFile(removalFile, featureVersion);
        await writeFile(notesFile, "feature\n");
        await runGit(repository, "add", NOTES_FILE);
    }
    await commitAll("Rename the check on feature");

    await runGit(repository, "checkout", "-q", "main");
    await writeFile(file, renamed("Check main order"));
    if (isMerge) {
        await writeFile(removalFile, withoutCheckTask(processXml));
        await writeFile(notesFile, "main\n");
        await runGit(repository, "add", NOTES_FILE);
    }
    await commitAll("Rename the check on main");

    if (isMerge) await gitOutcome(repository, "merge", "feature", "--no-edit");
    if (operation === "cherry-pick") await gitOutcome(repository, "cherry-pick", "feature");
    if (operation === "rebase") {
        await runGit(repository, "checkout", "-q", "feature");
        await gitOutcome(repository, "rebase", "main");
    }
    return repository;
}

/**
 * A repository per Git operation in `workspace`, each stopped at a conflict
 * on the task of the process, and what Git left of each conflicted file.
 */
export async function conflictedRepositories(
    workspace: string,
    processXml: string,
): Promise<Record<GitOperation, ConflictAsGitLeftIt>> {
    const conflicts = {} as Record<GitOperation, ConflictAsGitLeftIt>;
    for (const operation of Object.keys(CONFLICTED) as GitOperation[]) {
        const repository = await conflictedRepository(workspace, operation, processXml);
        const stages = await unmergedStages(repository);
        if (!stages.includes(CONFLICTED[operation])) {
            throw new Error(`the ${operation} left no conflict on ${CONFLICTED[operation]}`);
        }
        conflicts[operation] = {
            workingFile: await readFile(join(repository, CONFLICTED[operation]), "utf8"),
            stages,
        };
    }
    return conflicts;
}

/** The repository and file of the conflict whose service tasks a merge by hand merges. */
export const HAND_MERGE_REPOSITORY = "hand-merge-repo";
export const HAND_MERGE_FILE = "order.bpmn";

interface ServiceTaskVersion {
    readonly name: string;
    readonly type: string;
    readonly target: string;
}

const BASE_SERVICE_TASK: ServiceTaskVersion = {
    name: "Check order",
    type: "check",
    target: "order",
};

/**
 * The tasks of the hand-merge conflict, in flow order. In both, main changes
 * the job type and feature the input's target, lines apart, so VS Code's
 * merge editor takes both edits itself. On Task_Ship both sides also rename
 * the task, a conflict the editor leaves to the user.
 */
const HAND_MERGE_TASKS = {
    Task_Check: { base: BASE_SERVICE_TASK, renamedByBoth: false },
    Task_Ship: { base: { ...BASE_SERVICE_TASK, name: "Ship order" }, renamedByBoth: true },
} as const;

export const MAIN_JOB_TYPE = "check-v2";
export const FEATURE_INPUT_TARGET = "incomingOrder";

type HandMergeSide = "base" | "main" | "feature";

function serviceTaskVersion(id: keyof typeof HAND_MERGE_TASKS, side: HandMergeSide) {
    const { base, renamedByBoth } = HAND_MERGE_TASKS[id];
    if (side === "base") return base;
    const name = renamedByBoth ? `${base.name} (${side})` : base.name;
    return side === "main"
        ? { ...base, name, type: MAIN_JOB_TYPE }
        : { ...base, name, target: FEATURE_INPUT_TARGET };
}

/** The hand-merge process as one side of the conflict holds it, the two tasks joined by a flow. */
function handMergeProcess(side: HandMergeSide): string {
    const ids = Object.keys(HAND_MERGE_TASKS) as (keyof typeof HAND_MERGE_TASKS)[];
    const tasks = ids
        .map((id, index) => {
            const version = serviceTaskVersion(id, side);
            const flows =
                index === 0
                    ? "      <bpmn:outgoing>Flow_Ship</bpmn:outgoing>"
                    : "      <bpmn:incoming>Flow_Ship</bpmn:incoming>";
            return `    <bpmn:serviceTask id="${id}" name="${version.name}">
      <bpmn:documentation>Checks the order</bpmn:documentation>
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="${version.type}" />
        <zeebe:ioMapping>
          <zeebe:input source="=order" target="${version.target}" />
        </zeebe:ioMapping>
      </bpmn:extensionElements>
${flows}
    </bpmn:serviceTask>`;
        })
        .join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_HandMerge" targetNamespace="http://bpmn.io/schema/bpmn" modeler:executionPlatform="Camunda Cloud" modeler:executionPlatformVersion="8.8.0">
  <bpmn:process id="Process_HandMerge" isExecutable="true">
${tasks}
    <bpmn:sequenceFlow id="Flow_Ship" sourceRef="Task_Check" targetRef="Task_Ship" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_HandMerge">
    <bpmndi:BPMNPlane id="Plane_HandMerge" bpmnElement="Process_HandMerge">
      <bpmndi:BPMNShape id="Task_Check_di" bpmnElement="Task_Check">
        <dc:Bounds x="160" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Ship_di" bpmnElement="Task_Ship">
        <dc:Bounds x="340" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_Ship_di" bpmnElement="Flow_Ship">
        <di:waypoint x="260" y="120" />
        <di:waypoint x="340" y="120" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
}

/**
 * A repository in `workspace` stopped at a merge of feature into main that
 * conflicts on both service tasks of the hand-merge process.
 */
export async function handMergeRepository(workspace: string): Promise<string> {
    const repository = join(workspace, HAND_MERGE_REPOSITORY);
    const file = join(repository, HAND_MERGE_FILE);
    const commitAll = (message: string) =>
        runGit(repository, "commit", "-q", "-a", "--no-verify", "-m", message);
    await mkdir(repository, { recursive: true });
    await runGit(repository, "init", "-q");
    await writeFile(file, handMergeProcess("base"));
    await runGit(repository, "add", HAND_MERGE_FILE);
    await runGit(repository, "commit", "-q", "--no-verify", "-m", "Add the order process");
    await runGit(repository, "checkout", "-q", "-b", "feature");
    await writeFile(file, handMergeProcess("feature"));
    await commitAll("Map the input on feature");
    await runGit(repository, "checkout", "-q", "main");
    await writeFile(file, handMergeProcess("main"));
    await commitAll("Change the job type on main");
    await gitOutcome(repository, "merge", "feature", "--no-edit");
    if (!(await unmergedStages(repository)).includes(HAND_MERGE_FILE)) {
        throw new Error(`the merge left no conflict on ${HAND_MERGE_FILE}`);
    }
    return repository;
}
