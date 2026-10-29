/**
 * The type the landing and legal sections are drawn in: Inter with its alternate
 * letterforms.
 *
 * In a module of its own, not beside a component: a value exported from a
 * client module reaches a server component as a reference rather than as the
 * string, so the server-rendered sections that used it got no class at all.
 */
export const SECTION_TYPE =
  "font-[family-name:var(--font-inter-ui)] [font-feature-settings:'cv05','cv10','cv11','ss01']";
