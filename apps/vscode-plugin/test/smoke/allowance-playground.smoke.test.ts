import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { FrameLocator, Locator } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { COMMAND_KEY, VsCodeSession, downloadVsCode, packExtension } from "./vscodeSession";

/**
 * Rows of the checklist in resources/allowance-playground/README.md in a real
 * VS Code, one profile for every window. Each window is its own VS Code
 * process on that profile, opened after the previous one quit, so the
 * allowances must survive a quit; two windows open at once are not covered.
 *
 * Covered: rows 1, 2, 3, 4 (only where git 2.48 or later built the relative
 * worktree, skipped otherwise), 5 (the old pnpm folder kept, then removed),
 * 6, 7 and 8 (the question and "Allowed in", not the Allow), 9 (with the
 * Allow), 10, 11 and 13. Not covered: row 12 (multi-root workspace), the
 * optional stale Allow, the IntelliJ column, the 1.21.0 migration, remote
 * windows and Windows.
 */

const runFile = promisify(execFile);
const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const DIST_DIRECTORY = join(REPOSITORY_ROOT, "dist/apps/vscode-plugin");
// Not below test-results/vscode-smoke, which the other smoke file empties in its beforeAll.
const RESULTS_DIRECTORY = join(REPOSITORY_ROOT, "test-results/vscode-smoke-allowance");
const PLAYGROUND_SCRIPT = join(
    REPOSITORY_ROOT,
    "resources/allowance-playground/create-playground.mjs",
);

const DIAGRAM = "order.bpmn";
const TASKS = { check: "Check stock", pack: "Pack order", ship: "Ship order" } as const;
const TASK_IDS = { check: "Task_check", pack: "Task_pack", ship: "Task_ship" } as const;
const PLUGIN_NAME = "Hello badge";
const RULE_PACKAGE = "bpmnlint-plugin-acme";
const PLUGIN_NOTICE = "1 BPMN plugin in this workspace is not allowed yet.";
const RULE_PACKAGE_NOTICE =
    "1 bpmnlint rule package in this workspace is not allowed yet, so rules from it are skipped.";
const BLOCKED_STATUS = "BPMNlint: 1 rule package not allowed";
// Absence checks match every count and kind, so a plural or an unexpected notice fails them too.
const ANY_NOTICE = /not allowed yet/;
const ANY_BLOCKED_STATUS = /rule packages? not allowed/;
const ADD_ONS_VIEW = 'main[aria-label="Add-ons"]';
const TIMEOUT_MS = 30_000;
/** Counted from the badge and the acme lint, which show the plugin served and a host lint run. */
const NO_NOTICE_WAIT_MS = 5_000;
/** Counted from the proof that the second add-on was blocked, so its notice was already due. */
const ONE_QUESTION_WAIT_MS = 1_000;
const SCENARIO_TIMEOUT_MS = 240_000;
const NOT_ALLOWED_PRECONDITION =
    "precondition failed: scenario 1 did not allow both add-ons in acme/ (README row 1), so this row cannot be judged";

type NoticeKind = "plugin" | "rulePackage";
const NOTICE_TEXT: Record<NoticeKind, string> = {
    plugin: PLUGIN_NOTICE,
    rulePackage: RULE_PACKAGE_NOTICE,
};
const OTHER: Record<NoticeKind, NoticeKind> = { plugin: "rulePackage", rulePackage: "plugin" };
const RULE_PACKAGE_ROW = new RegExp(`^${RULE_PACKAGE}@`);

const log = (line: string) => console.log(`[allowance-playground] ${line}`);
const delay = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exactly = (text: string) => new RegExp(`^${escapeRegExp(text)}$`);

function badgeText(webview: FrameLocator): Promise<string | null> {
    return webview
        .locator(".hello-badge")
        .first()
        .textContent({ timeout: 500 })
        .catch(() => null);
}

async function diagramRendered(webview: FrameLocator): Promise<boolean> {
    return (await webview.locator(".djs-container .djs-element.djs-shape").count()) >= 5;
}

/** The canvas' lint overlays, as the user reads them in the issue popover. */
async function lintOverlayText(webview: FrameLocator): Promise<string> {
    return webview
        .locator(".bjsl-overlay")
        .evaluateAll((overlays) => overlays.map((overlay) => overlay.textContent ?? "").join("\n"))
        .catch(() => "");
}

function acmeMessages(version: string, taskNames: readonly string[]): string[] {
    return taskNames.map((name) => `acme ${version}: task "${name}" found`);
}

async function showsAcmeLint(
    webview: FrameLocator,
    version: string,
    taskNames: readonly string[],
): Promise<boolean> {
    const text = await lintOverlayText(webview);
    return acmeMessages(version, taskNames).every((message) => text.includes(message));
}

function addOnRow(addOns: FrameLocator, title: string | RegExp): Locator {
    return addOns.locator(".av-row", {
        has: addOns.locator(".av-row-title", { hasText: title }),
    });
}

