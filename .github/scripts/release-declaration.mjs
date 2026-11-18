// Reads the "Ships in" section of a PR body: the release lines its author
// ticks, each with an optional changelog wording. Only what a reader sees on
// GitHub counts, so boxes in HTML comments and code do not. Whether the boxes
// fit the title and the files is decided in release-routing.mjs.

/** The Ships in box for a change no released user gets. */
export const NO_LINE = "none";

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HTML_COMMENT_BLOCK = /^ {0,3}<!--/;
const INDENTED = /^(?: {4}|\t)/;
const LIST_ITEM = /^\s*(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;
const HEADING = /^ {0,3}#{1,6}(?:\s|$)/;
const SECTION_HEADING = /^ {0,3}#{1,6}\s+ships in\s*:?\s*#*\s*$/i;
const CHECKBOX = /^\s*(?:[-*+]|\d{1,9}[.)])\s+\[([ xX])\]\s*(.*)$/;
const BOX_ITEM = /^`?(?<id>[A-Za-z0-9][\w.-]*)`?(?:\s+as\s+`(?<wording>[^`]*)`)?(?<rest>.*)$/;
const UNQUOTED_WORDING = /^\s+as(?:\s|$)/;

function choiceList(ids) {
    const codes = ids.map((id) => `\`${id}\``);
    return `${codes.slice(0, -1).join(", ")} or ${codes.at(-1)}`;
}

/** A line without its closed inline HTML comments; code spans stay as written. */
function withoutInlineComments(line) {
    let visible = "";
    let index = 0;
    while (index < line.length) {
        const ticks = /^`+/.exec(line.slice(index))?.[0];
        if (ticks !== undefined) {
            const closing = [...line.slice(index + ticks.length).matchAll(/`+/g)].find(
                ([run]) => run.length === ticks.length,
            );
            const end =
                closing === undefined
                    ? index + ticks.length
                    : index + ticks.length + closing.index + ticks.length;
            visible += line.slice(index, end);
            index = end;
        } else if (line.startsWith("<!--", index)) {
            const close = line.indexOf("-->", index + 4);
            // An unclosed `<!--` inside a line is text on GitHub.
            if (close === -1) visible += "<!--";
            index = close === -1 ? index + 4 : close + 3;
        } else {
            visible += line[index++];
        }
    }
    return visible;
}

/**
 * The body's lines a reader sees: no fenced or indented code, no HTML comment.
 * Code goes first, because a `<!--` inside it is text. A comment that opens a
 * line hides everything up to its `-->`, to the end when there is none.
 */
function visibleLines(body) {
    const visible = [];
    let fence;
    let inComment = false;
    let inIndentedCode = false;
    let inList = false;
    let blockStart = true;
    for (const line of (body ?? "").replace(/\r\n?/g, "\n").split("\n")) {
        const blank = line.trim() === "";
        if (fence !== undefined) {
            const marker = FENCE.exec(line)?.[1];
            if (marker?.[0] === fence[0] && marker.length >= fence.length) fence = undefined;
            blockStart = true;
            continue;
        }
        if (inComment) {
            inComment = !line.includes("-->");
            blockStart = true;
            continue;
        }
        if (inIndentedCode && (blank || INDENTED.test(line))) continue;
        inIndentedCode = false;
        if (!blank && blockStart && !inList && INDENTED.test(line)) {
            inIndentedCode = true;
            continue;
        }
        const marker = FENCE.exec(line)?.[1];
        if (marker !== undefined) {
            fence = marker;
            continue;
        }
        if (HTML_COMMENT_BLOCK.test(line)) {
            inComment = !line.slice(line.indexOf("<!--") + 4).includes("-->");
            blockStart = true;
            continue;
        }
        if (blank) {
            blockStart = true;
        } else {
            if (HEADING.test(line)) inList = false;
            else if (LIST_ITEM.test(line)) inList = true;
            // A paragraph after a blank line ends the list.
            else if (blockStart && !INDENTED.test(line)) inList = false;
            blockStart = HEADING.test(line);
        }
        visible.push(withoutInlineComments(line));
    }
    return visible;
}

function shipsInSections(body) {
    const lines = visibleLines(body);
    const starts = lines.flatMap((line, index) => (SECTION_HEADING.test(line) ? [index] : []));
    if (starts.length === 0) return { count: 0, section: undefined };
    const next = lines.findIndex((line, index) => index > starts[0] && HEADING.test(line));
    return {
        count: starts.length,
        section: lines.slice(starts[0] + 1, next === -1 ? undefined : next),
    };
}

/** The lines a PR body ticks under "Ships in", with each line's own wording. */
export function parseShipsIn(body, registry) {
    const { count, section } = shipsInSections(body);
    const declaration = { found: count > 0, none: false, wording: {}, errors: [] };
    if (count > 1) declaration.errors.push(`The body has ${count} Ships in sections; keep one.`);
    const ids = registry.lines.map(({ id }) => id);
    const ticked = new Set();
    for (const line of section ?? []) {
        const box = CHECKBOX.exec(line);
        if (box === null || box[1] === " ") continue;
        const item = BOX_ITEM.exec(box[2])?.groups;
        if (item === undefined) {
            declaration.errors.push(
                `The ticked box \`${line.trim()}\` under Ships in names no line; write it as - [x] \`<line id>\`.`,
            );
        } else if (ticked.has(item.id) || (item.id === NO_LINE && declaration.none)) {
            declaration.errors.push(`\`${item.id}\` is ticked twice under Ships in; keep one box.`);
        } else if (item.id === NO_LINE) {
            declaration.none = true;
        } else if (!ids.includes(item.id)) {
            declaration.errors.push(
                `\`${item.id}\` under Ships in is no release line; tick one of ${choiceList([...ids, NO_LINE])}.`,
            );
        } else {
            ticked.add(item.id);
            if (item.wording !== undefined) declaration.wording[item.id] = item.wording;
            else if (UNQUOTED_WORDING.test(item.rest)) {
                declaration.errors.push(
                    `The wording of \`${item.id}\` under Ships in needs backticks: - [x] \`${item.id}\` as \`fix(<scope>): <subject>\`.`,
                );
            }
        }
    }
    return { ...declaration, lines: ids.filter((id) => ticked.has(id)) };
}

/** Whether the PR body says where the change ships: a ticked line or `none`. */
export function isDeclared(declaration) {
    return declaration.lines.length > 0 || declaration.none;
}

/** A "Ships in" block with the given lines ticked, `none` unticked. */
export function shipsInBlock(tickedIds, registry) {
    return [
        "## Ships in",
        "",
        ...registry.lines.map(({ id }) => `- [${tickedIds.includes(id) ? "x" : " "}] \`${id}\``),
        `- [ ] \`${NO_LINE}\``,
        "",
    ].join("\n");
}
