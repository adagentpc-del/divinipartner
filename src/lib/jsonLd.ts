/**
 * Safe JSON-LD serialization for <script type="application/ld+json"> blocks.
 *
 * `JSON.stringify` does NOT escape "<", so injecting its output directly via
 * dangerouslySetInnerHTML lets any string value that contains a literal
 * "</script>" break out of the script tag and execute as HTML/JS. This is a
 * real risk here: JSON-LD blocks on the public discovery pages embed
 * user-controlled data (vendor/venue business names), so a business named
 * something like `Foo</script><script>...` would otherwise inject a script
 * tag straight into a public, unauthenticated marketing page.
 *
 * jsonLdSafe() is the standard mitigation: stringify normally, then escape
 * "<" as its unicode escape so "</script>", "<script>", and "<!--" can never
 * form inside the emitted HTML. This is semantically invisible to JSON-LD
 * consumers (search engines, structured-data parsers) -- `<` decodes
 * back to "<" for anything reading the script tag's content as JSON.
 *
 * Zero em dashes.
 */
export function jsonLdSafe(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
