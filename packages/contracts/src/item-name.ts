function normalizedItemTokens(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function singularTokenVariants(token: string): string[] {
  const variants = new Set([token]);
  if (token.length <= 2) return [...variants];

  if (token.endsWith("ies") && token.length > 3) {
    variants.add(`${token.slice(0, -3)}y`);
  }

  if (/(ches|shes|xes|zes|ses|oes)$/.test(token) && token.length > 4) {
    variants.add(token.slice(0, -2));
  }

  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) {
    variants.add(token.slice(0, -1));
  }

  return [...variants];
}

function pluralTokenVariants(token: string): string[] {
  const variants = new Set([token]);
  if (token.length <= 2 || token.endsWith("s")) return [...variants];

  if (token.endsWith("y") && token.length > 2) {
    variants.add(`${token.slice(0, -1)}ies`);
  }

  if (/(ch|sh|x|z|s|o)$/.test(token)) {
    variants.add(`${token}es`);
  }

  variants.add(`${token}s`);
  return [...variants];
}

export function itemNameMatchKeys(value: string): string[] {
  const tokens = normalizedItemTokens(value);
  if (tokens.length === 0) return [];

  const base = tokens.join(" ");
  const keys = new Set([base]);
  const lastToken = tokens[tokens.length - 1];
  const leadingTokens = tokens.slice(0, -1);

  for (const variant of [
    ...singularTokenVariants(lastToken),
    ...pluralTokenVariants(lastToken),
  ]) {
    keys.add([...leadingTokens, variant].join(" "));
  }

  return [...keys];
}

export function resolveExistingItemName(
  value: string,
  existingNames: Iterable<string>,
): string | null {
  const desiredKeys = new Set(itemNameMatchKeys(value));
  if (desiredKeys.size === 0) return null;

  for (const existingName of existingNames) {
    for (const candidateKey of itemNameMatchKeys(existingName)) {
      if (desiredKeys.has(candidateKey)) {
        return existingName;
      }
    }
  }

  return null;
}
