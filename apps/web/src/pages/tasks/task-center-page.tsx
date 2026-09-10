import { Link, useParams } from "react-router";
import { TaskCenter } from "../../features/task-progress/task-center";

/** 任务中心的完整页面入口；抽屉只是快捷入口，深链和旧 Runs 书签也必须落到这里。 */
export function TaskCenterPage() {
  const { projectId } = useParams<{ projectId: string }>();
  if (!projectId) {
    return (
      <section className="cf-page cf-empty cf-resource-error" role="alert">
        <h1>找不到作品</h1>
        <p>任务中心需要一个明确的作品上下文。</p>
        <Link className="cf-primary" to="/books">回到作品库</Link>
      </section>
    );
  }
  return (
    <section className="cf-page cf-task-center-page">
      <div className="cf-page-title">
        <div>
          <span className="cf-eyebrow">TASK CENTER</span>
          <h1>任务中心</h1>
          <p>集中处理等待确认、失败待恢复和最近完成的创作任务。</p>
        </div>
        <div className="cf-actions">
          <Link className="cf-button" to={`/books/${projectId}/dashboard`}>
            回到创作首页
          </Link>
          <Link className="cf-primary" to={`/books/${projectId}/quick-create`}>
            打开连续创作
          </Link>
        </div>
      </div>
      <TaskCenter projectId={projectId} />
    </section>
  );
}
