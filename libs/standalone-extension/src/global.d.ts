/**
 * Allows `import "./foo.css"` in TS source. tsc has no built-in awareness
 * of stylesheet imports — this ambient declaration lets it accept the
 * side-effect import that webpack later resolves through its CSS loader
 * during the standalone app's bundling step.
 */
declare module "*.css";
