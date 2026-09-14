import { BrandMark } from "../../shared/ui/brand-mark";
import "../../styles/chapterflow.css";
import {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  Suspense,
  lazy,
} from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useBlocker,
} from "react-router";
import {
  BookOpen,
  House,
  Library,
  ListTree,
  PenLine,
  Shield,
  ChartNoAxesCombined,
  Send,
  ListChecks,
  Search,
  Settings,
  Bell,
  Brain,
  WandSparkles,
  Plus,
  Menu,
  X,
  FileQuestion,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { LibraryPage, BookCreatePage } from "../../pages/library/library-page";
import { TrashPage } from "../../pages/library/trash-page";
import { DashboardPage } from "../../pages/dashboard/dashboard-page";
import { OutlinePage } from "../../pages/outline/outline-page";
import { KnowledgePage } from "../../pages/knowledge/knowledge-page";
import { SettingsPage } from "../../pages/settings/settings-page";
import { TaskPage } from "../../pages/tasks/task-page";
import { TaskCenterPage } from "../../pages/tasks/task-center-page";
import { PublishPage } from "../../pages/publish/publish-page";
import { TemplatesPage } from "../../pages/templates/templates-page";
import { AnalyticsPage } from "../../pages/analytics/analytics-page";
import { AdvancedPage } from "../../pages/advanced/advanced-page";
import { QuickCreatePage } from "../../pages/quick-create/quick-create-page";
import { SigningSprintPage } from "../../pages/signing-sprint/signing-sprint-page";
import { OfficialKnowledgePage } from "../../pages/official-knowledge/official-knowledge-page";
import { ProjectAssistant } from "../project-assistant";
import type { AssistantContext } from "../../shared/api/types";
import { getHealth } from "../../shared/api/client";
import { queryKeys } from "../../shared/query/keys";
import { Drawer } from "../../shared/ui/drawer";
import type { FlushDraft } from "../../features/draft-autosave/use-draft-autosave";
import { legacyRouteTarget } from "../../lib/legacy-route";
const WritingPage = lazy(() =>
  import("../../pages/writing/writing-page").then((m) => ({
    default: m.WritingPageV2,
  })),
);
const Tasks = lazy(() =>
  import("../../features/task-progress/task-center").then((m) => ({
    default: m.TaskCenter,
  })),
);
const NavigationGuard = createContext<{
  register: (flush: FlushDraft | null) => void;
  flush: () => Promise<boolean>;
}>({ register: () => {}, flush: async () => true });
export const useWritingGuard = () => useContext(NavigationGuard).register;
export const useFlushWriting = () => useContext(NavigationGuard).flush;
export function ChapterFlowShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const projectId = /^\/books\/([^/]+)\//.exec(location.pathname)?.[1] ?? null;
  const [menu, setMenu] = useState(false);
  const [tasks, setTasks] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [search, setSearch] = useState("");
  const flush = useRef<FlushDraft | null>(null);
  const [notice, setNotice] = useState("");
  const blocker = useBlocker(() => Boolean(flush.current));
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    let cancelled = false;
    void (flush.current?.() ?? Promise.resolve(true)).then((ok) => {
      if (cancelled) return;
      if (ok) blocker.proceed();
      else {
        setNotice("草稿保存失败，请重试保存后再离开。");
        blocker.reset();
      }
    });
    return () => { cancelled = true; };
  }, [blocker]);
  const health = useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => getHealth(signal),
    refetchInterval: 30000,
  });
  useEffect(() => {
    document.title = "ChapterFlow · 文织·网文工坊";
  }, []);
  const nav = [
    { path: "dashboard", label: "创作首页", icon: House },
    { path: "outline", label: "大纲", icon: ListTree },
    { path: "write", label: "写作", icon: PenLine },
    { path: "knowledge", label: "作品设定", icon: Shield },
    { path: "analytics", label: "数据", icon: ChartNoAxesCombined },
    { path: "publish", label: "发布", icon: Send },
    { path: "tasks", label: "任务中心", icon: ListChecks },
    { path: "signing-sprint", label: "快速开书", icon: Plus },
    { path: "quick-create", label: "连续创作", icon: WandSparkles },
    { path: "advanced", label: "高级工具", icon: Brain },
  ];
  return (
    <NavigationGuard.Provider
      value={{
        register: (f) => {
          flush.current = f;
        },
        flush: () => flush.current?.() ?? Promise.resolve(true),
      }}
    >
      <div className="cf-shell">
        <aside className={`cf-sidebar ${menu ? "is-open" : ""}`}>
          <Link to="/books" className="cf-brand">
            <BrandMark />
            <span>
              <strong>ChapterFlow</strong>
              <small>文织 · 网文工坊</small>
            </span>
          </Link>
          <button
            className="cf-mobile-close"
            aria-label="关闭导航"
            onClick={() => setMenu(false)}
          >
            <X />
          </button>
          <nav aria-label="创作导航">
            <NavLink to="/books" end>
              <Library size={21} />
              我的作品
            </NavLink>
            {projectId ? (
              nav.map((item) => (
                <NavLink
                  key={item.path}
                  to={`/books/${projectId}/${item.path}`}
                  onClick={() => setMenu(false)}
                >
                  <item.icon size={21} />
                  {item.label}
                </NavLink>
              ))
            ) : (
              <>
                <NavLink to="/books/templates">
                  <ListTree size={21} />
                  创作模板
                </NavLink>
                <NavLink to="/settings">
                  <Settings size={21} />
                  设置
                </NavLink>
                <NavLink to="/official-knowledge">
                  <Shield size={21} />
                  官方知识
                </NavLink>
              </>
            )}
          </nav>
          <div className="cf-sidebar-footer">
            <p>
              从一个想法，
              <br />
              到一部长篇。
            </p>
            <span>——</span>
            <small>
              让每一个故事，
              <br />
              都被认真对待。
            </small>
            <BookOpen size={65} strokeWidth={0.8} />
            <small>
              ChapterFlow
              <br />
              文织 · 网文工坊
            </small>
          </div>
        </aside>
        <div className="cf-main">
          <header className="cf-topbar">
            <button
              className="cf-menu"
              aria-label="打开导航"
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
            <form
              className="cf-search"
              onSubmit={(e) => {
                e.preventDefault();
                void (async () => {
                  if (flush.current && !(await flush.current())) {
                    setNotice("草稿保存失败，请重试保存后再离开。");
                    return;
                  }
                  navigate(`/books?q=${encodeURIComponent(search)}`);
                })();
              }}
            >
              <Search size={19} />
              <input
                aria-label="搜索作品"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索你的作品…"
              />
              <kbd>↵</kbd>
            </form>
            <div className="cf-top-actions">
              <span className="cf-connection" title="内容存储连接状态">
                <i className={health.isError ? "is-offline" : ""} />
                {health.isPending ? "连接中" : "写作可用"}
              </span>
              <Link className="cf-primary" to="/books/new">
                <Plus size={17} />
                <span>新建作品</span>
              </Link>
              {projectId ? (
                <button
                  aria-label="任务中心"
                  title="任务中心"
                  onClick={() => setTasks(true)}
                >
                  <Bell size={21} />
                </button>
              ) : null}
              <Link to="/settings" aria-label="设置">
                <Settings size={21} />
              </Link>
            </div>
          </header>
          {notice ? (
            <div role="alert" className="cf-notice">
              <span>{notice}</span>
              <button onClick={() => setNotice("")}>关闭</button>
            </div>
          ) : null}
          <main>
            <Suspense
              fallback={
                <div className="cf-page" role="status">
                  正在打开…
                </div>
              }
            >
              <Routes>
                <Route path="/books" element={<LibraryPage />} />
                <Route path="/books/trash" element={<TrashPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/:section" element={<SettingsPage />} />
                <Route path="/official-knowledge" element={<OfficialKnowledgePage />} />
                <Route path="/books/new" element={<BookCreatePage />} />
                <Route
                  path="/books/templates"
                  element={<TemplatesPage />}
                />
                <Route
                  path="/books/:projectId"
                  element={<BookHomeRedirect />}
                />
                <Route
                  path="/books/:projectId/dashboard"
                  element={<DashboardPage />}
                />
                <Route
                  path="/books/:projectId/write"
                  element={<WritingPage />}
                />
                <Route
                  path="/books/:projectId/write/:chapterId"
                  element={<WritingPage />}
                />
                <Route
                  path="/books/:projectId/tasks/:taskId"
                  element={<TaskPage />}
                />
                <Route
                  path="/books/:projectId/tasks"
                  element={<TaskCenterPage />}
                />
                <Route
                  path="/books/:projectId/outline"
                  element={<OutlinePage />}
                />
                <Route path="/books/:projectId/knowledge/*" element={<KnowledgePage />} />
                <Route path="/books/:projectId/advanced" element={<AdvancedPage />} />
                <Route path="/books/:projectId/quick-create" element={<QuickCreatePage />} />
                <Route path="/books/:projectId/signing-sprint" element={<SigningSprintPage />} />
                <Route path="/books/:projectId/autopilot" element={<QuickCreatePage />} />
                <Route path="/books/:projectId/overview" element={<BookLegacyAlias workspace="overview" />} />
                <Route path="/books/:projectId/bible" element={<BookLegacyAlias workspace="bible" />} />
                <Route path="/books/:projectId/studio" element={<BookLegacyAlias workspace="studio" />} />
                <Route path="/books/:projectId/runs" element={<BookLegacyAlias workspace="runs" />} />
                <Route path="/books/:projectId/lab" element={<BookLegacyAlias workspace="lab" />} />
                <Route path="/books/:projectId/delivery" element={<BookLegacyAlias workspace="delivery" />} />
                <Route
                  path="/books/:projectId/analytics"
                  element={<AnalyticsPage />}
                />
                <Route path="/books/:projectId/publish" element={<PublishPage />} />
                <Route path="*" element={<NativeRouteNotFound />} />
              </Routes>
            </Suspense>
          </main>
      </div>
      {projectId ? (
        <ProjectAssistant
          key={projectId}
          projectId={projectId}
          context={nativeAssistantContext(location.pathname)}
          open={assistantOpen}
          onOpen={() => setAssistantOpen(true)}
          onClose={() => setAssistantOpen(false)}
        />
      ) : null}
      {tasks && projectId ? (
          <Drawer title="任务中心" onClose={() => setTasks(false)}>
            <Suspense fallback={<p>正在读取任务…</p>}>
              <Tasks projectId={projectId} />
            </Suspense>
          </Drawer>
        ) : null}
      </div>
    </NavigationGuard.Provider>
  );
}

