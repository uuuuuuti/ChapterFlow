import { Link } from "react-router";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { apiErrorMessage, isNotFoundError } from "../shared/api/client";
import { ErrorNote } from "./error-note";

interface ResourceErrorStateProps {
  error: unknown;
  backHref: string;
  backLabel: string;
  title?: string;
  description?: string;
}

/** 原生页面的资源级错误恢复。404 保留当前语境并给出明确回退入口。 */
export function ResourceErrorState({
  error,
  backHref,
  backLabel,
  title = "找不到这份内容",
  description = "这条链接可能已经过期，或者内容已被移入回收站。你可以回到上一级继续创作。",
}: ResourceErrorStateProps) {
  if (!isNotFoundError(error)) return <ErrorNote error={error} />;

  return (
    <section className="cf-empty cf-resource-error" role="alert">
      <FileQuestion size={44} aria-hidden="true" />
      <h1>{title}</h1>
      <p>{description}</p>
      <p className="cf-resource-error__detail">{apiErrorMessage(error)}</p>
      <Link className="cf-primary" to={backHref}>
        <ArrowLeft size={16} />
        {backLabel}
      </Link>
    </section>
  );
}