function addOnDetail(addOns: FrameLocator, name: string | RegExp): Locator {
    return addOns.getByRole("article", { name });
}

/**
 * A row opens its details in the editor tab "Add-on: …". The view re-renders
 * its list after an action, so a click can land on a row it replaced.
 */
async function showAddOnDetail(
    addOns: FrameLocator,
    name: string | RegExp,
    detailPage: () => Promise<FrameLocator>,
): Promise<{ detail: Locator; page: FrameLocator }> {
    const deadline = Date.now() + TIMEOUT_MS;
    for (;;) {
        await addOnRow(addOns, name)
            .first()
            .click({ timeout: 5_000 })
            .catch(() => undefined);
        const page = await detailPage();
        const detail = addOnDetail(page, name);
        const shown = await detail
            .waitFor({ timeout: 1_000 })
            .then(() => true)
            .catch(() => false);
        if (shown || Date.now() > deadline) {
            await detail.waitFor({ timeout: 1_000 });
            return { detail, page };
        }
    }
}

async function factsOf(detail: Locator): Promise<Record<string, string>> {
    const facts = await detail
        .locator(".av-fact")
        .evaluateAll((nodes) =>
            nodes.map((node) => [
                node.querySelector("dt")?.textContent ?? "",
                node.querySelector("dd")?.textContent ?? "",
            ]),
        );
    return Object.fromEntries(facts);
}

function nameOf(kind: NoticeKind): string | RegExp {
    return kind === "plugin" ? PLUGIN_NAME : RULE_PACKAGE_ROW;
}

function storeFolder(checkout: string, version: string): string {
    return join(checkout, "node_modules", ".pnpm", `${RULE_PACKAGE}@${version}`);
}

async function installedVersion(packageFolder: string): Promise<string> {
    return JSON.parse(await readFile(join(packageFolder, "package.json"), "utf8")).version;
}

