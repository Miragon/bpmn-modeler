// Strings our own code passes to translate() at a call site no harvest reaches
// (neither a harvest driver nor a recording spec; tools/README.md lists the specs
// that record the merge view, the diff panes, the modeler's features and the
// linked form preview), genuinely needed and absent from the shared library.
// Keep them until upstreamed.
// A key stays while another view's harvest records it: that harvest does not reach this call site.
export const SOURCE_ONLY: ReadonlySet<string> = new Set([
    // The script-lock badge and hint render only while the host reports a script
    // open in an editor, which the harvest driver does not simulate.
    "Read-only",
    "Being edited in",
    // The context pad's keyboard search title: the harvest driver never opens it.
    "Element actions",
]);
