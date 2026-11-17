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

function windowState() {
    return {
        windowFocused: vscode.window.state.focused,
        activeTab: vscode.window.tabGroups.activeTabGroup.activeTab?.label ?? null,
        tabs: vscode.window.tabGroups.all.map((group) =>
            group.tabs.map((tab) => ({ label: tab.label, isDirty: tab.isDirty })),
        ),
    };
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