describe("the allowance playground in a real VS Code, one profile for every window", () => {
    let rootDirectory = "";
    let playground = "";
    let extensionPath = "";
    let executablePath = "";
    let extensionId = "";
    let session: VsCodeSession | undefined;
    let windowNumber = 0;
    let acmeAllowed = false;
    const seenLogFolders = new Set<string>();

    const vscode = (): VsCodeSession => {
        if (!session) throw new Error("no VS Code window is open");
        return session;
    };
    const page = () => vscode().page;
    const toasts = () => page().locator(".notifications-toasts .notification-toast");
    const toast = (text: string | RegExp) =>
        toasts().filter({
            has: page().locator(".notification-list-item-message", {
                hasText: typeof text === "string" ? exactly(text) : text,
            }),
        });
    const statusBarText = async () => (await page().locator(".part.statusbar").textContent()) ?? "";

    function requireAcmeAllowed(): void {
        if (!acmeAllowed) throw new Error(NOT_ALLOWED_PRECONDITION);
    }

    async function openWindow(folder: string): Promise<VsCodeSession> {
        windowNumber++;
        const workspaceDirectory = join(playground, folder);
        log(`window ${windowNumber}: ${folder}/${DIAGRAM}`);
        session = await VsCodeSession.launch({
            executablePath,
            extensionPath,
            extensionId,
            // The same root every time: one user data dir, one global state.
            rootDirectory,
            workspaceDirectory,
            fileToOpen: join(workspaceDirectory, DIAGRAM),
            customEditors: { "*.bpmn": "bpmn-modeler.bpmn" },
            colorTheme: "Default Light+",
            timeoutMs: TIMEOUT_MS,
        });
        return session;
    }

    /** The allowances live in global state, which only a graceful quit is sure to flush. */
    async function closeWindow(): Promise<void> {
        if (!session) return;
        const closed = await session.close();
        session = undefined;
        if (closed === "killed") {
            acmeAllowed = false;
            throw new Error(
                `window ${windowNumber} did not quit within the timeout and was killed, so its allowances may not have been stored`,
            );
        }
    }

    /** The output channel lines of the window that is open now, not of the earlier ones. */
    async function windowLog(): Promise<string> {
        const logs = vscode().logsDirectory;
        const folders = (await readdir(logs).catch((): string[] => [])).filter(
            (folder) => !seenLogFolders.has(folder),
        );
        const files = (
            await Promise.all(
                folders.map(async (folder) =>
                    (
                        await readdir(join(logs, folder), { recursive: true }).catch(
                            (): string[] => [],
                        )
                    ).map((file) => join(logs, folder, file)),
                ),
            )
        )
            .flat()
            .filter((file) => file.endsWith(".log") && file.split(/[\\/]/).includes(extensionId));
        const texts = await Promise.all(
            files.map((file) => readFile(file, "utf8").catch(() => "")),
        );
        return texts.join("\n");
    }

    async function markLogsSeen(): Promise<void> {
        for (const folder of await readdir(vscode().logsDirectory).catch((): string[] => [])) {
            seenLogFolders.add(folder);
        }
    }

    async function saveEvidence(name: string, failed: boolean): Promise<void> {
        await vscode()
            .screenshot(join(RESULTS_DIRECTORY, `${name}.png`))
            .catch(() => undefined);
        await writeFile(join(RESULTS_DIRECTORY, `${name}.log`), await windowLog()).catch(
            () => undefined,
        );
        // A notice toast hides on its own before a timeout ends; the center still holds it.
        if (failed) {
            const notices = await noticesInCenter().catch((error: unknown) => [String(error)]);
            await writeFile(
                join(RESULTS_DIRECTORY, `${name}.notices.txt`),
                notices.join("\n"),
            ).catch(() => undefined);
        }
    }

    async function closeWindowWithEvidence(name: string): Promise<void> {
        await saveEvidence(name, false);
        await markLogsSeen();
        await closeWindow();
    }

    /** Every notice the window holds, the toasts and those the center keeps after a toast hid. */
    async function noticesInCenter(): Promise<string[]> {
        await vscode().runCommand("Notifications: Show Notifications");
        const center = page().locator(".notifications-center");
        await center.waitFor({ state: "visible", timeout: TIMEOUT_MS });
        await delay(300);
        const texts = await center
            .locator(".notification-list-item-message")
            .allTextContents()
            .catch((): string[] => []);
        await vscode().runCommand("Notifications: Hide Notifications");
        return texts;
    }

    /** A poll for zero passes at once, so this watches the whole wait, then the center. */
    async function expectNoNoticeFor(milliseconds: number, where: string): Promise<void> {
        const until = Date.now() + milliseconds;
        while (Date.now() < until) {
            const shown = await toasts().allTextContents();
            expect(
                shown.filter((text) => ANY_NOTICE.test(text)),
                `${where}: a notice asked although the add-ons are allowed`,
            ).toEqual([]);
            await delay(200);
        }
        const kept = await noticesInCenter();
        log(`${where}: notification center after ${milliseconds} ms: ${JSON.stringify(kept)}`);
        expect(
            kept.filter((text) => ANY_NOTICE.test(text)),
            `${where}: the notification center holds a notice although the add-ons are allowed`,
        ).toEqual([]);
    }

    async function expectBadge(badge: string, because: string): Promise<void> {
        await expect
            .poll(() => badgeText(vscode().webview()), { timeout: TIMEOUT_MS, message: because })
            .toBe(badge);
    }

    async function expectAcmeLint(
        version: string,
        taskNames: readonly string[],
        because: string,
    ): Promise<void> {
        await expect
            .poll(() => showsAcmeLint(vscode().webview(), version, taskNames), {
                timeout: TIMEOUT_MS,
                message: because,
            })
            .toBe(true);
    }

    /** The first notice of a window, whichever kind asks first. */
    async function firstNotice(): Promise<NoticeKind> {
        const either = toast(
            new RegExp(`^(${escapeRegExp(PLUGIN_NOTICE)}|${escapeRegExp(RULE_PACKAGE_NOTICE)})$`),
        );
        await either.first().waitFor({ state: "visible", timeout: TIMEOUT_MS });
        const text =
            (await either.first().locator(".notification-list-item-message").textContent()) ?? "";
        return text === PLUGIN_NOTICE ? "plugin" : "rulePackage";
    }

    /**
     * The product's own proof that it blocked the add-on whose notice did not
     * show yet. The editor renders after the host answered its plugin request,
     * so a rendered diagram proves the plugin was decided; for the rule package
     * the host logs the skipped package before it asks.
     */
    async function waitUntilBlocked(kind: NoticeKind, folder: string): Promise<void> {
        if (kind === "plugin") return;
        const line = new RegExp(
            `bpmnlint: rule package ${RULE_PACKAGE}@\\S+ \\(${escapeRegExp(join(playground, folder))}/[^)]*\\) is not allowed yet \\([^)]*\\), so rules from it are skipped\\.`,
        );
        await expect
            .poll(windowLog, {
                timeout: TIMEOUT_MS,
                message: `${folder}: the output channel never logged that ${RULE_PACKAGE} was skipped`,
            })
            .toMatch(line);
    }

    /** The editor tab "Add-on: …", where a row or Review… shows an add-on's details. */
    const detailPage = () => vscode().editorWebview(ADD_ONS_VIEW);

    /**
     * Both notices, one after the other: the second may not show before the
     * first is answered. Review… is the answer each time; it opens the Add-ons
     * view on the add-on.
     */
    async function reviewBothNotices(folder: string): Promise<{
        order: NoticeKind[];
        addOns: FrameLocator;
    }> {
        const first = await firstNotice();
        const second = OTHER[first];
        log(`${folder}: first notice: ${NOTICE_TEXT[first]}`);
        await waitUntilBlocked(second, folder);
        const until = Date.now() + ONE_QUESTION_WAIT_MS;
        while (Date.now() < until) {
            expect(
                await toast(NOTICE_TEXT[second]).count(),
                `${folder}: the ${second} notice showed while the ${first} notice was open`,
            ).toBe(0);
            await delay(100);
        }
        expect(await toast(NOTICE_TEXT[first]).count()).toBe(1);
        await toast(NOTICE_TEXT[first]).getByRole("button", { name: "Review…" }).click();
        // Review… opens the add-on's details in the editor tab.
        await addOnDetail(await detailPage(), nameOf(first)).waitFor({ timeout: TIMEOUT_MS });

        await toast(NOTICE_TEXT[second]).waitFor({ state: "visible", timeout: TIMEOUT_MS });
        log(`${folder}: second notice after Review… on the first: ${NOTICE_TEXT[second]}`);
        await toast(NOTICE_TEXT[second]).getByRole("button", { name: "Review…" }).click();
        // The second Review… shows its add-on in the same tab.
        await addOnDetail(await detailPage(), nameOf(second)).waitFor({ timeout: TIMEOUT_MS });
        const addOns = await vscode().viewWebview(ADD_ONS_VIEW);
        return { order: [first, second], addOns };
    }

    async function reviewFacts(
        addOns: FrameLocator,
        name: string | RegExp,
    ): Promise<{ state: string; facts: Record<string, string>; title: string }> {
        const { detail } = await showAddOnDetail(addOns, name, detailPage);
        return {
            title: (await detail.locator(".av-detail-name").textContent()) ?? "",
            state: (await detail.locator(".av-state-line").textContent()) ?? "",
            facts: await factsOf(detail),
        };
    }

    async function allowInView(
        addOns: FrameLocator,
        name: string | RegExp,
    ): Promise<{ status: string; facts: Record<string, string>; title: string; review: string }> {
        const { detail, page } = await showAddOnDetail(addOns, name, detailPage);
        const title = (await detail.locator(".av-detail-name").textContent()) ?? "";
        const facts = await factsOf(detail);
        const review = (await detail.locator(".av-review-body").textContent()) ?? "";
        const status = page.getByRole("status");
        const allowed = new RegExp(`^Allowed ${escapeRegExp(title)}[ .]`);
        const allow = detail
            .locator(".av-review-end")
            .getByRole("button", { name: "Allow", exact: true });
        await allow.click();
        // A rebuild after the previous action can replace the detail while the click lands, which
        // then reaches no button. Click once more only if the click left no trace: no result, no
        // refusal, and the add-on is still not allowed. A refusal fails the poll below with its text.
        const landed = await expect
            .poll(() => status.textContent(), { timeout: 5_000 })
            .toMatch(allowed)
            .then(() => true)
            .catch(() => false);
        if (!landed) {
            const banner = (await status.textContent()) ?? "";
            const state = (await detail.locator(".av-state-line").textContent()) ?? "";
            if (!banner.startsWith(`Allowed ${title}`) && /Not allowed yet/.test(state)) {
                log(`Allow of ${title} left no trace (banner "${banner}"), clicking once more`);
                await allow.click();
            }
        }
        // The banner still holds the result of an earlier action until this one lands.
        await expect.poll(() => status.textContent(), { timeout: TIMEOUT_MS }).toMatch(allowed);
        // Wait for the rebuild that this allow causes, so the next click does not race it.
        await expect
            .poll(async () => (await detail.locator(".av-state-line").textContent()) ?? "", {
                timeout: TIMEOUT_MS,
                message: `${title}: the detail never showed Allowed after the allow landed`,
            })
            .toMatch(/^Allowed/);
        return { status: (await status.textContent()) ?? "", facts, title, review };
    }

    async function revokeInView(addOns: FrameLocator, name: string | RegExp): Promise<string> {
        const { detail, page } = await showAddOnDetail(addOns, name, detailPage);
        const title = (await detail.locator(".av-detail-name").textContent()) ?? "";
        const status = page.getByRole("status");
        await detail.getByRole("button", { name: "Revoke", exact: true }).click();
        await expect
            .poll(() => status.textContent(), { timeout: TIMEOUT_MS })
            .toMatch(new RegExp(`^Revoked ${escapeRegExp(title)}[ .]`));
        return (await status.textContent()) ?? "";
    }

    /** The view's rows, sorted by title, and what an allowed detail offers. */
    async function addOnsViewRows(): Promise<{ title: string; state: string }[]> {
        await vscode().runCommand("Focus on Add-ons View");
        const addOns = await vscode().viewWebview(ADD_ONS_VIEW);
        await addOnRow(addOns, PLUGIN_NAME).first().waitFor({ timeout: TIMEOUT_MS });
        await addOnRow(addOns, RULE_PACKAGE).first().waitFor({ timeout: TIMEOUT_MS });
        const rows = await addOns.locator(".av-row").evaluateAll((elements) =>
            elements.map((row) => ({
                title: row.querySelector(".av-row-title")?.textContent ?? "",
                // An allowed row is settled, so it shows no status at all.
                state: row.querySelector(".av-row-status")?.textContent ?? "",
            })),
        );
        for (const name of [PLUGIN_NAME, RULE_PACKAGE_ROW]) {
            const { detail } = await showAddOnDetail(addOns, name, detailPage);
            const facts = await factsOf(detail);
            log(`Add-ons detail of ${String(name)}: ${(await detail.textContent()) ?? ""}`);
            // The review, and with it "Allowed in", shows only for an add-on not allowed yet.
            expect(facts, `${String(name)} offers a review although it is allowed`).toEqual({});
            expect(
                await detail.getByRole("button", { name: "Revoke", exact: true }).count(),
                `${String(name)} offers no Revoke although it is allowed`,
            ).toBe(1);
        }
        await vscode().runCommand("View: Show Explorer");
        return rows.sort((left, right) => (left.title < right.title ? -1 : 1));
    }

    /**
     * A window with nothing to ask. The editor renders first, so a missing
     * badge or acme lint names the carry-over, not the rendering.
     */
    async function expectAllowedWindow(
        folder: string,
        badge: string,
        version: string,
    ): Promise<void> {
        await openWindow(folder);
        const startedAt = Date.now();
        await vscode().showInCustomEditor(DIAGRAM, diagramRendered);
        await expectBadge(
            badge,
            `${folder}: the badge "${badge}" never showed: did the plugin allowance of acme/ not carry over?`,
        );
        await expectAcmeLint(
            version,
            Object.values(TASKS),
            `${folder}: the acme ${version} warnings never showed: did the rule package allowance of acme/ not carry over?`,
        );
        log(
            `${folder}: badge "${badge}" and acme ${version} lint after ${Date.now() - startedAt} ms`,
        );
        await expectNoNoticeFor(NO_NOTICE_WAIT_MS, folder);
        expect(
            await statusBarText(),
            `${folder}: the status bar reports a rule package as not allowed`,
        ).not.toMatch(ANY_BLOCKED_STATUS);
    }

    /** A window that must ask about both add-ons; the Allowed in of each review is returned. */
    async function expectAskingWindow(folder: string): Promise<{
        allowedIn: Record<NoticeKind, string>;
        addOns: FrameLocator;
    }> {
        await openWindow(folder);
        await vscode().showInCustomEditor(DIAGRAM, diagramRendered);
        const { order, addOns } = await reviewBothNotices(folder);
        const plugin = await reviewFacts(addOns, PLUGIN_NAME);
        const rulePackage = await reviewFacts(addOns, RULE_PACKAGE_ROW);
        log(
            `${folder}: notices ${order.join(" then ")}; plugin "${plugin.state}" ${JSON.stringify(plugin.facts)}; ${rulePackage.title} "${rulePackage.state}" ${JSON.stringify(rulePackage.facts)}`,
        );
        expect(plugin.state).toBe("Not allowed yet");
        expect(rulePackage.state).toBe("Not allowed yet");
        // Nothing of the add-ons runs while they wait.
        const webview = vscode().webview();
        expect(await badgeText(webview)).toBeNull();
        expect(await lintOverlayText(webview)).not.toContain("acme ");
        expect(await statusBarText()).toContain(BLOCKED_STATUS);
        return {
            allowedIn: {
                plugin: plugin.facts["Allowed in"] ?? "",
                rulePackage: rulePackage.facts["Allowed in"] ?? "",
            },
            addOns,
        };
    }

    /** A user's edit, so the editor lints again. */
    async function renameTask(taskId: string, name: string): Promise<void> {
        const webview = vscode().webview();
        await webview.locator(`.djs-shape[data-element-id="${taskId}"] > .djs-hit`).dblclick();
        const textBox = webview.locator(".djs-direct-editing-content");
        await textBox.waitFor({ state: "visible" });
        await textBox.fill(name);
        await page().keyboard.press("Enter");
        await textBox.waitFor({ state: "hidden" });
    }

    async function save(): Promise<void> {
        await page().keyboard.press(`${COMMAND_KEY}+s`);
        await expect.poll(() => vscode().isActiveTabDirty(), { timeout: TIMEOUT_MS }).toBe(false);
    }

    /** Markers in the window and in the editor's webview, which a reload of either drops. */
    async function markBeforeUpdate(): Promise<void> {
        await page().evaluate(() => {
            (globalThis as Record<string, unknown>).allowancePlaygroundMarker = "before update";
        });
        await vscode()
            .webview()
            .locator("body")
            .evaluate((body) => (body.dataset.allowancePlaygroundMarker = "before update"));
    }

    async function expectNoReload(where: string): Promise<void> {
        expect(
            await page().evaluate(
                () => (globalThis as Record<string, unknown>).allowancePlaygroundMarker,
            ),
            `${where}: the window reloaded`,
        ).toBe("before update");
        expect(
            await vscode()
                .webview()
                .locator("body")
                .getAttribute("data-allowance-playground-marker"),
            `${where}: the editor webview reloaded; an update should only lint again`,
        ).toBe("before update");
    }

    async function bumpPlayground(): Promise<{
        acme: { from: string; to: string };
        pnpm: { from: string; to: string };
    }> {
        const { stdout } = await runFile(process.execPath, [PLAYGROUND_SCRIPT, "bump", playground]);
        const versions = (folder: string) => {
            const match = new RegExp(
                `^${escapeRegExp(folder)}: ${RULE_PACKAGE} (\\S+) -> ([^,;\\s]+)`,
                "m",
            ).exec(stdout);
            if (!match) throw new Error(`bump printed no version change for ${folder}: ${stdout}`);
            return { from: match[1], to: match[2] };
        };
        const bumped = { acme: versions("acme/"), pnpm: versions("acme-worktrees/pnpm/") };
        log(`bump: ${JSON.stringify(bumped)}`);
        return bumped;
    }

    beforeAll(async () => {
        await rm(RESULTS_DIRECTORY, { recursive: true, force: true });
        await mkdir(RESULTS_DIRECTORY, { recursive: true });
        rootDirectory = await mkdtemp(join(tmpdir(), "bpmn-allowance-smoke-"));
        // "Allowed in" names realpaths; macOS' tmpdir lies behind the /var link.
        playground = join(await realpath(rootDirectory), "playground");
        const { stdout } = await runFile(process.execPath, [
            PLAYGROUND_SCRIPT,
            "create",
            playground,
        ]);
        await writeFile(join(RESULTS_DIRECTORY, "playground.txt"), stdout);
        log(`playground in ${playground}`);

        const manifest = JSON.parse(await readFile(join(DIST_DIRECTORY, "package.json"), "utf8"));
        extensionId = `${manifest.publisher}.${manifest.name}`.toLowerCase();
        extensionPath = await packExtension(DIST_DIRECTORY, rootDirectory);
        executablePath = await downloadVsCode(
            extensionPath,
            process.env.VSCODE_SMOKE_VERSION || undefined,
            log,
        );
    });

    afterEach(async ({ task }) => {
        const name = task.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 60);
        if (session) {
            const failed = task.result?.state === "fail";
            await saveEvidence(`${failed ? "failure-" : ""}${name}`, failed);
            await markLogsSeen();
        }
        await closeWindow();
    });

    afterAll(async () => {
        await closeWindow().catch((error: unknown) => log(String(error)));
        if (rootDirectory) {
            await cp(
                join(rootDirectory, "user-data", "logs"),
                join(RESULTS_DIRECTORY, "vscode-logs"),
                {
                    recursive: true,
                },
            ).catch(() => undefined);
            await rm(rootDirectory, { recursive: true, force: true });
        }
    });

    it(
        "row 1 acme/: asks about the plugin, then the rule package, and runs both once allowed",
        async () => {
            await openWindow("acme");
            await vscode().showInCustomEditor(DIAGRAM, diagramRendered);
            const { order, addOns } = await reviewBothNotices("acme");
            log(`acme: notices ${order.join(" then ")}`);
            const webview = vscode().webview();
            expect(await badgeText(webview)).toBeNull();
            expect(await lintOverlayText(webview)).not.toContain("acme ");

            const plugin = await allowInView(addOns, PLUGIN_NAME);
            log(`acme: plugin review ${JSON.stringify(plugin.facts)}; result "${plugin.status}"`);
            expect(plugin.facts["Allowed in"]).toBe(`every worktree of ${playground}/acme`);
            expect(plugin.status).toBe(
                `Allowed ${PLUGIN_NAME} in every worktree of its repository. Open editors reload with it.`,
            );

            const rulePackage = await allowInView(addOns, RULE_PACKAGE_ROW);
            log(
                `acme: ${rulePackage.title} review ${JSON.stringify(rulePackage.facts)}; result "${rulePackage.status}"`,
            );
            expect(rulePackage.title).toBe(`${RULE_PACKAGE}@1.0.0`);
            expect(rulePackage.facts["Allowed in"]).toBe(`every worktree of ${playground}/acme`);
            expect(rulePackage.status).toBe(
                `Allowed ${RULE_PACKAGE}@1.0.0 in every worktree of its repository. Open editors lint again with it.`,
            );

            await expectBadge("Hello badge v1", "acme: the badge never showed after Allow");
            await expectAcmeLint(
                "1.0.0",
                Object.values(TASKS),
                "acme: the acme 1.0.0 warnings never showed after Allow",
            );

            await vscode().runCommand("Focus on Problems View");
            const problems = page().locator(".markers-panel");
            for (const message of acmeMessages("1.0.0", Object.values(TASKS))) {
                await expect
                    .poll(() => problems.textContent(), {
                        timeout: TIMEOUT_MS,
                        message: `acme: the Problems panel lacks ${message}`,
                    })
                    .toContain(message);
            }
            expect(await statusBarText()).not.toMatch(ANY_BLOCKED_STATUS);
            // Review… answered both notices, and nothing may ask once both are allowed.
            const kept = await noticesInCenter();
            log(`acme: notification center after Allow: ${JSON.stringify(kept)}`);
            expect(kept.filter((text) => ANY_NOTICE.test(text))).toEqual([]);
            acmeAllowed = true;
        },
        SCENARIO_TIMEOUT_MS,
    );

    it(
        "row 2 acme-worktrees/feature/: a new window asks nothing and runs badge v1 and acme 1.0.0",
        async () => {
            requireAcmeAllowed();
            await expectAllowedWindow("acme-worktrees/feature", "Hello badge v1", "1.0.0");
            const rows = await addOnsViewRows();
            log(`feature: Add-ons rows ${JSON.stringify(rows)}`);
            expect(rows).toEqual([
                { title: PLUGIN_NAME, state: "" },
                { title: `${RULE_PACKAGE}@1.0.0`, state: "" },
            ]);
        },
        SCENARIO_TIMEOUT_MS,
    );

    it(
        "row 3 acme-worktrees/upgrade/: asks nothing and runs badge v2 and acme 2.0.0",
        async () => {
            requireAcmeAllowed();
            await expectAllowedWindow("acme-worktrees/upgrade", "Hello badge v2", "2.0.0");
            const rows = await addOnsViewRows();
            log(`upgrade: Add-ons rows ${JSON.stringify(rows)}`);
            expect(rows).toEqual([
                { title: PLUGIN_NAME, state: "" },
                { title: `${RULE_PACKAGE}@2.0.0`, state: "" },
            ]);
        },
        SCENARIO_TIMEOUT_MS,
    );

    it(
        "row 4 acme-worktrees/relative/: a worktree with relative paths asks nothing",
        async (context) => {
            const folders = await readdir(join(playground, "acme-worktrees"));
            context.skip(
                !folders.includes("relative"),
                "git older than 2.48 cannot add a worktree with --relative-paths",
            );
            requireAcmeAllowed();
            await expectAllowedWindow("acme-worktrees/relative", "Hello badge v1", "1.0.0");
        },
        SCENARIO_TIMEOUT_MS,
    );

    it(
        "row 5 acme-worktrees/pnpm/: runs each pnpm update without a notice or a reload, the old folder kept or removed",
        async () => {
            requireAcmeAllowed();
            const checkout = join(playground, "acme-worktrees/pnpm");
            await expectAllowedWindow("acme-worktrees/pnpm", "Hello badge v1", "1.0.0");
            await markBeforeUpdate();

            const kept = await bumpPlayground();
            expect(kept.pnpm).toEqual({ from: "1.0.0", to: "1.1.0" });
            const afterFirstEdit = [TASKS.check, "Pack the order", TASKS.ship];
            await renameTask(TASK_IDS.pack, afterFirstEdit[1]);
            await expectAcmeLint(
                kept.pnpm.to,
                afterFirstEdit,
                `pnpm: acme ${kept.pnpm.to} never linted after the update, the old folder kept`,
            );
            await expectNoReload("pnpm, old folder kept");

            // pnpm usually removes the folders the link no longer leads to.
            const removed = await bumpPlayground();
            expect(removed.pnpm).toEqual({ from: kept.pnpm.to, to: "1.2.0" });
            await rm(storeFolder(checkout, kept.pnpm.from), { recursive: true });
            await rm(storeFolder(checkout, kept.pnpm.to), { recursive: true });
            const afterSecondEdit = ["Check the stock", afterFirstEdit[1], TASKS.ship];
            await renameTask(TASK_IDS.check, afterSecondEdit[0]);
            await expectAcmeLint(
                removed.pnpm.to,
                afterSecondEdit,
                `pnpm: acme ${removed.pnpm.to} never linted after the update removed the old folders: refused until a reload?`,
            );
            await expectNoReload("pnpm, old folders removed");
            await expectNoNoticeFor(NO_NOTICE_WAIT_MS, "pnpm after both updates");
            await save();

            await vscode().runCommand("Refresh Add-ons");
            const rows = await addOnsViewRows();
            log(`pnpm: Add-ons rows after Refresh Add-ons ${JSON.stringify(rows)}`);
            expect(rows).toEqual([
                { title: PLUGIN_NAME, state: "" },
                { title: `${RULE_PACKAGE}@${removed.pnpm.to}`, state: "" },
            ]);
        },
        SCENARIO_TIMEOUT_MS,
    );

    it(
        "row 6 acme/ after bump: an update in place lints with the new version without a notice or a reload",
        async () => {
            requireAcmeAllowed();
            const installed = await installedVersion(
                join(playground, "acme/node_modules", RULE_PACKAGE),
            );
            await expectAllowedWindow("acme", "Hello badge v1", installed);
            await markBeforeUpdate();

            const bumped = await bumpPlayground();
            expect(bumped.acme.from).toBe(installed);
            const edited = [TASKS.check, TASKS.pack, "Ship the order"];
            await renameTask(TASK_IDS.ship, edited[2]);
            await expectAcmeLint(
                bumped.acme.to,
                edited,
                `acme: acme ${bumped.acme.to} never linted after its package.json was rewritten in place`,
            );
            await expectNoReload("acme after bump");
            await expectNoNoticeFor(NO_NOTICE_WAIT_MS, "acme after bump");
            await save();
        },
        SCENARIO_TIMEOUT_MS,
    );

    it(
        "row 7 acme-clone/: another clone asks",
        async () => {
            const { allowedIn } = await expectAskingWindow("acme-clone");
            expect(allowedIn).toEqual({
                plugin: `every worktree of ${playground}/acme-clone`,
                rulePackage: `every worktree of ${playground}/acme-clone`,
            });
        },
        SCENARIO_TIMEOUT_MS,
    );

    it(
        "row 8 other-repo/: another repository asks",
        async () => {
            const { allowedIn } = await expectAskingWindow("other-repo");
            expect(allowedIn).toEqual({
                plugin: `every worktree of ${playground}/other-repo`,
                rulePackage: `every worktree of ${playground}/other-repo`,
            });
        },
        SCENARIO_TIMEOUT_MS,
    );

    it(
        "row 9 no-git/: a folder outside git asks, and Allow covers this folder only",
        async () => {
            const { allowedIn, addOns } = await expectAskingWindow("no-git");
            expect(allowedIn).toEqual({
                plugin: "this folder only",
                rulePackage: "this folder only",
            });

            const plugin = await allowInView(addOns, PLUGIN_NAME);
            log(`no-git: plugin review "${plugin.review}"; result "${plugin.status}"`);
            expect(plugin.review).toContain(
                "Allowing it covers this folder, later changes included. Allow it only if you trust it.",
            );
            expect(plugin.status).toBe(`Allowed ${PLUGIN_NAME}. Open editors reload with it.`);
            const rulePackage = await allowInView(addOns, RULE_PACKAGE_ROW);
            expect(rulePackage.status).toBe(
                `Allowed ${RULE_PACKAGE}@1.0.0. Open editors lint again with it.`,
            );
            await expectBadge("Hello badge v1", "no-git: the badge never showed after Allow");
            await expectAcmeLint(
                "1.0.0",
                Object.values(TASKS),
                "no-git: the acme 1.0.0 warnings never showed after Allow",
            );
        },
        SCENARIO_TIMEOUT_MS,
    );

    it(
        "row 10 spoofed-worktree/: never counts as acme and asks",
        async () => {
            requireAcmeAllowed();
            const { allowedIn } = await expectAskingWindow("spoofed-worktree");
            expect(allowedIn).toEqual({
                plugin: "this folder only",
                rulePackage: "this folder only",
            });
        },
        SCENARIO_TIMEOUT_MS,
    );

    it(
        "row 11 linked-git/: a linked .git proves no repository and asks",
        async () => {
            requireAcmeAllowed();
            const { allowedIn } = await expectAskingWindow("linked-git");
            expect(allowedIn).toEqual({
                plugin: "this folder only",
                rulePackage: "this folder only",
            });
        },
        SCENARIO_TIMEOUT_MS,
    );

    // Last: it takes back what row 1 allowed.
    it(
        "row 13 Revoke in acme-worktrees/feature/: another worktree of acme asks again in a new window",
        async () => {
            requireAcmeAllowed();
            await openWindow("acme-worktrees/feature");
            await vscode().showInCustomEditor(DIAGRAM, diagramRendered);
            await expectBadge("Hello badge v1", "feature: the badge never showed before Revoke");
            await vscode().runCommand("Focus on Add-ons View");
            const addOns = await vscode().viewWebview(ADD_ONS_VIEW);
            expect(await revokeInView(addOns, PLUGIN_NAME)).toBe(
                `Revoked ${PLUGIN_NAME} in every worktree of its repository. Open editors reload without it.`,
            );
            expect(await revokeInView(addOns, RULE_PACKAGE_ROW)).toBe(
                `Revoked ${RULE_PACKAGE}@1.0.0 in every worktree of its repository. Code it already ran stays loaded until you reload the window.`,
            );
            acmeAllowed = false;
            await expect
                .poll(() => badgeText(vscode().webview()), {
                    timeout: TIMEOUT_MS,
                    message: "feature: the editor kept the badge after Revoke",
                })
                .toBeNull();
            await closeWindowWithEvidence("row-13-feature-after-revoke");

            const { allowedIn } = await expectAskingWindow("acme-worktrees/upgrade");
            expect(allowedIn).toEqual({
                plugin: `every worktree of ${playground}/acme`,
                rulePackage: `every worktree of ${playground}/acme`,
            });
        },
        SCENARIO_TIMEOUT_MS,
    );
});
