// The smoke test's companion extension. It runs the functions the test sends
// against the VS Code API, so test plumbing needs neither the keyboard nor
// the focus. VS Code loads it as a second development extension.
const { randomBytes } = require("node:crypto");
const { writeFileSync } = require("node:fs");
const { createServer } = require("node:http");
const { join } = require("node:path");
const { compileFunction } = require("node:vm");

const vscode = require("vscode");

// Beside this file: the session copies the driver into its own folder, where it reads the endpoint.
const ENDPOINT_FILE = join(__dirname, "endpoint.json");

function bodyOf(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        request.on("data", (chunk) => chunks.push(chunk));
        request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        request.on("error", reject);
    });
}

async function evaluate(request) {
    const { source, argument } = JSON.parse(await bodyOf(request));
    const run = compileFunction(`return (${source})(vscode, argument)`, ["vscode", "argument"]);
    return run(vscode, argument);
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
        evaluate(request).then(
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
