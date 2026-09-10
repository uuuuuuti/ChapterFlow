import { translate, getLocale, type MessageKey } from "../../i18n";
import { errors as zhErrors } from "../../i18n/zh/errors";
import { type HealthResponse } from "@narralume/contracts";
import { requireResolvedMode } from "../../kernel/transport";
import { kernelRequest } from "../../kernel/kernel-client";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(
    code: string,
    message: string,
    status: number,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * 判断一次请求是否因为资源不存在而失败。
 *
 * 后端不同领域会返回 project.not_found、document.not_found、
 * run.stream.not_found 等错误码；原生页面统一把它们解释成可恢复的
 * 404 状态，避免把失效深链静默送回作品库。
 */
export function isNotFoundError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    (error.status === 404 ||
      error.code === "http.404" ||
      /(?:^|[._-])not_found$/u.test(error.code))
  );
}

/**
 * 作者写作流程中的并发冲突必须进入显式恢复路径，不能只显示一条普通错误。
 * 服务端冲突统一用 409 或 *.conflict；本地的草稿保护也会抛出带有正文/草稿
 * 语义的 Error，因此这里同时识别两类错误，供原生写作台复用。
 */
export function isAuthoringConflict(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 409 || /(?:^|[._-])conflict$/u.test(error.code);
  }
  if (error && typeof error === "object") {
    const value = error as { status?: unknown; code?: unknown };
    if (value.status === 409) return true;
    if (typeof value.code === "string" && /(?:^|[._-])conflict$/u.test(value.code))
      return true;
  }
  return (
    error instanceof Error &&
    /(?:正文|草稿|版本).*(?:变化|修改|更新|冲突|覆盖|刷新)|(?:冲突|覆盖).*(?:正文|草稿|版本)/u.test(
      error.message,
    )
  );
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const key = errorLookupKey(`message.${errorCodeKey(error.code)}`);
    if (key) return translate(getLocale(), key);
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return translate(getLocale(), "errors.message.requestFailed");
}

export function errorCodeKey(code: string): string {
  return code.replace(/[._-](\w)/g, (_sep, ch: string) => ch.toUpperCase());
}

export function errorLookupKey(path: string): MessageKey | null {
  let node: unknown = zhErrors;
  for (const part of path.split(".")) {
    if (!node || typeof node !== "object") return null;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? (`errors.${path}` as MessageKey) : null;
}

export function apiErrorHint(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === "policy.unknown_field") {
    const fields = detailStringList(error.details, "fields");
    return fields.length
      ? translate(getLocale(), "errors.hint.policyUnknownFieldFields", {
          fields: fields.join(fieldSeparator()),
        })
      : translate(getLocale(), "errors.hint.policyUnknownField");
  }
  if (error.code === "request.unknown_field") {
    const fields = detailStringList(error.details, "fields");
    return fields.length
      ? translate(getLocale(), "errors.hint.requestUnknownFieldFields", {
          fields: fields.join(fieldSeparator()),
        })
      : translate(getLocale(), "errors.hint.requestUnknownField");
  }
  if (error.code.startsWith("import.") && isImportFailureDetails(error.details)) {
    const key = {
      size: "importFailureSize",
      encoding: "importFailureEncoding",
      container: "importFailureContainer",
      structure: "importFailureStructure",
      empty: "importFailureEmpty",
      hash: "importFailureHash",
      unknown: "importFailureUnknown",
    }[error.details.failureKind] as MessageKey;
    return translate(getLocale(), `errors.hint.${key}` as MessageKey);
  }
  const key = errorLookupKey(`hint.${errorCodeKey(error.code)}`);
  return key ? translate(getLocale(), key) : null;
}

const importFailureHintKeys = {
  size: true,
  encoding: true,
  container: true,
  structure: true,
  empty: true,
  hash: true,
  unknown: true,
} as const;

