#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATE_DIR = fileURLToPath(new URL("./template/", import.meta.url));
const REPOSITORY_TEMPLATE = path.join(TEMPLATE_DIR, "repo");
const RULE_PACKAGE_TEMPLATE = path.join(TEMPLATE_DIR, "bpmnlint-plugin-acme");
const RULE_PACKAGE_NAME = "bpmnlint-plugin-acme";
const PLUGIN_SCRIPT = ".camunda/plugins/hello-badge/plugin.js";
const MARKER_FILE = ".allowance-playground";
const GUIDE = "resources/allowance-playground/README.md";
const DEFAULT_TARGET = path.join(os.homedir(), "bpmn-allowance-playground");
const RELATIVE_WORKTREES_SINCE = [2, 48];
const USAGE = `Usage:
  node resources/allowance-playground/create-playground.mjs [create] [target] [--force]
  node resources/allowance-playground/create-playground.mjs bump [target]

target defaults to ${DEFAULT_TARGET}.
create refuses a non-empty target; --force rebuilds one that an earlier run created.
bump updates ${RULE_PACKAGE_NAME} in acme/ and in acme-worktrees/pnpm/ to the next minor version.`;

const SCENARIOS = [
    {
        folder: "acme",
        what: "The main repository: one commit, branches feature, upgrade, pnpm and relative.",
        steps: [
            "Open order.bpmn. Two notices ask, one for the plugin and one for the rule package, one after the other: the second appears once you answered the first.",
            "Click Review... on the first and Allow in the Add-ons view, then the same on the second.",
        ],
        expected:
            "Asks once per add-on. After Allow: badge 'Hello badge v1', warnings 'acme 1.0.0: task \"...\" found', Allowed in: every worktree of <playground>/acme.",
    },
    {
        folder: "acme-worktrees/feature",
        what: "git worktree add on branch feature, rule package 1.0.0.",
        steps: ["Open order.bpmn after allowing both add-ons in acme/."],
        expected:
            "No question. Badge v1, lint messages say acme 1.0.0, both add-ons Allowed with Revoke. The view shows no Allowed in here: only the review of an add-on not allowed yet has it.",
    },
    {
        folder: "acme-worktrees/upgrade",
        what: "git worktree add on branch upgrade; a commit changes the badge to v2, node_modules holds the rule package 2.0.0.",
        steps: ["Open order.bpmn after allowing both add-ons in acme/."],
        expected:
            "No question. Badge 'Hello badge v2', lint messages say acme 2.0.0, the Add-ons view lists bpmnlint-plugin-acme@2.0.0 as Allowed.",
    },
    {
        folder: "acme-worktrees/relative",
        what: "git worktree add --relative-paths: the .git file and the admin folder's gitdir hold relative paths.",
        steps: ["Open order.bpmn after allowing both add-ons in acme/."],
        expected: "No question, as in acme-worktrees/feature.",
        needsRelativeWorktrees: true,
    },
    {
        folder: "acme-worktrees/pnpm",
        what: "A worktree whose node_modules has the pnpm layout: node_modules/bpmnlint-plugin-acme links into node_modules/.pnpm/.",
        steps: [
            "Open order.bpmn after allowing both add-ons in acme/.",
            "Keep it open, run the bump command, then edit the diagram (move a task) to lint again.",
            "Optionally delete the old node_modules/.pnpm/bpmnlint-plugin-acme@<old> folder, as pnpm does, and lint again.",
        ],
        expected:
            "No question. After bump the lint messages show the new version without a question and without a window reload, the old folder kept or deleted; Refresh Add-ons lists the new name@version.",
    },
    {
        folder: "acme-clone",
        what: "git clone of acme: another clone has its own git directory.",
        steps: ["Open order.bpmn after allowing both add-ons in acme/."],
        expected:
            "Asks once per add-on (another clone). Allowed in: every worktree of <playground>/acme-clone.",
    },
    {
        folder: "other-repo",
        what: "A separate repository with the same plugin and rule package.",
        steps: ["Open order.bpmn."],
        expected: "Asks once per add-on (another repository).",
    },
    {
        folder: "no-git",
        what: "The same files in a plain folder without git.",
        steps: ["Open order.bpmn."],
        expected:
            "Asks once per add-on. Allowed in: this folder only; the result says 'Allowed Hello badge.' without 'in every worktree of its repository'.",
    },
    {
        folder: "spoofed-worktree",
        what: "A plain folder whose .git FILE names acme's admin folder of the feature worktree. Do not run git commands here.",
        steps: ["Open order.bpmn after allowing both add-ons in acme/."],
        expected:
            "Asks, although acme/ is allowed: it must never count as acme. Allowed in: this folder only.",
    },
    {
        folder: "linked-git",
        what: "A plain folder whose .git is a directory link to acme/.git. Do not run git commands here.",
        steps: ["Open order.bpmn after allowing both add-ons in acme/."],
        expected:
            "Asks, although acme/ is allowed: a linked .git proves no repository. Allowed in: this folder only.",
    },
    {
        folder: "two-worktrees.code-workspace",
        what: "A multi-root workspace with acme/ and acme-worktrees/feature/ (VS Code).",
        steps: [
            "Revoke both add-ons first, then open the workspace file and order.bpmn in both folders.",
        ],
        expected: "One notice per add-on that counts 1, not 2; one Allow covers both folders.",
        isFile: true,
    },
];

