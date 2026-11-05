import type { HostThemeKind } from "@miragon/bpmn-modeler-shared";

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

/** The part of the frozen `window.orca` of a custom editor frame (plugin API 1) this plugin uses. */
interface OrcaFrameApi {
    readonly locale?: string;
    readonly document: { session(): Promise<OrcaSession> };
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
