// Consumer-side type gate (#1505, proposal 2): compile the README usage
// examples against the *installed* package's declarations with a strict tsc
// program, exactly as a TypeScript consumer would. A d.ts roll-up that parses
// but no longer matches the runtime surface (wrong factory arity, missing
// member, broken subpath types) fails here instead of in a consumer's build.
//
// Uses the compiler API rather than a tsconfig + CLI run so the gate is
// unit-testable and the options cannot drift from what is asserted.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

const PKG = "@miragon/bpmn-modeler";

// One fixture per public entry, mirroring the documented README examples plus
// typed handle use (exportDiagram, captureViewState/applyViewState).
const CONSUMER_FIXTURES = {
    "modeler.ts": `
        import { createModeler, detectEngine } from "${PKG}";

        export async function useModeler(
            canvas: HTMLElement,
            panel: HTMLElement,
            xml: string,
        ): Promise<string> {
            const engine = detectEngine(xml) ?? "c7";
            const modeler = await createModeler(canvas, {
                engine,
                propertiesPanel: { parent: panel },
                linting: false,
            });
            await modeler.loadDiagram(xml);
            const state = modeler.captureViewState();
            modeler.applyViewState(state);
            const exported: string = await modeler.exportDiagram();
            modeler.destroy();
            return exported;
        }
    `,
    "designer.ts": `
        import { createDesigner } from "${PKG}/design";

        export async function useDesigner(
            canvas: HTMLElement,
            panel: HTMLElement,
            xml: string,
        ): Promise<void> {
            const designer = await createDesigner(canvas, {
                propertiesPanel: { parent: panel },
                theme: "automatic",
            });
            await designer.loadDiagram(xml);
            designer.getService("commandStack");
            designer.destroy();
        }
    `,
    "viewer.ts": `
        import { createViewer } from "${PKG}/viewer";

        export async function useViewer(
            canvas: HTMLElement,
            panel: HTMLElement,
            xml: string,
        ): Promise<string[]> {
            const withPanel = await createViewer(canvas, {
                propertiesPanel: { parent: panel },
            });
            await withPanel.loadDiagram(xml);
            withPanel.selection.onSelectionChanged((ids: string[]) => void ids);
            const selected = withPanel.selection.getSelectedElementIds();
            withPanel.destroy();

            const bare = await createViewer(canvas, { theme: "automatic" });
            bare.destroy();
            return selected;
        }
    `,
    "mode.ts": `
        import { createModeSession } from "${PKG}/mode";
        import { createModeler, detectEngine } from "${PKG}";
        import { createViewer } from "${PKG}/viewer";
        import { createDesigner } from "${PKG}/design";

        export async function useModeSession(
            container: HTMLElement,
            panel: HTMLElement,
            xml: string,
        ): Promise<readonly string[]> {
            const session = await createModeSession({
                container,
                engine: detectEngine(xml),
                surfaces: {
                    view: ({ container, theme }) =>
                        createViewer(container, { theme, propertiesPanel: { parent: panel } }),
                    design: ({ container, theme }) =>
                        createDesigner(container, { theme, propertiesPanel: { parent: panel } }),
                    implement: ({ container, theme, mode, engine }) =>
                        createModeler(container, {
                            engine,
                            mode,
                            theme,
                            propertiesPanel: { parent: panel },
                        }),
                },
            });
            await session.getHandle().loadDiagram(xml);
            return session.availableModes();
        }
    `,
    "diff.ts": `
        import { computeDiff, sideView } from "${PKG}/diff";

        export async function useDiff(beforeXml: string, afterXml: string): Promise<number> {
            const result = await computeDiff(beforeXml, afterXml);
            const after = sideView(result, "after");
            void after.added;
            return result.counts.added;
        }
    `,
    "lint.ts": `
        import { createModeler } from "${PKG}";

        export async function useLint(
            canvas: HTMLElement,
            panel: HTMLElement,
        ): Promise<void> {
            const modeler = await createModeler(canvas, {
                engine: "c8",
                propertiesPanel: { parent: panel },
                linting: { module: await import("${PKG}/lint") },
            });
            modeler.destroy();
        }
    `,
};

export function checkConsumerTypes({ consumerDir, fixtures = CONSUMER_FIXTURES }) {
    const fixtureDir = join(resolve(consumerDir), "consumer-type-fixtures");
    rmSync(fixtureDir, { recursive: true, force: true });
    mkdirSync(fixtureDir, { recursive: true });

    const rootNames = [];
    for (const [name, source] of Object.entries(fixtures)) {
        const filePath = join(fixtureDir, name);
        writeFileSync(filePath, source);
        rootNames.push(filePath);
    }

    try {
        const program = ts.createProgram(rootNames, {
            strict: true,
            noEmit: true,
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            // The exports map is types/import-only, so classic node resolution
            // would miss every subpath.
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
            types: [],
            // The rolled-up d.ts carries `declare module` augmentations of
            // untyped upstream deps (bpmn-js-token-simulation, bpmnlint, …) and
            // implicit-any roll-up artifacts — internal noise a real consumer
            // silences the same way. Fixture call-sites are still checked in
            // full; only declaration-file bodies are skipped.
            skipLibCheck: true,
        });
        const diagnostics = ts.getPreEmitDiagnostics(program);
        if (diagnostics.length > 0) {
            const formatted = ts.formatDiagnostics(diagnostics, {
                getCanonicalFileName: (fileName) => fileName,
                getCurrentDirectory: () => fixtureDir,
                getNewLine: () => "\n",
            });
            throw new Error(`consumer program failed to type-check:\n${formatted}`);
        }
    } finally {
        rmSync(fixtureDir, { recursive: true, force: true });
    }

    return { checkedFixtures: rootNames.length };
}
