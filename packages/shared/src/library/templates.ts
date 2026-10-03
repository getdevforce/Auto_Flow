const VAR = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/** Variable names in order of first appearance, e.g. {character} and {location}. */
export function extractVariables(text: string): string[] {
  const seen: string[] = [];
  for (const m of text.matchAll(VAR)) if (!seen.includes(m[1] as string)) seen.push(m[1] as string);
  return seen;
}

/** Fills known variables; unknown ones stay as written so a missing value is visible rather than silently dropped. */
export function fillTemplate(text: string, values: Record<string, string | undefined>): string {
  return text.replace(VAR, (whole, name: string) => (values[name]?.trim() ? (values[name] as string).trim() : whole));
}

export function missingVariables(text: string, values: Record<string, string | undefined>): string[] {
  return extractVariables(text).filter((v) => !values[v]?.trim());
}
