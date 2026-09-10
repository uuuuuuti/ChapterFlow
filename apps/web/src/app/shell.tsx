import { ChapterFlowShell } from "./layouts/chapterflow-shell";

import { useState } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  Link,
  Navigate,
  useLocation,
} from "react-router";
import { getLocale, translate, useI18n } from "../i18n";
import {
  workspacePath,
  type WorkspaceDef,
} from "./workspaces";
import { legacyRouteTarget } from "../lib/legacy-route";

/* 应用骨架：左栏 rail（可折叠）+ 路由主区 + ⌘K 命令面板。
   主导航收敛为书架/项目概览/故事/写作/交付；其余工作区在 rail 下挂「高级工具」组，
   快速跳转统一走命令面板（全屏菜单已退役）。 */

const REPOSITORY_URL = "https://github.com/uuuuuuti/ChapterFlow";

function GitHubMark({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.64 0 8.13c0 3.59 2.29 6.63 5.47 7.7.4.08.55-.18.55-.39 0-.19-.01-.83-.01-1.5-2.23.49-2.69-.55-2.69-.55-.36-.94-.89-1.19-.89-1.19-.73-.5.05-.49.05-.49.8.06 1.22.83 1.22.83.71 1.23 1.87.87 2.33.67.07-.52.28-.87.51-1.07-1.78-.21-3.64-.9-3.64-4.02 0-.89.31-1.62.82-2.19-.08-.21-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.5 7.5 0 018 3.42a7.5 7.5 0 012 .28c1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.95.08 2.16.51.57.82 1.3.82 2.19 0 3.13-1.87 3.81-3.65 4.01.29.25.54.75.54 1.51 0 1.09-.01 1.97-.01 2.24 0 .22.15.47.55.39A8.02 8.02 0 0016 8.13C16 3.64 12.42 0 8 0Z" />
    </svg>
  );
}

export function AppShell() {
  const [router] = useState(() => createBrowserRouter([{ path: "*", element: <ShellRouter /> }]));
  return <RouterProvider router={router} />;
}

function ShellRouter() {
  const location = useLocation();
  if (location.pathname === "/") return <Navigate to="/books" replace />;
  const bookAlias = /^\/books\/([^/]+)\/(overview|bible|studio|runs|lab|delivery)\/?$/u.exec(location.pathname);
  if (bookAlias) {
    const target = legacyRouteTarget(
      `/projects/${encodeURIComponent(decodeURIComponent(bookAlias[1]!))}/${bookAlias[2]}`,
      location.search,
      location.hash,
    );
    if (target) return <Navigate to={target} replace />;
  }
  if (location.pathname.startsWith("/books") || location.pathname.startsWith("/settings")) return <ChapterFlowShell />;
  const target = legacyRouteTarget(location.pathname, location.search, location.hash);
  if (target) return <Navigate to={target} replace />;
  return <ChapterFlowShell />;
}

export function RepositoryLink() {
  const { t } = useI18n();
  return (
    <a
      className="icon-button"
      href={REPOSITORY_URL}
      target="_blank"
      rel="noreferrer"
      aria-label={t("shell.repository.viewSource")}
      title={t("shell.repository.viewSource")}
    >
      <GitHubMark />
    </a>
  );
}

export function NaviLink(item: WorkspaceDef, projectId: string | null, current: WorkspaceDef, currentPath: string) {
  const locale = getLocale();
  const itemLabel = translate(locale, item.label);
  const Icon = item.icon;
  const href = item.id === "supply" && projectId
    ? current.id === "supply" ? currentPath : settingsPath(projectId, currentPath)
    : workspacePath(item, projectId);
  return (
    <Link
      key={item.id}
      to={href}
      className="rail__item"
      data-tooltip={itemLabel}
      aria-label={translate(locale, "shell.nav.goTo", { label: itemLabel })}
      {...(current.id === item.id ? { "aria-current": "page" } : {})}
    >
      <span className="rail__item-icon">
        <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <span className="rail__item-label">{itemLabel}</span>
      <span className="rail__item-index mono">{item.index}</span>
    </Link>
  );
}

function settingsPath(projectId: string, returnTo: string): string {
  const params = new URLSearchParams({ project: projectId, return: returnTo });
  return `/settings?${params.toString()}`;
}