function parseArguments(argv) {
    const flags = argv.filter((argument) => argument.startsWith("--"));
    const positional = argv.filter((argument) => !argument.startsWith("--"));
    const command = ["create", "bump"].includes(positional[0]) ? positional.shift() : "create";
    const unknownFlags = flags.filter((flag) => !["--force", "--help"].includes(flag));
    if (unknownFlags.length > 0 || positional.length > 1) {
        fail(`Unexpected arguments: ${[...unknownFlags, ...positional.slice(1)].join(" ")}`);
    }
    return {
        command,
        target: path.resolve(positional[0] ?? DEFAULT_TARGET),
        force: flags.includes("--force"),
        help: flags.includes("--help"),
    };
}

function fail(message) {
    console.error(`${message}\n\n${USAGE}`);
    process.exit(1);
}

function isGitEntry(folder) {
    try {
        fs.lstatSync(path.join(folder, ".git"));
        return true;
    } catch {
        return false;
    }
}

function nearestExistingFolder(folder) {
    let current = folder;
    while (!fs.existsSync(current)) {
        current = path.dirname(current);
    }
    return fs.realpathSync(current);
}

/** A `.git` above the target would claim no-git/ and the others as its own. */
function enclosingGitFolder(target) {
    for (let folder = nearestExistingFolder(target); ; folder = path.dirname(folder)) {
        if (isGitEntry(folder)) {
            return folder;
        }
        if (path.dirname(folder) === folder) {
            return undefined;
        }
    }
}

function prepareTarget(target, force) {
    const enclosing = enclosingGitFolder(target);
    if (enclosing !== undefined) {
        fail(
            `${target} lies inside the git work tree ${enclosing}. Pick a target outside every repository.`,
        );
    }
    if (fs.existsSync(target)) {
        if (!fs.statSync(target).isDirectory()) {
            fail(`${target} exists and is not a folder.`);
        }
        if (fs.readdirSync(target).length > 0) {
            if (!fs.existsSync(path.join(target, MARKER_FILE))) {
                fail(
                    `${target} is not empty and was not created by this script. Nothing was changed.`,
                );
            }
            if (!force) {
                fail(
                    `${target} already holds a playground. Pass --force to delete and rebuild it.`,
                );
            }
            fs.rmSync(target, { recursive: true, force: true });
        }
    }
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(
        path.join(target, MARKER_FILE),
        "Created by create-playground.mjs; --force may delete this folder.\n",
    );
    return fs.realpathSync(target);
}

