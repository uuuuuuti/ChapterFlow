import { Link, useParams, useSearchParams } from "react-router";
import { TaskResult } from "../../features/task-progress/task-center";

export function TaskPage() {
  const { projectId = "", taskId = "" } = useParams();
  const [params] = useSearchParams();
  const requestedReturn = params.get("returnTo");
  const returnTo = requestedReturn?.startsWith(`/books/${projectId}/`)
    ? requestedReturn
    : `/books/${projectId}/dashboard`;
  return (
    <div className="cf-page">
      <div className="cf-page-title">
        <div>
          <Link className="cf-text-link" to={returnTo}>
            ← 创作首页
          </Link>
          <h1>任务详情</h1>
          <p>任务可以离开页面继续运行，结果需要你确认后才会写入正文。</p>
        </div>
      </div>
      <TaskResult
        projectId={projectId}
        runId={taskId}
        recoveryHref={`/books/${projectId}/dashboard`}
      />
    </div>
  );
}