function nativeAssistantContext(pathname: string): AssistantContext {
  const documentId = /^\/books\/[^/]+\/write\/([^/]+)/.exec(pathname)?.[1] ?? null;
  const surface = pathname.includes("/knowledge")
    ? "bible"
    : pathname.includes("/quick-create") || pathname.includes("/autopilot")
      ? "quick-create"
    : pathname.includes("/write")
      ? "studio"
      : pathname.includes("/outline")
        ? "bible"
        : pathname.includes("/publish")
          ? "delivery"
          : "overview";
  return { surface, documentId, outlineNodeId: null, canonSpread: null, selection: null };
}

function NativeRouteNotFound() {
  const location = useLocation();
  return (
    <section className="cf-page cf-empty cf-resource-error" role="alert">
      <FileQuestion size={44} aria-hidden="true" />
      <h1>页面不存在</h1>
      <p>这条地址没有对应的 ChapterFlow 工作面，旧工作区也不会接管它。</p>
      <p className="cf-resource-error__detail">
        {location.pathname}{location.search}
      </p>
      <Link className="cf-primary" to="/books">
        回到作品库
      </Link>
    </section>
  );
}

function BookHomeRedirect() {
  const location = useLocation();
  return <Navigate replace to={`${location.pathname}/dashboard`} />;
}

function BookLegacyAlias({ workspace }: { workspace: "overview" | "bible" | "studio" | "runs" | "lab" | "delivery" }) {
  const { projectId = "" } = useParams();
  const location = useLocation();
  const target = legacyRouteTarget(
    `/projects/${encodeURIComponent(projectId)}/${workspace}`,
    location.search,
    location.hash,
  );
  return <Navigate replace to={target ?? `/books/${encodeURIComponent(projectId)}/dashboard`} />;
}