/** Runs git without the user's config, so signing, hooks and templates cannot interfere. */
function hermeticGit(target) {
    const configDir = path.join(target, ".playground");
    fs.mkdirSync(configDir, { recursive: true });
    const globalConfig = path.join(configDir, "gitconfig");
    fs.writeFileSync(globalConfig, "");
    const inherited = Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"));
    const env = {
        ...Object.fromEntries(inherited),
        GIT_CONFIG_GLOBAL: globalConfig,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_TERMINAL_PROMPT: "0",
        GIT_AUTHOR_NAME: "Allowance Playground",
        GIT_AUTHOR_EMAIL: "playground@example.invalid",
        GIT_COMMITTER_NAME: "Allowance Playground",
        GIT_COMMITTER_EMAIL: "playground@example.invalid",
    };
    return (cwd, ...args) =>
        execFileSync(
            "git",
            ["-c", "init.defaultBranch=main", "-c", "core.autocrlf=false", ...args],
            {
                cwd,
                env,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"],
            },
        ).trim();
}

function gitVersionOf(git, cwd) {
    const match = /(\d+)\.(\d+)/.exec(git(cwd, "--version"));
    return match === null ? [0, 0] : [Number(match[1]), Number(match[2])];
}

function isAtLeast([major, minor], [wantedMajor, wantedMinor]) {
    return major > wantedMajor || (major === wantedMajor && minor >= wantedMinor);
}

function copyTree(source, destination) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const from = path.join(source, entry.name);
        const to = path.join(destination, entry.name);
        if (entry.isDirectory()) {
            copyTree(from, to);
        } else {
            fs.copyFileSync(from, to);
        }
    }
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
    fs.writeFileSync(file, `${JSON.stringify(value, null, 4)}\n`);
}

function packageVersionOf(packageDir) {
    return readJson(path.join(packageDir, "package.json")).version;
}

function setPackageVersion(packageDir, version) {
    const manifestPath = path.join(packageDir, "package.json");
    writeJson(manifestPath, { ...readJson(manifestPath), version });
}

function nextMinorOf(version) {
    const match = /^(\d+)\.(\d+)\.\d+/.exec(version);
    if (match === null) {
        throw new Error(`Cannot bump the version "${version}".`);
    }
    return `${match[1]}.${Number(match[2]) + 1}.0`;
}

function copyRulePackage(source, destination, version) {
    copyTree(source, destination);
    setPackageVersion(destination, version);
}

/** What `npm install` leaves: a real folder in node_modules. */
function installHoisted(checkout, version) {
    copyRulePackage(
        RULE_PACKAGE_TEMPLATE,
        path.join(checkout, "node_modules", RULE_PACKAGE_NAME),
        version,
    );
}

function pnpmStoreFolder(checkout, version) {
    return path.join(
        checkout,
        "node_modules",
        ".pnpm",
        `${RULE_PACKAGE_NAME}@${version}`,
        "node_modules",
        RULE_PACKAGE_NAME,
    );
}

/** A junction on Windows needs no admin rights; it must name an absolute target. */
function linkFolder(linkPath, targetFolder) {
    if (process.platform === "win32") {
        fs.symlinkSync(targetFolder, linkPath, "junction");
    } else {
        fs.symlinkSync(path.relative(path.dirname(linkPath), targetFolder), linkPath, "dir");
    }
}

function installPnpm(checkout, version, source = RULE_PACKAGE_TEMPLATE) {
    const store = pnpmStoreFolder(checkout, version);
    fs.rmSync(store, { recursive: true, force: true });
    copyRulePackage(source, store, version);
    const link = path.join(checkout, "node_modules", RULE_PACKAGE_NAME);
    fs.rmSync(link, { force: true });
    linkFolder(link, store);
}

function scenarioOf(folder) {
    return SCENARIOS.find((scenario) => scenario.folder === folder);
}

function readmeTextOf(root, scenario) {
    const text = [
        `${scenario.folder}/`,
        "",
        scenario.what,
        "",
        "What to do:",
        ...scenario.steps.map((step) => `- ${step}`),
        "",
        `Expected: ${scenario.expected}`,
        "",
        `Checklist and set-up: ${GUIDE} in the bpmn-modeler repository.`,
        "",
    ].join("\n");
    return withPlayground(root, text);
}

