import type { HostThemeKind } from "@miragon/bpmn-modeler-shared";

import type { DiffSides } from "../../port/diffSides";
import type { DocumentSession } from "../../port/documentSession";

interface OrcaDisposable {
    dispose(): void;
}

interface OrcaSession {
    readonly value: string;
    readonly readOnly: boolean;
    onReplace(listener: (text: string) => void): OrcaDisposable;
    change(text: string): void;
    flush(): Promise<void>;
    dispose(): void;
}

interface OrcaTextContent {
    readonly kind: "text";
    readonly text: string;
}

interface OrcaDocument {
    readonly content: OrcaTextContent;
    /** Only in a diff tab: the side the change started from. */
    readonly diff?: { readonly original: OrcaTextContent };
}

/** The part of the frozen `window.orca` of a custom editor frame (plugin API 1) this plugin uses. */
interface OrcaFrameApi {
    readonly locale?: string;
    readonly document: {
        session(): Promise<OrcaSession>;
        get(): Promise<OrcaDocument>;
        onDidChange(listener: (document: OrcaDocument) => void): OrcaDisposable;
    };
    on(event: "theme", listener: (theme: { colorScheme: string }) => void): OrcaDisposable;
    on(event: "editor.flush", listener: () => Promise<void>): OrcaDisposable;
}

function orcaFrame(): OrcaFrameApi {
    const { orca } = window as unknown as { orca?: OrcaFrameApi };
    if (!orca?.document) throw new Error("This page does not run as an Orca custom editor");
    return orca;
}

export async function openOrcaSession(): Promise<DocumentSession> {
    const orca = orcaFrame();
    const session = await orca.document.session();
    return {
        get value() {
            return session.value;
        },
        get readOnly() {
            return session.readOnly;
        },
        onReplace: (listener) => {
            const subscription = session.onReplace(listener);
            return () => subscription.dispose();
        },
        change: (text) => session.change(text),
        flush: () => session.flush(),
        onSaveRequested: (listener) => {
            try {
                const subscription = orca.on("editor.flush", listener);
                return () => subscription.dispose();
            } catch (error) {
                // A frame without the event (the shell's Orca stub) still saves what the session holds.
                console.warn("Orca offers no editor.flush event", error);
                return () => undefined;
            }
        },
        dispose: () => session.dispose(),
    };
}

/** Whether Orca opened this frame in a diff tab rather than an editor tab. */
export async function opensOrcaDiff(): Promise<boolean> {
    const document = await orcaFrame().document.get();
    return document.diff !== undefined;
}

/** Each pair of sides Orca sends while the diff tab is open, starting with the current one. */
export function followOrcaDiff(apply: (sides: DiffSides) => void): () => void {
    const subscription = orcaFrame().document.onDidChange((document) => {
        if (document.diff) {
            apply({ before: document.diff.original.text, after: document.content.text });
        }
    });
    return () => subscription.dispose();
}

/** Orca's UI language, else the system's, as the dictionaries name it: `de` for `de-DE`. */
export function orcaLanguage(): string {
    return (orcaFrame().locale ?? navigator.language).split("-")[0]!;
}

export function currentOrcaTheme(): HostThemeKind {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Orca bakes its `light`/`dark` class into `<html>` before the first paint and then emits `theme`. */
export function followOrcaTheme(apply: (theme: HostThemeKind) => void): () => void {
    apply(currentOrcaTheme());
    const subscription = orcaFrame().on("theme", (theme) =>
        apply(theme.colorScheme === "dark" ? "dark" : "light"),
    );
    return () => subscription.dispose();
}
