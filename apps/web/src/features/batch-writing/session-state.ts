import type { AutopilotSession } from "../../lib/api";
export function findActiveSession(
  ...sessions: Array<AutopilotSession | null | undefined>
): AutopilotSession | null {
  const seen = new Set<string>();
  for (const session of sessions) {
    if (!session || seen.has(session.id)) continue;
    seen.add(session.id);
    if (!["completed", "cancelled"].includes(session.status)) return session;
  }
  return null;
}

export interface PendingRequest {
  key: string;
  requestId: string;
}

export function requestIdFor(
  ref: { current: PendingRequest | null },
  key: string,
): string {
  if (ref.current?.key !== key) {
    ref.current = { key, requestId: crypto.randomUUID() };
  }
  return ref.current.requestId;
}
