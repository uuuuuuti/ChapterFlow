/**
 * Translate old NarraLume URLs into ChapterFlow URLs without mounting the old
 * shell. This module is intentionally pure so every legacy combination can
 * be verified as a URL contract.
 */
export function legacyRouteTarget(
  pathname: string,
  search = "",
  hash = "",
): string | null {
  const normalizedPath = normalizePath(pathname);
  const projectMatch = /^\/projects\/([^/]+)(?:\/(.*))?$/u.exec(normalizedPath);
  if (!projectMatch) return projectlessTarget(normalizedPath, search, hash);

  const projectId = encodeURIComponent(safeDecode(projectMatch[1]!));
  const segments = (projectMatch[2] ?? "")
    .split("/")
    .filter(Boolean)
    .map(safeDecode);
  const workspace = segments[0] ?? "overview";
  const params = new URLSearchParams(search);

  // Early builds emitted nested resource paths instead of query parameters.
  if (workspace === "studio" && segments[1] === "documents" && segments[2]) {
    params.set("document", segments[2]);
  }
  if (workspace === "runs" && segments[1] && !params.has("run")) {
    params.set("run", segments[1]);
  }
  if (workspace === "autopilot" && segments[1] && !params.has("session")) {
    params.set("session", segments[1]);
  }

  switch (workspace) {
    case "overview":
      return appendParams(`/books/${projectId}/dashboard`, params, hash);
    case "bible": {
      const spread = params.get("spread");
      params.delete("spread");
      if (spread === "outline") {
        return appendParams(`/books/${projectId}/outline`, params, hash);
      }
      return appendParams(
        `/books/${projectId}/knowledge/${spreadToKnowledgeSection(spread)}`,
        params,
        hash,
      );
    }
    case "studio":
      return studioTarget(projectId, params, hash);
    case "autopilot":
      return appendParams(`/books/${projectId}/quick-create`, params, hash);
    case "runs":
      return runTarget(projectId, params, hash);
    case "lab":
      return appendParams(`/books/${projectId}/advanced`, params, hash);
    case "delivery":
      return appendParams(`/books/${projectId}/publish`, params, hash);
    default:
      return appendParams(`/books/${projectId}/dashboard`, params, hash);
  }
}

function projectlessTarget(
  pathname: string,
  search: string,
  hash: string,
): string | null {
  const legacyEntryPoints = new Set([
    "/shelf",
    "/overview",
    "/bible",
    "/studio",
    "/delivery",
    "/autopilot",
    "/runs",
    "/lab",
  ]);
  return legacyEntryPoints.has(pathname)
    ? appendLocation("/books", search, hash)
    : null;
}

function studioTarget(
  projectId: string,
  params: URLSearchParams,
  hash: string,
): string {
  const documentId = params.get("document");
  const outlineId = params.get("outline");
  const runId = params.get("run");
  const sessionId = params.get("session");
  const mode = params.get("mode");
  const focus = params.get("focus");
  const selection = params.get("selection");

  // The old Studio's co-create mode lived under studio?session=… . It is a
  // product-level session, so it must land in the native voyage page rather
  // than being silently ignored by the writing editor.
  if (sessionId || mode === "cocreate") {
    params.delete("document");
    params.delete("outline");
    params.delete("run");
    params.delete("session");
    params.delete("mode");
    params.delete("focus");
    params.delete("selection");
    params.delete("returnTo");
    const returnTo = writeTarget(projectId, documentId, outlineId, focus, selection);
    if (returnTo) params.set("returnTo", returnTo);
    if (sessionId) params.set("session", sessionId);
    return appendParams(`/books/${projectId}/quick-create`, params, hash);
  }

  params.delete("document");
  params.delete("outline");
  params.delete("run");
  params.delete("mode");
  params.delete("focus");
  params.delete("selection");
  params.delete("returnTo");
  const writePath = writeTarget(projectId, documentId, outlineId, focus, selection);
  if (!documentId && runId) {
    params.set("returnTo", writePath);
    return appendParams(
      `/books/${projectId}/tasks/${encodeURIComponent(runId)}`,
      params,
      hash,
    );
  }
  if (runId) {
    return appendSearch(addQueryFirst(writePath, "task", runId), params, hash);
  }
  return appendSearch(writePath, params, hash);
}

function runTarget(
  projectId: string,
  params: URLSearchParams,
  hash: string,
): string {
  const runId = params.get("run");
  const sessionId = params.get("session");
  params.delete("run");
  params.delete("session");
  if (!runId) {
    if (sessionId) {
      const sessionParams = new URLSearchParams({ session: sessionId });
      return appendParams(`/books/${projectId}/quick-create`, sessionParams, hash);
    }
    return appendParams(`/books/${projectId}/tasks`, params, hash);
  }
  const returnTo = sessionId
    ? appendParams(`/books/${projectId}/quick-create`, new URLSearchParams({ session: sessionId }), "")
    : `/books/${projectId}/dashboard`;
  params.set("returnTo", returnTo);
  return appendParams(
    `/books/${projectId}/tasks/${encodeURIComponent(runId)}`,
    params,
    hash,
  );
}

function writeTarget(
  projectId: string,
  documentId: string | null,
  outlineId: string | null,
  focus: string | null,
  selection: string | null,
): string {
  const params = new URLSearchParams();
  if (outlineId) params.set("outline", outlineId);
  if (focus === "review") params.set("tab", "review");
  else if (focus === "canon") params.set("tab", "canon");
  else if (focus) params.set("focus", focus);
  if (selection) params.set("selection", selection);
  const path = documentId
    ? `/books/${projectId}/write/${encodeURIComponent(documentId)}`
    : `/books/${projectId}/write`;
  return appendParams(path, params, "");
}

function spreadToKnowledgeSection(spread: string | null): string {
  switch (spread) {
    case "entities":
      return "characters";
    case "facts":
      return "facts";
    case "relations":
      return "relations";
    case "timeline":
      return "timeline";
    case "foreshadows":
      return "foreshadow";
    case "intent":
    default:
      return "intent";
  }
}

function normalizePath(pathname: string): string {
  if (!pathname) return "/";
  const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return withLeadingSlash.length > 1
    ? withLeadingSlash.replace(/\/+$/u, "")
    : withLeadingSlash;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function appendParams(path: string, params: URLSearchParams, hash: string): string {
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}${hash}`;
}

function appendSearch(path: string, params: URLSearchParams, hash: string): string {
  const query = params.toString();
  if (!query) return `${path}${hash}`;
  return `${path}${path.includes("?") ? "&" : "?"}${query}${hash}`;
}

function addQueryFirst(path: string, key: string, value: string): string {
  const encoded = `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  const separator = path.indexOf("?");
  if (separator < 0) return `${path}?${encoded}`;
  return `${path.slice(0, separator)}?${encoded}&${path.slice(separator + 1)}`;
}

function appendLocation(path: string, search: string, hash: string): string {
  return `${path}${search}${hash}`;
}
