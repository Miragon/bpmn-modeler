import { Uri } from "vscode";

/**
 * Parses a string that may be either a `file://` URI (`file:///c%3A/…`, as
 * produced by `uri.toString()`) or a plain OS/`uri.path` string into a `Uri`.
 *
 * `Uri.file` percent-encodes its argument, so feeding it a `file://` string
 * yields a doubly-escaped garbage path; `Uri.parse` is required for that form.
 * Scheme-tolerance here mirrors the `NodeWorkspace` contract, letting callers
 * pass whichever spelling of the path they hold without leaking `Uri` outward.
 */
export function toUri(pathOrUri: string): Uri {
    return pathOrUri.startsWith("file://") ? Uri.parse(pathOrUri) : Uri.file(pathOrUri);
}
