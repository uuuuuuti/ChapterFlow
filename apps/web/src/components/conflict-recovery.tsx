import { RefreshCw, ShieldAlert, Split } from "lucide-react";

import { ErrorNote } from "./error-note";
import { isAuthoringConflict } from "../shared/api/client";

interface ConflictRecoveryProps {
  error: unknown;
  refreshing?: boolean;
  onKeepLocal: () => void;
  onRefreshRemote: () => void;
  onOpenDiff?: (() => void) | undefined;
}

/**
 * 写作台所有版本/草稿冲突共用的恢复操作。
 * “保留本地”不会偷偷重试；“刷新远端”由调用方明确替换编辑器内容。
 */
export function ConflictRecovery({
  error,
  refreshing = false,
  onKeepLocal,
  onRefreshRemote,
  onOpenDiff,
}: ConflictRecoveryProps) {
  if (!isAuthoringConflict(error)) return null;
  return (
    <section className="cf-conflict-recovery" role="alert" aria-label="正文冲突恢复">
      <div className="cf-conflict-recovery__heading">
        <ShieldAlert size={18} aria-hidden="true" />
        <div>
          <strong>正文在其他页面发生变化</strong>
          <p>先决定如何处理当前本地稿，ChapterFlow 不会静默覆盖你的文字。</p>
        </div>
      </div>
      <ErrorNote error={error} title="需要处理正文冲突" />
      <div className="cf-actions">
        <button type="button" className="cf-button" onClick={onKeepLocal} disabled={refreshing}>
          保留本地稿
        </button>
        {onOpenDiff ? (
          <button type="button" className="cf-button" onClick={onOpenDiff} disabled={refreshing}>
            <Split size={15} />
            打开版本差异
          </button>
        ) : null}
        <button type="button" className="cf-primary" onClick={onRefreshRemote} disabled={refreshing}>
          <RefreshCw size={15} />
          {refreshing ? "正在读取远端…" : "刷新远端并放弃本地稿"}
        </button>
      </div>
    </section>
  );
}
