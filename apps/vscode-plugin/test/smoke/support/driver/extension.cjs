// The smoke test's companion extension. It answers the test's requests with
// VS Code API calls, so test plumbing needs neither the keyboard nor the
// focus. VS Code loads it as a second development extension. It runs the
// operations below and nothing else: no code it is sent.
const { randomBytes } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const { createServer } = require("node:http");
const { join } = require("node:path");

const vscode = require("vscode");

// Beside this file: the session copies the driver into its own folder, where it reads the endpoint.
const ENDPOINT_FILE = join(__dirname, "endpoint.json");

/** JSON has no URI, so a file's URI travels as `{ $fileUri: path }`. */
function revived(argument) {
    return argument !== null && typeof argument === "object" && "$fileUri" in argument
        ? vscode.Uri.file(String(argument.$fileUri))
        : argument;
}

const allTabs = () => vscode.window.tabGroups.all.flatMap((group) => group.tabs);

async function executeCommand({ command, args }) {
    await vscode.commands.executeCommand(String(command), ...args.map(revived));
}

async function updateSetting({ key, value }) {
    await vscode.workspace
        .getConfiguration()
        .update(String(key), value, vscode.ConfigurationTarget.Global);
}

async function closeTabs({ labels }) {
    await vscode.window.tabGroups.close(allTabs().filter((tab) => labels.includes(tab.label)));
}

/** Closing an unsaved tab through the API would ask; this drops the changes. */
async function revertAndCloseAllEditors() {
    for (let closed = 0; closed < 50 && allTabs().length > 0; closed++) {
        await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
    }
}

/** The open text documents of a scheme, such as the merge editor's result, with their text as edited. */
function documentTexts({ scheme }) {
    return vscode.workspace.textDocuments
        .filter((document) => document.uri.scheme === String(scheme))
        .map((document) => ({
            path: document.uri.path,
            text: document.getText(),
            isDirty: document.isDirty,
        }));
}

/** Replaces text in the open documents of a scheme, as a user's typing would; it saves nothing. False when no document holds the text. */
async function replaceInDocuments({ scheme, search, replacement }) {
    const edit = new vscode.WorkspaceEdit();
    let replaced = 0;
    for (const document of vscode.workspace.textDocuments) {
        if (document.uri.scheme !== String(scheme)) continue;
        const text = document.getText();
        const at = text.indexOf(String(search));
        if (at < 0) continue;
        replaced += 1;
        edit.replace(
            document.uri,
            new vscode.Range(
                document.positionAt(at),
                document.positionAt(at + String(search).length),
            ),
            String(replacement),
        );
    }
    // An empty edit applies as a success, which would hide a search text gone stale.
    return replaced > 0 && (await vscode.workspace.applyEdit(edit));
}

function windowState() {
    return {
        windowFocused: vscode.window.state.focused,
        activeTab: vscode.window.tabGroups.activeTabGroup.activeTab?.label ?? null,
        tabs: vscode.window.tabGroups.all.map((group) =>
            group.tabs.map((tab) => ({ label: tab.label, isDirty: tab.isDirty })),
        ),
    };
}

/** The files Git lists as unmerged in the repositories it has opened; none while it is disabled or still starting. */
function unmergedFiles() {
    const git = vscode.extensions.getExtension("vscode.git")?.exports;
    if (!git?.enabled) return [];
    return git
        .getAPI(1)
        .repositories.flatMap((repository) =>
            repository.state.mergeChanges.map((change) => change.uri.fsPath),
        );
}

function run(operation, payload) {
    switch (operation) {
        case "executeCommand":
            return executeCommand(payload);
        case "updateSetting":
            return updateSetting(payload);
        case "closeTabs":
            return closeTabs(payload);
        case "revertAndCloseAllEditors":
            return revertAndCloseAllEditors();
        case "windowState":
            return windowState();
        case "unmergedFiles":
            return unmergedFiles();
        case "documentTexts":
            return documentTexts(payload);
        case "replaceInDocuments":
            return replaceInDocuments(payload);
        default:
            throw new Error(`the smoke driver knows no operation ${JSON.stringify(operation)}`);
    }
}

function bodyOf(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        request.on("data", (chunk) => chunks.push(chunk));
        request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        request.on("error", reject);
    });
}

async function answer(request) {
    const { operation, payload } = JSON.parse(await bodyOf(request));
    return run(operation, payload);
}

function activate(context) {
    // Any local process can reach a loopback port; only the test knows the token.
    const token = randomBytes(16).toString("hex");
    const server = createServer((request, response) => {
        const reply = (status, body) => {
            response.writeHead(status, { "content-type": "application/json" });
            response.end(JSON.stringify(body));
        };
        if (request.headers.authorization !== `Bearer ${token}`) {
            reply(401, { error: "unauthorized" });
            return;
        }
        answer(request).then(
            (result) => reply(200, { result }),
            (error) => reply(500, { error: String(error?.stack ?? error) }),
        );
    });
    server.listen(0, "127.0.0.1", () => {
        writeFileSync(ENDPOINT_FILE, JSON.stringify({ port: server.address().port, token }));
    });
    context.subscriptions.push({ dispose: () => server.close() });
}

module.exports = { activate };
