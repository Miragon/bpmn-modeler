import { Lexer, type Token, type Tokens } from "marked";

import { el } from "./dom";

/** A README sits below the detail's h2 name and h3 section heading. */
const FIRST_HEADING_LEVEL = 4;

const SAFE_LINK = /^(https?:|mailto:)/i;

/**
 * A README as DOM nodes built from marked's tokens, never from HTML: a README
 * is workspace text, so raw HTML in it is dropped, an image shows its alt
 * text, and only an absolute web or mail link stays a link.
 */
export function markdownOf(markdown: string): HTMLElement {
    const root = el("div", "av-md");
    root.append(...blocksOf(Lexer.lex(markdown, { gfm: true })));
    return root;
}

function blocksOf(tokens: readonly Token[]): Node[] {
    return tokens.flatMap((token) => blockOf(token));
}

function blockOf(token: Token): Node[] {
    switch (token.type) {
        case "heading": {
            const { depth, tokens } = token as Tokens.Heading;
            const level = Math.min(6, depth + FIRST_HEADING_LEVEL - 1);
            const heading = el(`h${level}` as "h4", `av-md-h av-md-h${Math.min(depth, 3)}`);
            heading.append(...inlineOf(tokens));
            return [heading];
        }
        case "paragraph": {
            const paragraph = el("p");
            paragraph.append(...inlineOf((token as Tokens.Paragraph).tokens));
            return [paragraph];
        }
        case "text": {
            const { tokens, text } = token as Tokens.Text;
            return tokens === undefined ? [document.createTextNode(text)] : inlineOf(tokens);
        }
        case "code": {
            const pre = el("pre", "av-md-pre");
            pre.append(el("code", "", (token as Tokens.Code).text));
            return [pre];
        }
        case "blockquote": {
            const quote = el("blockquote");
            quote.append(...blocksOf((token as Tokens.Blockquote).tokens));
            return [quote];
        }
        case "list":
            return [listOf(token as Tokens.List)];
        case "table":
            return [tableOf(token as Tokens.Table)];
        case "hr":
            return [el("hr")];
        default:
            // html, def and space carry nothing a README reader needs here.
            return [];
    }
}

function listOf({ ordered, start, items }: Tokens.List): HTMLElement {
    const list = ordered ? el("ol") : el("ul");
    if (ordered && typeof start === "number" && start !== 1) list.setAttribute("start", String(start));
    list.append(
        ...items.map(({ task, checked, tokens }) => {
            const item = el("li");
            if (task) {
                const box = el("input", "av-md-task");
                box.type = "checkbox";
                box.checked = checked === true;
                box.disabled = true;
                item.append(box);
            }
            // A task item's first text token repeats its checkbox as "[ ] ".
            item.append(...blocksOf(tokens.filter((each) => each.type !== "checkbox")));
            return item;
        }),
    );
    return list;
}

function tableOf({ header, rows, align }: Tokens.Table): HTMLElement {
    const wrap = el("div", "av-md-table");
    const table = el("table");
    const cellOf = (tag: "th" | "td", cell: Tokens.TableCell, index: number) => {
        const created = el(tag);
        const alignment = align[index];
        if (alignment) created.style.textAlign = alignment;
        created.append(...inlineOf(cell.tokens));
        return created;
    };
    const head = el("thead");
    const headRow = el("tr");
    headRow.append(...header.map((cell, index) => cellOf("th", cell, index)));
    head.append(headRow);
    const body = el("tbody");
    body.append(
        ...rows.map((row) => {
            const line = el("tr");
            line.append(...row.map((cell, index) => cellOf("td", cell, index)));
            return line;
        }),
    );
    table.append(head, body);
    wrap.append(table);
    return wrap;
}

function inlineOf(tokens: readonly Token[]): Node[] {
    return tokens.flatMap((token) => inlineNodeOf(token));
}

function inlineNodeOf(token: Token): Node[] {
    switch (token.type) {
        case "text": {
            const { tokens, text } = token as Tokens.Text;
            return tokens === undefined ? [document.createTextNode(text)] : inlineOf(tokens);
        }
        case "escape":
            return [document.createTextNode((token as Tokens.Escape).text)];
        case "strong":
            return [wrapped("strong", (token as Tokens.Strong).tokens)];
        case "em":
            return [wrapped("em", (token as Tokens.Em).tokens)];
        case "del":
            return [wrapped("del", (token as Tokens.Del).tokens)];
        case "codespan":
            return [el("code", "av-md-code", (token as Tokens.Codespan).text)];
        case "br":
            return [el("br")];
        case "link":
            return [linkOf(token as Tokens.Link)];
        case "image": {
            const { text } = token as Tokens.Image;
            return text === "" ? [] : [el("span", "av-md-image", text)];
        }
        default:
            return [];
    }
}

function wrapped(tag: "strong" | "em" | "del", tokens: readonly Token[]): HTMLElement {
    const created = el(tag);
    created.append(...inlineOf(tokens));
    return created;
}

/** A relative link points into a folder the page cannot open, so only its text shows. */
function linkOf({ href, title, tokens }: Tokens.Link): Node {
    const content = inlineOf(tokens);
    if (!SAFE_LINK.test(href)) {
        const text = el("span", "av-md-link-text");
        text.append(...content);
        return text;
    }
    const link = el("a", "av-md-link");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = title ?? href;
    link.append(...content);
    return link;
}
