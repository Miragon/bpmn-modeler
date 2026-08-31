import { Uri } from "vscode";

/**
 * Path/URI canonicalization at the VS Code host boundary.
 *
 * VS Code hands out two mutually inconsistent spellings of the same Windows
 * path: document/file-service URIs and `findFiles` results carry a *lowercase*
 * drive letter (`/c:/…`), while `WorkspaceFolder.uri` preserves the casing the
 * folder was opened with — typically *uppercase* from Explorer (`/C:/…`). Since
 * `uri.path` strings compare case-sensitively, a document under `/c:/…` never
 * tests as being inside a `/C:/…` workspace root, so the template/config walk
 * collects nothing (microsoft/vscode#194692). Funnelling every
 * path this adapter emits through {@link canonicalizeDriveLetter} removes the
 * skew; lowercase is the canon because that is what the URIs we compare against
 * already use.
 */

/**
 * Lowercases a leading Windows drive letter in a POSIX-form `uri.path`
 * (`/C:/Users` → `/c:/Users`). Non-Windows paths and already-lowercase drives
 * pass through untouched.
 */
export function canonicalizeDriveLetter(path: string): string {
    return path.replace(/^\/([A-Z]):/, (match) => match.toLowerCase());
}

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

/**
 * Returns `uri.path` in canonical form — i.e. with a Windows drive letter
 * lowercased so paths from different VS Code sources compare equal.
 */
export function canonicalPath(uri: Uri): string {
    return canonicalizeDriveLetter(uri.path);
}
