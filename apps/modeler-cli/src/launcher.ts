import { spawn } from "child_process";

/**
 * Opens the given URL in the user's default browser.
 *
 * Uses the OS-native open command so we don't take a dependency on the
 * ESM-only `open` package. Silently detaches the child process.
 */
export async function openBrowser(url: string): Promise<void> {
    const command = resolveOpenCommand();
    const child = spawn(command.binary, [...command.args, url], {
        detached: true,
        stdio: "ignore",
        shell: command.shell,
    });
    child.on("error", (err) => {
        console.warn(`[launcher] Failed to open browser: ${err.message}`);
        console.warn(`          Navigate manually to: ${url}`);
    });
    child.unref();
}

function resolveOpenCommand(): { binary: string; args: string[]; shell: boolean } {
    switch (process.platform) {
        case "darwin":
            return { binary: "open", args: [], shell: false };
        case "win32":
            return { binary: "start", args: ["", ""], shell: true };
        default:
            return { binary: "xdg-open", args: [], shell: false };
    }
}