function withPlayground(root, text) {
    return text.replaceAll("<playground>", root);
}

function writeReadme(target, folder) {
    fs.writeFileSync(
        path.join(target, folder, "README.txt"),
        readmeTextOf(target, scenarioOf(folder)),
    );
}

/** Only main checkouts come here; their exclude file covers every worktree of the repository. */
function ignoreReadme(checkout) {
    const exclude = path.join(checkout, ".git", "info", "exclude");
    fs.mkdirSync(path.dirname(exclude), { recursive: true });
    fs.appendFileSync(exclude, "/README.txt\n");
}

function createRepository(git, checkout, message) {
    copyTree(REPOSITORY_TEMPLATE, checkout);
    git(checkout, "init", "--quiet");
    git(checkout, "add", "--all");
    git(checkout, "commit", "--quiet", "--message", message);
    ignoreReadme(checkout);
}

function addWorktree(git, target, branch, extraArguments = []) {
    const worktree = path.join(target, "acme-worktrees", branch);
    git(
        path.join(target, "acme"),
        "worktree",
        "add",
        "--quiet",
        ...extraArguments,
        worktree,
        branch,
    );
    return worktree;
}

function commitUpgrade(git, worktree) {
    const scriptPath = path.join(worktree, PLUGIN_SCRIPT);
    fs.writeFileSync(
        scriptPath,
        fs.readFileSync(scriptPath, "utf8").replace("Hello badge v1", "Hello badge v2"),
    );
    const manifestPath = path.join(worktree, "package.json");
    const manifest = readJson(manifestPath);
    writeJson(manifestPath, {
        ...manifest,
        devDependencies: { ...manifest.devDependencies, [RULE_PACKAGE_NAME]: "2.0.0" },
    });
    git(
        worktree,
        "commit",
        "--quiet",
        "--all",
        "--message",
        "Upgrade the badge to v2 and bpmnlint-plugin-acme to 2.0.0",
    );
}

function plainCopy(target, folder) {
    const checkout = path.join(target, folder);
    copyTree(REPOSITORY_TEMPLATE, checkout);
    installHoisted(checkout, "1.0.0");
    return checkout;
}

function create(target, force) {
    const root = prepareTarget(target, force);
    const git = hermeticGit(root);
    const version = gitVersionOf(git, root);
    const supportsRelative = isAtLeast(version, RELATIVE_WORKTREES_SINCE);
    const built = [];
    const notes = [];

    const acme = path.join(root, "acme");
    createRepository(
        git,
        acme,
        "Add the order process, the hello-badge plugin and the acme lint config",
    );
    const branches = ["feature", "upgrade", "pnpm", ...(supportsRelative ? ["relative"] : [])];
    for (const branch of branches) {
        git(acme, "branch", branch);
    }
    installHoisted(acme, "1.0.0");
    built.push("acme");

    installHoisted(addWorktree(git, root, "feature"), "1.0.0");
    built.push("acme-worktrees/feature");

    const upgrade = addWorktree(git, root, "upgrade");
    commitUpgrade(git, upgrade);
    installHoisted(upgrade, "2.0.0");
    built.push("acme-worktrees/upgrade");

    if (supportsRelative) {
        installHoisted(addWorktree(git, root, "relative", ["--relative-paths"]), "1.0.0");
        built.push("acme-worktrees/relative");
    } else {
        notes.push(
            `acme-worktrees/relative skipped: git ${version.join(".")} has no --relative-paths (needs ${RELATIVE_WORKTREES_SINCE.join(".")} or later).`,
        );
    }

    installPnpm(addWorktree(git, root, "pnpm"), "1.0.0");
    built.push("acme-worktrees/pnpm");

    const clone = path.join(root, "acme-clone");
    git(root, "clone", "--quiet", acme, clone);
    ignoreReadme(clone);
    installHoisted(clone, "1.0.0");
    built.push("acme-clone");

    const otherRepo = path.join(root, "other-repo");
    createRepository(git, otherRepo, "Add the same order process, plugin and lint config");
    installHoisted(otherRepo, "1.0.0");
    built.push("other-repo");

    plainCopy(root, "no-git");
    built.push("no-git");

    const featureDotGit = fs.readFileSync(
        path.join(root, "acme-worktrees", "feature", ".git"),
        "utf8",
    );
    fs.writeFileSync(path.join(plainCopy(root, "spoofed-worktree"), ".git"), featureDotGit);
    built.push("spoofed-worktree");

    linkFolder(path.join(plainCopy(root, "linked-git"), ".git"), path.join(acme, ".git"));
    built.push("linked-git");

    writeJson(path.join(root, "two-worktrees.code-workspace"), {
        folders: [{ path: "acme" }, { path: "acme-worktrees/feature" }],
    });
    built.push("two-worktrees.code-workspace");

    for (const folder of built.filter((each) => !scenarioOf(each).isFile)) {
        writeReadme(root, folder);
    }
    const summary = summaryOf(root, built, notes);
    fs.writeFileSync(path.join(root, "README.txt"), `${summary}\n`);
    console.log(summary);
    console.log(`\ngit worktree list (acme):\n${git(acme, "worktree", "list")}`);
}