function isImportFailureDetails(
  details: unknown,
): details is { failureKind: keyof typeof importFailureHintKeys } {
  return Boolean(
    details &&
      typeof details === "object" &&
      typeof (details as { failureKind?: unknown }).failureKind === "string" &&
      (details as { failureKind: string }).failureKind in importFailureHintKeys,
  );
}

export function fieldSeparator(): string {
  return getLocale() === "zh-CN" ? "、" : ", ";
}

export function detailStringList(details: unknown, key: string): string[] {
  if (!details || typeof details !== "object") return [];
  const value = (details as Record<string, unknown>)[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/api/health", signal ? { signal } : {});
}

export function jsonRequest(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body: unknown,
): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function transportRequest(
  input: string,
  init: RequestInit,
): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  const mode = await requireResolvedMode();
  if (mode === "local") {
    return kernelRequest({
      method: (init.method ?? "GET") as
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      path: input,
      body: init.body,
      headers: init.headers as Record<string, string> | undefined,
    });
  }
  const response = await fetch(input, init);
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");
  return { status: response.status, headers, body };
}

export function transportError(status: number, body: unknown): ApiError {
  const envelope =
    body && typeof body === "object" && "error" in body
      ? (body as { error: Record<string, unknown> }).error
      : null;
  const code =
    envelope && typeof envelope.code === "string"
      ? envelope.code
      : `http.${status}`;
  const message =
    envelope && typeof envelope.message === "string"
      ? envelope.message
      : translate(getLocale(), "errors.message.httpFailed", { status });
  let details: unknown = envelope?.details;
  if (details === undefined && envelope) {
    // 后端有时把附加信息直接放进 error 包（如 fields:string[]），
    // 没有 details 字段时原样保留这些余量键。
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(envelope)) {
      if (key !== "code" && key !== "message" && key !== "requestId") {
        rest[key] = value;
      }
    }
    details = Object.keys(rest).length > 0 ? rest : undefined;
  }
  return new ApiError(code, message, status, details);
}

export async function requestJson<T>(
  input: string,
  init: RequestInit,
): Promise<T> {
  const response = await transportRequest(input, init);
  if (response.status >= 400)
    throw transportError(response.status, response.body);
  return response.body as T;
}

export async function requestVoid(
  input: string,
  init: RequestInit,
): Promise<void> {
  const response = await transportRequest(input, init);
  if (response.status >= 400)
    throw transportError(response.status, response.body);
}

export async function requestBlob(
  input: string,
  init: RequestInit = {},
): Promise<{
  blob: Blob;
  filename: string | null;
  contentType: string | null;
  exportBatchId: string | null;
}> {
  const mode = await requireResolvedMode();
  if (mode === "local") {
    const response = await kernelRequest({
      method: (init.method ?? "GET") as
        "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      path: input,
      body: init.body,
      headers: init.headers as Record<string, string> | undefined,
    });
    if (response.status >= 400) {
      throw transportError(
        response.status,
        response.body &&
          typeof response.body === "object" &&
          "error" in response.body
          ? response.body
          : null,
      );
    }
    const disposition = response.headers["content-disposition"] ?? "";
    const encodedName =
      disposition.match(/filename\*=UTF-8''([^;]+)/iu)?.[1] ?? null;
    return {
      blob: new Blob([response.body as BlobPart]),
      filename: encodedName ? decodeURIComponent(encodedName) : null,
      contentType: response.headers["content-type"] ?? null,
      exportBatchId: response.headers["x-export-batch-id"] ?? null,
    };
  }
  const response = await fetch(input, init);
  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw transportError(response.status, null);
    }
    throw transportError(response.status, body);
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const encodedName =
    disposition.match(/filename\*=UTF-8''([^;]+)/iu)?.[1] ?? null;
  return {
    blob: await response.blob(),
    filename: encodedName ? decodeURIComponent(encodedName) : null,
    contentType: response.headers.get("content-type"),
    exportBatchId: response.headers.get("x-export-batch-id"),
  };
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const stride = 32_768;
  for (let offset = 0; offset < bytes.length; offset += stride) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + stride));
  }
  return btoa(binary);
}

export async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
