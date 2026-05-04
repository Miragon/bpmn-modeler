import { generateAmbientDts } from "./scriptApiDts";

/**
 * Tests for the kind-aware ambient `.d.ts` renderer that turns the
 * `scriptApi.ts` catalog into the text written next to each JavaScript
 * script in the bpmn-script virtual filesystem.
 */
describe("generateAmbientDts", () => {
    it("emits both interfaces regardless of kind", () => {
        for (const kind of [
            "script-task",
            "execution-listener",
            "task-listener",
        ] as const) {
            const dts = generateAmbientDts(kind);
            expect(dts).toContain("interface DelegateExecution {");
            expect(dts).toContain("interface DelegateTask {");
        }
    });

    it("declares only execution for a script task", () => {
        const dts = generateAmbientDts("script-task");
        expect(dts).toContain("declare const execution: DelegateExecution;");
        expect(dts).not.toContain("declare const task:");
        expect(dts).not.toContain("declare const eventName:");
    });

    it("adds eventName for an execution listener", () => {
        const dts = generateAmbientDts("execution-listener");
        expect(dts).toContain("declare const execution: DelegateExecution;");
        expect(dts).toContain("declare const eventName: string;");
        expect(dts).not.toContain("declare const task:");
    });

    it("declares all three globals for a task listener", () => {
        const dts = generateAmbientDts("task-listener");
        expect(dts).toContain("declare const execution: DelegateExecution;");
        expect(dts).toContain("declare const task: DelegateTask;");
        expect(dts).toContain("declare const eventName: string;");
    });

    it("maps Java types to TypeScript", () => {
        const dts = generateAmbientDts("task-listener");
        // Object → any
        expect(dts).toContain("getVariable(name: string): any;");
        // void preserved
        expect(dts).toContain(
            "setVariable(name: string, value: any): void;",
        );
        // Map<String, Object> → Record<string, any>
        expect(dts).toContain("getVariables(): Record<string, any>;");
        // Set<String> → string[]
        expect(dts).toContain("getVariableNames(): string[];");
        // int → number
        expect(dts).toContain("getPriority(): number;");
        // Camunda interface name passes through
        expect(dts).toContain("getExecution(): DelegateExecution;");
    });

    it("renders parameters with TS types", () => {
        const dts = generateAmbientDts("task-listener");
        expect(dts).toContain("setAssignee(userId: string): void;");
        expect(dts).toContain("setPriority(priority: number): void;");
    });

    it("includes JSDoc descriptions on declarations", () => {
        const dts = generateAmbientDts("task-listener");
        expect(dts).toContain(
            "/** Provides access to process variables and execution metadata. */",
        );
        expect(dts).toContain("/** The current execution context. */");
        expect(dts).toContain(
            "/** The name of the event triggering this listener. */",
        );
    });
});
