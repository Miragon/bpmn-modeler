// Validates a PR's title, "Ships in" boxes and changed files against the
// release routing, for the "Validate release lines" job and the Claude Code
// hook. Each error says what to do. Pure: the PR arrives as data.
import { isDeclared, NO_LINE, parseShipsIn } from "./release-declaration.mjs";
import {
    breakingLinesOf,
    derivedLines,
    isAttributedSubject,
    isAttributedType,
    isBreaking,
    releaseBranchOf,
    suggest,
} from "./release-routing.mjs";

/** release-please runs on main only, so its release PR always targets main. */
const RELEASE_TARGET = "main";

function codeList(ids) {
    return ids.map((id) => `\`${id}\``).join(", ");
}

/** A feat or fix whose files reach two or more lines must tick its lines or `none`. */
export function needsDeclaration({ title, files, body }, registry) {
    return (
        isAttributedType(title) &&
        !isDeclared(parseShipsIn(body, registry)) &&
        derivedLines(files, registry).length >= 2
    );
}

function undeclaredError(title, files, registry) {
    const [type] = /^[a-z]+/.exec(title);
    return [
        `This ${type} reaches ${codeList(derivedLines(files, registry))} by its files, so the PR must say which of them ships it.`,
        'Replace the body\'s "Ships in" section with this block and tick only the lines whose users get the change, judged by wiring (the question after each line: does that line offer the feature?), not by the files it bundles.',
        `Tick \`${NO_LINE}\` when no released user gets it, such as a fix to a feature no release shipped yet.`,
        "",
        suggest({ files, registry }),
    ].join("\n");
}

function declarationErrors(declaration, shipped) {
    const errors = [...declaration.errors];
    if (declaration.none && declaration.lines.length > 0) {
        errors.push(
            `\`${NO_LINE}\` is ticked together with ${codeList(declaration.lines)} under Ships in; tick either \`${NO_LINE}\` or the lines.`,
        );
    }
    for (const id of declaration.lines.filter((line) => !shipped.includes(line))) {
        errors.push(
            `\`${id}\` is ticked under Ships in, but it ships none of the changed files; untick it.`,
        );
    }
    return errors;
}

function wordingError(id, wording, breakingLine) {
    if (!isAttributedSubject(wording)) {
        return `The wording of \`${id}\` under Ships in, \`${wording}\`, is no feat or fix subject; write it as \`fix(<scope>): <subject>\` or \`feat(<scope>): <subject>\`.`;
    }
    if (isBreaking(wording) && !breakingLine) {
        return `The wording of \`${id}\` under Ships in has a breaking \`!\`, but a line takes \`!\` only from a breaking title whose files hit its breaking globs; drop the \`!\`.`;
    }
    if (!isBreaking(wording) && breakingLine) {
        return `The wording of \`${id}\` under Ships in has no \`!\`, but the breaking title applies to that line (its breaking globs); mark the wording breaking too.`;
    }
    return undefined;
}

function wordingErrors({ title, files, registry }, declaration) {
    const breaking = breakingLinesOf(title, files, registry);
    return Object.entries(declaration.wording)
        .map(([id, wording]) => wordingError(id, wording, breaking.includes(id)))
        .filter((error) => error !== undefined);
}

function attributedErrors({ title, files, body, registry }, declaration) {
    if (needsDeclaration({ title, files, body }, registry)) {
        return [undeclaredError(title, files, registry)];
    }
    if (!isAttributedType(title) || !isDeclared(declaration)) return [];
    return breakingLinesOf(title, files, registry)
        .filter((id) => !declaration.lines.includes(id))
        .map(
            (id) =>
                `The breaking change touches what \`${id}\` guarantees (its breaking globs); tick \`${id}\` under Ships in.`,
        );
}

/**
 * The release/** files a PR may not change: only the sync workflow and the
 * release PR write a line's folder. A folder of a line the registry does not
 * have yet is free, because the PR that adds a line creates it.
 */
function forbiddenReleaseEdits({ files, registry, headBranch, fromFork }) {
    if (headBranch === releaseBranchOf(RELEASE_TARGET) && fromFork !== true) return [];
    const lineFolders = registry.lines.map(({ componentPath }) => `${componentPath}/`);
    return files.filter(
        (file) =>
            lineFolders.some((folder) => file.startsWith(folder)) || /^release\/[^/]+$/.test(file),
    );
}

/** What is wrong with a PR's title, body and files for the release routing, each with what to do. */
export function validate(pullRequest) {
    const { body, files, registry } = pullRequest;
    const edited = forbiddenReleaseEdits(pullRequest);
    const declaration = parseShipsIn(body, registry);
    const shipped = derivedLines(files, registry);
    return [
        ...(edited.length > 0
            ? [
                  `This PR changes ${edited.join(", ")}; only the sync workflow and the release PR write release/**. Revert the change.`,
              ]
            : []),
        ...declarationErrors(declaration, shipped),
        ...wordingErrors(pullRequest, declaration),
        ...attributedErrors(pullRequest, declaration),
    ];
}
