export interface UrlRule {
  id: string;
  name: string;
  baseUrl: string;
  pathPattern: string;
  ignoreQuery: boolean;
  ignoreHash: boolean;
  enabled: boolean;
}

const REST_TOKEN = "**";

export function parseUrlRule(value: unknown): UrlRule | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rule = value as Record<string, unknown>;
  if (
    typeof rule.id !== "string"
    || typeof rule.name !== "string"
    || typeof rule.baseUrl !== "string"
    || typeof rule.pathPattern !== "string"
    || typeof rule.ignoreQuery !== "boolean"
    || typeof rule.ignoreHash !== "boolean"
    || (rule.enabled !== undefined && typeof rule.enabled !== "boolean")
  ) {
    return undefined;
  }

  const parsed: UrlRule = {
    id: rule.id,
    name: rule.name,
    baseUrl: rule.baseUrl,
    pathPattern: rule.pathPattern,
    ignoreQuery: rule.ignoreQuery,
    ignoreHash: rule.ignoreHash,
    enabled: rule.enabled ?? true,
  };
  return validateRule(parsed) === undefined ? parsed : undefined;
}

export function getOriginPattern(baseUrl: string): string {
  const url = normalizeBaseUrl(baseUrl);
  return `${url.protocol}//${url.hostname}/*`;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function pathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean).map(decodeSegment);
}

function normalizeBaseUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Base URL must use http or https.");
  }
  if (url.search || url.hash) {
    throw new Error("Base URL cannot contain a query string or anchor.");
  }
  return url;
}

export function validateRule(rule: UrlRule): string | undefined {
  try {
    normalizeBaseUrl(rule.baseUrl);
  } catch (error) {
    return error instanceof Error ? error.message : "Base URL is invalid.";
  }

  if (!rule.name.trim()) return "Rule name is required.";
  if (!rule.pathPattern.startsWith("/")) return "Path pattern must start with /.";
  if (rule.pathPattern.includes("?") || rule.pathPattern.includes("#")) {
    return "Path pattern cannot contain a query string or anchor.";
  }

  const segments = pathSegments(rule.pathPattern);
  const restIndex = segments.indexOf(REST_TOKEN);
  if (restIndex !== -1 && restIndex !== segments.length - 1) {
    return "/** is only allowed at the end of a pattern.";
  }

  if (segments.some((segment) => segment.includes("**") && segment !== REST_TOKEN)) {
    return "Use /** as its own final segment.";
  }

  if (segments.some((segment) => segment === ":")) {
    return "Named segments need a name after the colon.";
  }

  return undefined;
}

export function getRuleKey(value: string, rule: UrlRule): string | undefined {
  if (validateRule(rule)) return undefined;

  let candidate: URL;
  try {
    candidate = new URL(value);
  } catch {
    return undefined;
  }

  const base = normalizeBaseUrl(rule.baseUrl);
  if (candidate.origin !== base.origin) return undefined;

  const candidateSegments = pathSegments(candidate.pathname);
  const baseSegments = pathSegments(base.pathname);
  if (!baseSegments.every((segment, index) => candidateSegments[index] === segment)) {
    return undefined;
  }

  const relativeSegments = candidateSegments.slice(baseSegments.length);
  const patternSegments = pathSegments(rule.pathPattern);
  const ignoresRemainder = patternSegments.at(-1) === REST_TOKEN;
  const identityPattern = ignoresRemainder ? patternSegments.slice(0, -1) : patternSegments;

  if (
    relativeSegments.length < identityPattern.length
    || (!ignoresRemainder && relativeSegments.length !== identityPattern.length)
  ) {
    return undefined;
  }

  const matches = identityPattern.every((patternSegment, index) => {
    return patternSegment === "*" || patternSegment.startsWith(":")
      || patternSegment === relativeSegments[index];
  });
  if (!matches) return undefined;

  const identityPath = [...baseSegments, ...relativeSegments.slice(0, identityPattern.length)]
    .map(encodeURIComponent)
    .join("/");
  const query = rule.ignoreQuery ? "" : candidate.search;
  const hash = rule.ignoreHash ? "" : candidate.hash;
  return `${rule.id}:${candidate.origin}/${identityPath}${query}${hash}`;
}

export function getUrlKey(value: string, rules: UrlRule[]): string | undefined {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const key = getRuleKey(value, rule);
    if (key) return key;
  }
  return undefined;
}