function summaryOf(root, built, notes) {
    const lines = [`Allowance playground in ${root}`, ""];
    built.forEach((folder, index) => {
        lines.push(
            `${String(index + 1).padStart(2)}. ${folder}${scenarioOf(folder).isFile ? "" : "/"}`,
        );
        lines.push(`    ${scenarioOf(folder).expected}`);
    });
    if (notes.length > 0) {
        lines.push("", ...notes);
    }
    lines.push(
        "",
        `Allow both add-ons in acme/ first; the expectations above assume it.`,
        `Simulate an update with: node resources/allowance-playground/create-playground.mjs bump ${root}`,
        `Checklist, clean VS Code profile, IntelliJ and the migration test: ${GUIDE}`,
    );
    return withPlayground(root, lines.join("\n"));
}

function bump(target) {
    if (!fs.existsSync(path.join(target, MARKER_FILE))) {
        fail(`${target} holds no playground. Run create first.`);
    }
    const root = fs.realpathSync(target);

    const acmePackage = path.join(root, "acme", "node_modules", RULE_PACKAGE_NAME);
    const acmeFrom = packageVersionOf(acmePackage);
    const acmeTo = nextMinorOf(acmeFrom);
    setPackageVersion(acmePackage, acmeTo);
    console.log(`acme/: ${RULE_PACKAGE_NAME} ${acmeFrom} -> ${acmeTo}, in place.`);

    const pnpmCheckout = path.join(root, "acme-worktrees", "pnpm");
    const currentStore = fs.realpathSync(
        path.join(pnpmCheckout, "node_modules", RULE_PACKAGE_NAME),
    );
    const pnpmFrom = packageVersionOf(currentStore);
    const pnpmTo = nextMinorOf(pnpmFrom);
    installPnpm(pnpmCheckout, pnpmTo, currentStore);
    console.log(
        `acme-worktrees/pnpm/: ${RULE_PACKAGE_NAME} ${pnpmFrom} -> ${pnpmTo}; node_modules/${RULE_PACKAGE_NAME} now links to ${path.relative(pnpmCheckout, pnpmStoreFolder(pnpmCheckout, pnpmTo))}, the ${pnpmFrom} folder stays. Delete ${path.relative(pnpmCheckout, path.dirname(path.dirname(currentStore)))} to try what pnpm usually does.`,
    );
    console.log(
        `\nEdit a diagram in either folder to lint again: the warnings name the new version without a question or a reload, the old pnpm folder kept or deleted. Only a pnpm update that moves the package's entry or a rule file needs a window reload or an IDE restart. Click Refresh Add-ons to see the new name@version in the view.`,
    );
}

const { command, target, force, help } = parseArguments(process.argv.slice(2));
if (help) {
    console.log(USAGE);
} else if (command === "bump") {
    bump(target);
} else {
    create(target, force);
}
