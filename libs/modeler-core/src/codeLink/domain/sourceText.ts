/**
 * A Spring/CDI bean-naming annotation up to the opening quote of its id, e.g.
 * `@Service("` or `@Component(value = '`.
 */
export const BEAN_ANNOTATION_PREFIX = String.raw`@(?:Component|Service|Repository|Named|Bean)\s*\(\s*(?:value\s*=\s*)?["']`;
