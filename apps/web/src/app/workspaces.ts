import {
  Activity,
  BookOpenText,
  Brain,
  Compass,
  Cpu,
  LibraryBig,
  PenLine,
  Radar,

  Truck,
  type LucideIcon,
} from "lucide-react";

import type { MessageKey } from "../i18n";

/* 主导航收敛为五个创作面：书架 / 项目概览 / 故事 / 写作 / 交付。
   所有普通导航都使用 ChapterFlow 原生 `/books/*` 路径；旧 `/projects/*` 只由
   legacy-route 解析器消费，不再由命令面板或导航 helper 生成。
   seal 是左栏顶部「当前工作区印记」的白文单字，随路由切换。
   label / blurb 是 i18n 字典键，展示侧用 t() / translate() 解析。 */

export interface WorkspaceDef {
  id: string;
  path: string;
  projectScoped: boolean;
  label: MessageKey;
  en: string;
  index: string;
  icon: LucideIcon;
  blurb: MessageKey;
  seal: string;
}

export const WORKSPACES: WorkspaceDef[] = [
  {
    id: "shelf",
    path: "/books",
    projectScoped: false,
    label: "shell.nav.shelf",
    en: "STACKS",
    index: "01",
    icon: LibraryBig,
    blurb: "shell.nav.shelfBlurb",
    seal: "藏",
  },
  {
    id: "overview",
    path: "/books/:projectId/dashboard",
    projectScoped: true,
    label: "shell.nav.overview",
    en: "OVERLOOK",
    index: "02",
    icon: Compass,
    blurb: "shell.nav.overviewBlurb",
    seal: "览",
  },
  {
    id: "bible",
    path: "/books/:projectId/outline",
    projectScoped: true,
    label: "shell.nav.bible",
    en: "CANON",
    index: "03",
    icon: BookOpenText,
    blurb: "shell.nav.bibleBlurb",
    seal: "典",
  },
  {
    id: "studio",
    path: "/books/:projectId/write",
    projectScoped: true,
    label: "shell.nav.studio",
    en: "DESK",
    index: "04",
    icon: PenLine,
    blurb: "shell.nav.studioBlurb",
    seal: "稿",
  },
  {
    id: "delivery",
    path: "/books/:projectId/publish",
    projectScoped: true,
    label: "shell.nav.delivery",
    en: "PRESS",
    index: "05",
    icon: Truck,
    blurb: "shell.nav.deliveryBlurb",
    seal: "付",
  },
];

/** 连续创作是普通产品入口，但与五个稳定工作面分组展示。 */
export const QUICK_WORKSPACES: WorkspaceDef[] = [
  {
    id: "autopilot",
    path: "/books/:projectId/quick-create",
    projectScoped: true,
    label: "shell.nav.autopilot",
    en: "QUICK CREATE",
    index: "Q1",
    icon: Radar,
    blurb: "shell.nav.autopilotBlurb",
    seal: "创",
  },
];

/* 高级工具组：只放诊断、推演与全局配置，不承载普通创作主链。 */
export const ADVANCED_WORKSPACES: WorkspaceDef[] = [
  {
    id: "runs",
    path: "/books/:projectId/tasks",
    projectScoped: true,
    label: "shell.nav.runs",
    en: "LEDGER",
    index: "L1",
    icon: Activity,
    blurb: "shell.nav.runsBlurb",
    seal: "行",
  },
  {
    id: "lab",
    path: "/books/:projectId/advanced",
    projectScoped: true,
    label: "shell.nav.lab",
    en: "LOOM",
    index: "L2",
    icon: Brain,
    blurb: "shell.nav.labBlurb",
    seal: "演",
  },
  {
    id: "supply",
    path: "/settings",
    projectScoped: false,
    label: "shell.nav.settings",
    en: "SETTINGS",
    index: "S1",
    icon: Cpu,
    blurb: "shell.nav.settingsBlurb",
    seal: "配",
  },
];

const ALL_WORKSPACES = [...WORKSPACES, ...QUICK_WORKSPACES, ...ADVANCED_WORKSPACES];

export function workspaceByPath(pathname: string): WorkspaceDef {
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return ADVANCED_WORKSPACES.find((item) => item.id === "supply")!;
  }
  const nativeWorkspace = /^\/books\/[^/]+\/([^/]+)/.exec(pathname)?.[1];
  const legacyWorkspace = /^\/projects\/[^/]+\/([^/]+)/.exec(pathname)?.[1];
  const projectlessWorkspace = /^\/([^/]+)\/?$/.exec(pathname)?.[1];
  const workspace = nativeWorkspace
    ? nativeWorkspace === "dashboard" ? "overview"
      : nativeWorkspace === "outline" ? "bible"
        : nativeWorkspace === "write" ? "studio"
          : nativeWorkspace === "publish" ? "delivery"
            : nativeWorkspace === "quick-create" ? "autopilot"
              : nativeWorkspace === "tasks" ? "runs"
                : nativeWorkspace === "advanced" ? "lab"
                  : nativeWorkspace
    : legacyWorkspace ?? projectlessWorkspace;
  return (
    ALL_WORKSPACES.find(
      (item) => item.id === workspace || item.path === pathname,
    ) ??
    WORKSPACES[0]!
  );
}

export function projectIdFromPath(pathname: string): string | null {
  const value =
    /^\/books\/([^/]+)(?:\/|$)/.exec(pathname)?.[1] ??
    /^\/projects\/([^/]+)(?:\/|$)/.exec(pathname)?.[1];
  return value ? decodeURIComponent(value) : null;
}

export function workspacePath(item: WorkspaceDef, projectId: string | null): string {
  if (!item.projectScoped) return item.path;
  if (!projectId) return "/books";
  return item.path.replace(":projectId", encodeURIComponent(projectId));
}
