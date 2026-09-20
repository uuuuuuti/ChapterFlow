/* global document, window */
// Runs inside an offline HTML snapshot. No network or write tools are exposed.
export function mountWorkbench(snapshot) {
  const labels = {
    character_graph: "人物关系",
    timeline: "时间线",
    promise_board: "读者期待",
    foreshadow_map: "伏笔回收",
    story_map: "剧情地图",
    chapter_health: "章节体检",
  };
  const statuses = {
    open: "待兑现",
    paid_off: "已兑现",
    resolved: "已回收",
    abandoned: "已放弃",
    active: "进行中",
    written: "已有正文",
    planned: "规划中",
  };
  const views = snapshot.views ?? [snapshot];
  const introductions = {
    character_graph: [
      "看清人物之间的每一条线索",
      "从核心人物出发，梳理同盟、秘密与冲突。点击节点，展开关联资料。",
    ],
    timeline: [
      "让故事的先后，一目了然",
      "对照叙述顺序与故事时间，检查事件衔接与人物行动。",
    ],
    promise_board: [
      "每一个期待，都值得回应",
      "跟踪期待的建立、推进与兑现，及时发现被遗忘的承诺。",
    ],
    foreshadow_map: [
      "埋下线索，也安排好回响",
      "把伏笔的起点与回收点放在一起，检查长线叙事的闭环。",
    ],
    story_map: [
      "从全局，看见下一章",
      "对照阶段目标、章节冲突与章尾承接，梳理故事的推进方向。",
    ],
    chapter_health: [
      "给每一章，做一次细读",
      "用客观信号定位需要复核的段落；规则提示不能代替人工审稿。",
    ],
  };
  const app = document.getElementById("app");
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const badge = (value) => `<span class="pill">${esc(value)}</span>`;
  let selected = views[0].type,
    query = "",
    status = "",
    chapter = "",
    order = "chapter",
    focus = null,
    zoom = 1;
  document.getElementById("title").textContent = snapshot.title;
  document.getElementById("meta").textContent =
    `只读快照 · ${new Date(snapshot.generatedAt ?? Date.now()).toLocaleString("zh-CN")}`;
  app.innerHTML = `<aside class="sidebar"><div class="brand"><span class="brand-mark">C<span>f</span></span><div>ChapterFlow<small>故事创作工作台</small></div></div><div class="nav-caption">创作脉络 / WORKSPACE</div><nav aria-label="创作视图">${views.map((v, i) => `<button data-view="${v.type}"><span class="nav-index">0${i + 1}</span>${labels[v.type]}<span class="nav-count">${collection(v).length}</span></button>`).join("")}</nav><div class="sidebar-note"><span class="live-dot"></span> 离线创作快照<p>整理故事的复杂，<br>留住创作的自由。</p></div></aside><div class="workspace"><section class="view-heading"><div><div class="eyebrow" id="view-label"></div><h2 id="view-title"></h2><p id="view-description"></p></div><span class="edition">STORY ATLAS<br><b>创作图鉴</b></span></section><section id="overview" aria-label="视图概览"></section>
    <section class="toolbar" aria-label="筛选"><label>搜索<input id="search" type="search" placeholder="人物、事件、冲突、伏笔…"></label><label>状态<select id="status"><option value="">全部状态</option></select></label><label>章节<input id="chapter" type="number" min="1" placeholder="全部"></label><label>时间线排序<select id="order"><option value="chapter">叙述顺序（章节）</option><option value="story">故事时间（文本自然排序）</option></select></label><button id="reset">清除筛选</button><button id="export">导出数据</button><button id="print">打印 / PDF</button></section>
    <p id="counts" role="status" aria-live="polite"></p><section id="canvas"></section></div>`;
  const canvas = document.getElementById("canvas");
  const statusInput = document.getElementById("status");
  const matches = (item) =>
    !query ||
    JSON.stringify(item)
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase());
  const detail = (item) =>
    `<details><summary>展开完整资料</summary><dl>${Object.entries(item)
      .map(
        ([key, value]) =>
          `<dt>${esc(key)}</dt><dd>${esc(typeof value === "object" ? JSON.stringify(value, null, 2) : value)}</dd>`,
      )
      .join("")}</dl></details>`;
  const card = (title, body, item) =>
    `<article class="card"><h3>${esc(title)}</h3>${body}${detail(item)}</article>`;
  const paragraph = (label, value) =>
    value ? `<p><strong>${esc(label)}：</strong>${esc(value)}</p>` : "";
  function collection(v) {
    return (
      v.nodes ?? v.events ?? v.promises ?? v.foreshadows ?? v.chapters ?? []
    );
  }
  function state(item) {
    return (
      item.status ??
      (typeof item.written === "boolean"
        ? item.written
          ? "written"
          : "planned"
        : "")
    );
  }
  function atChapter(item) {
    if (!chapter) return true;
    const n = Number(chapter);
    if (selected === "character_graph") return true;
    if (selected === "promise_board")
      return (
        item.events.some((e) => e.chapterIndex === n) ||
        item.targetChapter === n
      );
    if (selected === "foreshadow_map")
      return [
        item.introducedChapter,
        item.targetChapter,
        item.resolvedChapter,
      ].includes(n);
    return Number(item.chapterIndex ?? item.index) === n;
  }
  function render() {
    const v = views.find((v) => v.type === selected);
    document.getElementById("view-label").textContent = labels[selected];
    document.getElementById("view-title").textContent =
      introductions[selected][0];
    document.getElementById("view-description").textContent =
      introductions[selected][1];
    canvas.dataset.view = selected;
    const all = collection(v);
    const stats =
      selected === "character_graph"
        ? [
            ["故事实体", all.length, "人物 · 地点 · 组织"],
            ["关系连线", v.edges.length, "沿着线索，理解动机"],
            [
              "人物角色",
              all.filter((n) => n.group === "character").length,
              "让行动与关系相互呼应",
            ],
          ]
        : selected === "promise_board" || selected === "foreshadow_map"
          ? [
              ["全部线索", all.length, "故事中的长期承接"],
              [
                "等待回收",
                all.filter((n) => n.status === "open").length,
                "持续推进读者期待",
              ],
              [
                "逾期提醒",
                all.filter((n) => n.overdue).length,
                "优先检查计划回收点",
              ],
            ]
          : [
              ["全部记录", all.length, "已确认的创作资料"],
              [
                "关联章节",
                new Set(
                  all
                    .map((n) => n.chapterIndex ?? n.index)
                    .filter((n) => n != null),
                ).size,
                "保持叙事连续性",
              ],
              ["当前视图", labels[selected], "筛选、比较与深入阅读"],
            ];
    document.getElementById("overview").innerHTML = stats
      .map(
        ([label, value, note]) =>
          `<div class="stat"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`,
      )
      .join("");
    app
      .querySelectorAll("[data-view]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.view === selected),
        ),
      );
    const states = [...new Set(collection(v).map(state).filter(Boolean))];
    statusInput.innerHTML =
      '<option value="">全部状态</option>' +
      states
        .map(
          (s) => `<option value="${esc(s)}">${esc(statuses[s] ?? s)}</option>`,
        )
        .join("");
    if (!states.includes(status)) status = "";
    statusInput.value = status;
    document.getElementById("order").disabled = selected !== "timeline";
    document.getElementById("order").closest("label").hidden =
      selected !== "timeline";
    statusInput.closest("label").hidden = states.length === 0;
    const items = collection(v).filter(
      (item) =>
        matches(item) && (!status || state(item) === status) && atChapter(item),
    );
    document.getElementById("counts").textContent =
      `${labels[selected]} · 显示 ${items.length} / ${collection(v).length} 项`;
    if (
      selected === "character_graph" &&
      (items.length || v.edges.some(matches))
    )
      return graph(v, items);
    if (!items.length) {
      canvas.innerHTML = `<div class="card empty">${collection(v).length ? "没有匹配结果，请清除筛选或更换章节。" : "暂无记录。请先确认相关章节规划、人物或事件，再重新生成快照。"}</div>`;
      return;
    }
    if (selected === "character_graph") return graph(v, items);
    if (selected === "timeline") {
      items.sort((a, b) =>
        order === "story"
          ? String(a.storyTime ?? "\uffff").localeCompare(
              String(b.storyTime ?? "\uffff"),
              "zh-CN",
              { numeric: true },
            )
          : (a.chapterIndex ?? Infinity) - (b.chapterIndex ?? Infinity),
      );
      canvas.innerHTML = `<p class="muted">故事时间按填写的文本排序；含倒叙、相对日期时，请在事件说明中明确真实先后。</p><div class="timeline">${items.map((e) => card(e.title, `${badge(e.storyTime ?? "时间未标注")}${badge(e.chapterIndex ? `第 ${e.chapterIndex} 章` : "章节未关联")}${paragraph("参与人物", e.characterNames?.join("、"))}${paragraph("事件", e.summary)}`, e)).join("")}</div>`;
    } else if (selected === "promise_board" || selected === "foreshadow_map") {
      canvas.innerHTML = `<div class="grid">${items
        .map((item) =>
          card(
            item.title,
            `${badge(statuses[item.status] ?? item.status)}${item.overdue ? '<span class="warning">已超过计划回收章</span>' : ""}${paragraph("说明", item.description ?? item.notes)}<div class="track">${(
              item.events ?? [
                { action: "埋下", chapterIndex: item.introducedChapter },
                { action: "计划回收", chapterIndex: item.targetChapter },
                { action: "实际回收", chapterIndex: item.resolvedChapter },
              ]
            )
              .filter((e) => e.chapterIndex != null)
              .map(
                (e) =>
                  `<span class="mark" title="${esc(e.note)}">${esc({ OPEN: "建立期待", ADVANCE: "推进", PAYOFF: "兑现" }[e.action] ?? e.action)} · 第 ${esc(e.chapterIndex)} 章${e.note ? `<small>${esc(e.note)}</small>` : ""}</span>`,
              )
              .join(
                '<span aria-hidden="true">→</span>',
              )}</div>${paragraph("目标章节", item.targetChapter)}${item.idleChapters !== undefined && item.status === "open" ? paragraph("距上次推进", `${item.idleChapters} 章`) : ""}`,
            item,
          ),
        )
        .join("")}</div>`;
    } else if (selected === "story_map") {
      canvas.innerHTML = `${[...(v.arc ? [v.arc] : []), ...(v.arcs ?? [])].map((arc) => card(arc.title, paragraph("阶段目标", arc.goal) + paragraph("主要冲突", arc.conflict) + paragraph("阶段回收", arc.payoff), arc)).join("")}<div class="table-wrap"><table><caption>章节推进对照表：比较行动、阻力、结果和章尾承接</caption><thead><tr><th>章节 / 状态</th><th>目标 / 冲突</th><th>结果 / 兑现</th><th>读者期待 / 章尾</th><th>情绪 / 详情</th></tr></thead><tbody>${items.map((c) => `<tr><td><strong>第 ${esc(c.index)} 章 · ${esc(c.title)}</strong><p>${badge(c.written ? "已有正文" : "规划中")}${c.arcId ? badge(c.arcId) : ""}</p></td><td>${paragraph("目标", c.goal ?? c.protagonistAction)}${paragraph("冲突", c.conflict)}</td><td>${paragraph("结果", c.outcome)}${paragraph("兑现", c.payoff)}</td><td>${paragraph("期待", c.readerExpectation)}${paragraph("章尾", c.hook)}</td><td>${esc(c.emotionTarget ?? "未标注")}${detail(c)}</td></tr>`).join("")}</tbody></table></div>`;
    } else {
      canvas.innerHTML = `<p class="muted">${esc(v.note)}</p><div class="grid">${items
        .map((c) =>
          card(
            `第 ${c.index} 章 · ${c.title}`,
            `<div class="metrics">${[
              ["字符", c.metrics.characterCount],
              ["对话占比", `${Math.round(c.metrics.dialogueRatio * 100)}%`],
              ["解释段", c.metrics.expositionRunCount],
              ["重复段", c.metrics.repeatedParagraphCount],
            ]
              .map(
                ([label, value]) =>
                  `<div>${esc(label)}<strong>${esc(value)}</strong></div>`,
              )
              .join(
                "",
              )}</div>${c.risks.map((r) => `<div class="risk"><strong>${esc(r.label)}</strong><p>${esc(r.explanation)}</p><small>${esc(r.locations.join("、"))}</small></div>`).join("") || "<p>暂无规则触发；仍需人工审稿。</p>"}`,
            c,
          ),
        )
        .join("")}</div>`;
    }
  }
  function graph(v, items) {
    const edges = v.edges.filter(
      (e) =>
        !chapter ||
        ((e.fromChapter == null || e.fromChapter <= Number(chapter)) &&
          (e.toChapter == null || e.toChapter >= Number(chapter))),
    );
    const ids = new Set(items.map((n) => n.id));
    const seeds = new Set(ids);
    if (query)
      for (const edge of edges)
        if (seeds.has(edge.source) || seeds.has(edge.target) || matches(edge)) {
          ids.add(edge.source);
          ids.add(edge.target);
        }
    let nodes = v.nodes.filter((n) => ids.has(n.id));
    if (focus) {
      const neighbors = new Set([focus]);
      edges
        .filter((e) => e.source === focus || e.target === focus)
        .forEach((e) => {
          neighbors.add(e.source);
          neighbors.add(e.target);
        });
      nodes = nodes.filter((n) => neighbors.has(n.id));
    }
    const degree = (id) =>
      edges.filter((e) => e.source === id || e.target === id).length;
    nodes.sort(
      (a, b) =>
        degree(b.id) - degree(a.id) || a.label.localeCompare(b.label, "zh-CN"),
    );
    const rings = Math.max(1, Math.ceil((nodes.length - 1) / 10));
    const width = 880 + (rings - 1) * 440,
      height = 620 + (rings - 1) * 340;
    const positions = new Map(
      nodes.map((n, i) => {
        if (i === 0) return [n.id, { x: width / 2, y: height / 2 }];
        const ring = Math.floor((i - 1) / 10),
          count = Math.min(10, nodes.length - 1 - ring * 10);
        const angle = (2 * Math.PI * ((i - 1) % 10)) / count - Math.PI / 2;
        return [
          n.id,
          {
            x: width / 2 + Math.cos(angle) * (320 + ring * 220),
            y: height / 2 + Math.sin(angle) * (230 + ring * 170),
          },
        ];
      }),
    );
    const visibleEdges = edges.filter(
      (e) => positions.has(e.source) && positions.has(e.target),
    );
    document.getElementById("counts").textContent =
      `人物关系 · ${nodes.length} / ${v.nodes.length} 个实体 · ${visibleEdges.length} 条关系`;
    canvas.innerHTML = `<div class="graph-heading"><div class="legend"><span>人物</span><span>地点</span><span>组织 / 其他</span></div><div class="toolbar"><button id="zoom-in">放大</button><button id="zoom-out">缩小</button><button id="unfocus">显示全部关系</button></div></div><div class="graph-wrap"><div class="graph-scroll"><svg role="img" aria-label="人物关系图" viewBox="0 0 ${width} ${height}" style="width:${zoom * 100}%;min-width:${Math.min(width, 580) * zoom}px;height:auto"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#85978d"/></marker></defs>${visibleEdges
      .map((e, i) => {
        const a = positions.get(e.source),
          b = positions.get(e.target);
        const bend = 16 + (i % 3) * 8;
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const midX = (a.x + b.x) / 2 - ((b.y - a.y) / length) * bend,
          midY = (a.y + b.y) / 2 + ((b.x - a.x) / length) * bend;
        const boundary = (p) => {
          const dx = midX - p.x,
            dy = midY - p.y;
          const scale = 1 / Math.max(Math.abs(dx) / 78, Math.abs(dy) / 31);
          return { x: p.x + dx * scale, y: p.y + dy * scale };
        };
        const start = boundary(a),
          end = boundary(b);
        return `<path d="M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}" fill="none" stroke="#8595b5" stroke-width="1.5" marker-end="url(#arrow)"><title>${esc(e.label)}</title></path><text x="${midX}" y="${midY}" class="edge-label">${esc(e.label.slice(0, 12))}</text>`;
      })
      .join("")}${nodes
      .map((n) => {
        const p = positions.get(n.id);
        return `<g class="node ${n.id === nodes[0]?.id ? "hub" : ""}" data-group="${esc(n.group)}" data-id="${esc(n.id)}" tabindex="0" role="button" aria-label="查看 ${esc(n.label)}" transform="translate(${p.x} ${p.y})"><rect x="-72" y="-25" width="144" height="50" rx="12"/><text text-anchor="middle" y="-2">${esc(n.label.slice(0, 10))}</text><text text-anchor="middle" y="17" class="node-type">${esc({ character: "人物", location: "地点", organization: "组织", item: "物品", rule: "规则" }[n.group] ?? n.group)}</text><title>${esc(n.label)}</title></g>`;
      })
      .join(
        "",
      )}</svg><div class="canvas-hint">点击查看资料 · 双击聚焦关联 · 箭头指向关系目标</div></div><aside class="card" id="details"><div class="eyebrow">RELATION INSIGHT</div><div class="insight-symbol">◎</div><h3>从一个人物开始</h3><p>选择图中的节点，查看人物档案与关系线索。</p><div class="insight-tip">梳理建议<strong>谁推动了冲突？</strong><span>沿着关系连线，检查人物的行动是否符合动机。</span></div></aside></div><details class="relations" open><summary>完整关系表 <span class="pill">${visibleEdges.length} 条</span></summary><div class="table-wrap"><table><thead><tr><th>来源</th><th>关系 / 说明</th><th>目标</th><th>生效章节</th></tr></thead><tbody>${visibleEdges.map((e) => `<tr><td>${esc(v.nodes.find((n) => n.id === e.source)?.label)}</td><td>${esc(e.label)}${paragraph("说明", e.notes)}</td><td>${esc(v.nodes.find((n) => n.id === e.target)?.label)}</td><td>${esc(e.fromChapter ?? "起始")} → ${esc(e.toChapter ?? "至今")}</td></tr>`).join("")}</tbody></table></div></details>`;
    document.getElementById("zoom-in").onclick = () => {
      zoom = Math.min(3, zoom + 0.2);
      render();
    };
    document.getElementById("zoom-out").onclick = () => {
      zoom = Math.max(0.5, zoom - 0.2);
      render();
    };
    document.getElementById("unfocus").onclick = () => {
      focus = null;
      render();
    };
    canvas.querySelectorAll(".node").forEach((element) => {
      const show = () => {
        canvas
          .querySelectorAll(".node")
          .forEach((node) =>
            node.classList.toggle("selected", node === element),
          );
        const n = nodes.find((n) => n.id === element.dataset.id);
        document.getElementById("details").innerHTML =
          `<h3>${esc(n.label)}</h3>${paragraph("说明", n.summary)}${edges
            .filter((e) => e.source === n.id || e.target === n.id)
            .map((e) =>
              paragraph(
                e.label,
                `${v.nodes.find((n) => n.id === e.source)?.label} → ${v.nodes.find((n) => n.id === e.target)?.label}`,
              ),
            )
            .join(
              "",
            )}${detail(n)}<button id="focus-node">只看关联人物</button>`;
        document.getElementById("focus-node").onclick = () => {
          focus = n.id;
          render();
        };
      };
      element.onclick = show;
      element.ondblclick = () => {
        focus = element.dataset.id;
        render();
      };
      element.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          show();
        }
      };
    });
  }
  app.querySelectorAll("[data-view]").forEach(
    (button) =>
      (button.onclick = () => {
        selected = button.dataset.view;
        focus = null;
        render();
      }),
  );
  document.getElementById("search").oninput = (e) => {
    query = e.target.value;
    focus = null;
    render();
  };
  statusInput.onchange = (e) => {
    status = e.target.value;
    render();
  };
  document.getElementById("chapter").oninput = (e) => {
    chapter = e.target.value;
    render();
  };
  document.getElementById("order").onchange = (e) => {
    order = e.target.value;
    render();
  };
  document.getElementById("reset").onclick = () => {
    query = status = chapter = "";
    focus = null;
    document.getElementById("search").value = "";
    document.getElementById("chapter").value = "";
    render();
  };
  document.getElementById("print").onclick = () => window.print();
  document.getElementById("export").onclick = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "chapterflow-story-snapshot.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  render();
}

const baseCss = `
*{box-sizing:border-box}body{margin:0;background:#f3f5f9;color:#203049;font:15px/1.65 system-ui,"PingFang SC",sans-serif}main{max-width:1440px;margin:auto;padding:28px}header{display:flex;justify-content:space-between;gap:20px;align-items:center}h1{font-size:26px}h3{margin:0}nav,.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}button,input,select{font:inherit;border:1px solid #c9d3e3;border-radius:8px;background:white;color:inherit;padding:8px 12px}button,summary{cursor:pointer}button[aria-pressed=true]{background:#284e92;color:white}label{display:grid;font-size:12px;gap:4px}input[type=number]{width:95px}button:focus-visible,input:focus-visible,select:focus-visible,.node:focus-visible{outline:3px solid #e0a534;outline-offset:3px}.card{background:white;border:1px solid #d9e0eb;border-radius:14px;padding:20px;margin-bottom:14px;overflow-wrap:anywhere}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:16px}.pill,.mark{background:#edf2fa;border-radius:7px;padding:4px 9px;display:inline-block;margin:3px;font-size:12px}.track{display:flex;gap:4px;flex-wrap:wrap;align-items:center}.mark small{display:block;max-width:260px}.warning,.risk{color:#934914;background:#fff5df;padding:8px;border-radius:7px}.risk{margin:10px 0}.muted,#meta,#counts{color:#67758c;font-size:13px}.metrics{display:flex;gap:16px;flex-wrap:wrap;margin:16px 0}.metrics strong{display:block;font-size:22px}.timeline{border-left:3px solid #a7bbdc;padding-left:20px}.graph-wrap{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:16px}.graph-scroll,.table-wrap{overflow:auto;background:white;border:1px solid #d9e0eb;border-radius:12px;margin:16px 0}.node{cursor:pointer}.node rect{fill:#edf2fa;stroke:#5678ac;stroke-width:2}.node text{fill:#203049;font-size:12px}.edge-label{font-size:10px;fill:#52647e;paint-order:stroke;stroke:white;stroke-width:3px}.table-wrap table{border-collapse:collapse;width:100%;min-width:740px}th,td{padding:14px;text-align:left;vertical-align:top;border-bottom:1px solid #e0e6f0}th{background:#edf2fa;position:sticky;top:0}td p{margin:5px 0}caption{padding:12px;text-align:left}details{margin-top:12px}dt{font-weight:600}dd{margin:0 0 10px;white-space:pre-wrap;overflow-wrap:anywhere}.empty{text-align:center;padding:50px}.toolbar button{align-self:end}@media(max-width:800px){main{padding:12px}.graph-wrap{grid-template-columns:1fr}header{display:block}}@media print{nav,.toolbar{display:none}.graph-scroll,.table-wrap{overflow:visible}main{max-width:none;padding:0}.card,tr{break-inside:avoid}body{background:white}.graph-wrap{display:block}}
`;

export const workbenchCss =
  baseCss +
  `
:root{--ink:#233b33;--muted:#788179;--green:#245848;--line:#e0e5de;--paper:#fafbf8}
body{background:var(--paper);color:var(--ink);font:14px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
main{max-width:none;padding:0;margin:0}header{margin-left:230px;padding:18px 36px;border-bottom:1px solid var(--line);background:#fffefb;min-height:76px}h1{font-size:16px;font-weight:600;margin:0;letter-spacing:.3px}#meta{font-size:11px;color:var(--muted)}
.sidebar{position:fixed;inset:0 auto 0 0;width:230px;background:#eef1e9;border-right:1px solid #dce2d7;padding:28px 18px;display:flex;flex-direction:column}.brand{display:flex;align-items:center;gap:12px;font-weight:700;font-size:18px;letter-spacing:-.4px}.brand small{display:block;font-size:11px;color:#69796b;letter-spacing:2px;font-weight:400}.brand-mark{width:42px;height:46px;display:grid;place-content:center;position:relative;background:var(--green);color:#f4efdc;border-radius:12px 4px 12px 4px;font:italic 32px Georgia,serif}.brand-mark span{position:absolute;font-size:20px;right:7px;bottom:5px}.nav-caption{margin:52px 12px 12px;color:#7b877b;font-size:10px;letter-spacing:1.5px}nav{display:grid;gap:7px;margin:0}nav button{display:flex;align-items:center;gap:12px;text-align:left;border:0;background:transparent;padding:13px 12px;font-size:14px;border-radius:9px}nav button[aria-pressed=true]{background:var(--green);color:#fff;box-shadow:0 5px 12px #24584818}.nav-index{font:11px Georgia,serif;opacity:.65}.nav-count{margin-left:auto;font-size:11px;opacity:.65}.sidebar-note{margin-top:auto;padding:28px 12px 0;border-top:1px solid #d9dfd4;font-size:11px;color:#667767}.sidebar-note p{font-family:serif;font-size:14px;line-height:2;margin-bottom:0}.live-dot{display:inline-block;width:6px;height:6px;background:#709779;border-radius:50%;margin-right:5px}.workspace{margin-left:230px;padding:30px 36px 60px;max-width:1700px}.view-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:24px}.eyebrow{font-size:10px;letter-spacing:2px;color:#688875;font-weight:600}h2{font-size:28px;font-weight:600;letter-spacing:-.7px;margin:6px 0 7px}.view-heading p{margin:0;color:var(--muted);font-size:12px}.edition{font:10px/2 Georgia,serif;text-align:right;color:#85907e;letter-spacing:2px;white-space:nowrap}.edition b{font:14px/2 serif;letter-spacing:4px;color:#4e6753}
#overview{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line);border-radius:12px;background:#fffefb;padding:18px 0;margin-bottom:24px}.stat{padding:0 24px;display:grid;grid-template-columns:1fr auto;align-items:center;gap:3px 12px}.stat+.stat{border-left:1px solid var(--line)}.stat>span{font-size:12px;color:#6a7a6d}.stat strong{font:600 26px/1.2 Georgia,"PingFang SC",serif;grid-column:2;grid-row:1/3}.stat small{font-size:10px;color:#90968b}
button,input,select{border-color:var(--line);border-radius:7px;font-size:12px;padding:8px 11px;background:#fffefb}button{transition:background .15s,box-shadow .15s}button:hover{background:#e8eee4}button[aria-pressed=true]:hover{background:#1e493c}button:focus-visible,input:focus-visible,select:focus-visible,.node:focus-visible{outline-color:#ae8a44}.toolbar{gap:9px;margin:0;align-items:end}.toolbar label{font-size:10px;color:#6d796e;gap:4px}.toolbar label[hidden]{display:none}.toolbar label:first-child{flex:1;min-width:170px}.toolbar input[type=search]{width:100%}input[type=number]{width:70px}#export{margin-left:auto}#counts{font-size:11px;color:#7d887b;margin:14px 0 12px}
.card{background:#fffefb;border-color:var(--line);border-radius:12px;padding:23px;box-shadow:0 3px 14px #31483403;margin-bottom:16px}.card h3{font-size:16px;font-weight:600;margin-bottom:12px}.card p{color:#687569;font-size:12px}.card p strong{color:#405a46;font-weight:500}.grid{grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}.pill,.mark{background:#edf2e9;color:#537257;font-size:10px;border-radius:5px}.warning{display:inline-block;font-size:10px;background:#f8ebd9;color:#926338;margin:3px;padding:4px 8px}.track{margin:18px 0}.mark{padding:8px 12px;border-left:2px solid #9ab394}.mark small{color:#80907d}.risk{background:#fbf1e3;color:#87633e;border-left:2px solid #d6af74;padding:12px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:16px 0;border-block:1px solid var(--line);font-size:10px;color:#7f897c}.metrics strong{font:24px/1.6 Georgia,serif;color:var(--ink)}
.graph-heading{display:flex;justify-content:space-between;align-items:center;padding:0 0 12px;gap:12px}.graph-heading .toolbar{margin:0}.legend{display:flex;gap:16px;color:#7b867a;font-size:10px}.legend span:before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:#65957c;margin-right:6px}.legend span:nth-child(2):before{background:#cbad72}.legend span:nth-child(3):before{background:#8195bd}.graph-wrap{grid-template-columns:minmax(0,1fr) 230px;gap:18px;align-items:stretch}.graph-scroll{margin:0;background-color:#fffefb;background-image:radial-gradient(#a6b7a438 .8px,transparent .8px);background-size:18px 18px;border-color:var(--line);position:relative}.graph-scroll svg{display:block;min-height:300px}.canvas-hint{font-size:10px;color:#87927f;text-align:center;padding:8px 10px 15px}.graph-wrap>.card{margin:0;padding:23px 20px;background:#f0f3eb;box-shadow:none}.insight-symbol{font:72px/1.4 Georgia,serif;color:#9aaf91;margin:20px 0 10px}.insight-tip{border-top:1px solid #dbe2d4;margin-top:25px;padding-top:18px;font-size:10px;color:#8a9481}.insight-tip strong{display:block;font-size:12px;color:#536c50;margin:6px 0}.insight-tip span{display:block;font-size:11px;line-height:1.9}.node rect{fill:#f3f8f0;stroke:#90b39b;stroke-width:1.3;filter:drop-shadow(0 3px 3px #234a3210)}.node text{fill:#325e45;font-size:13px;font-weight:600}.node .node-type{font-size:9px;fill:#83977e;font-weight:400;letter-spacing:2px}.node[data-group=location] rect{fill:#faf3e6;stroke:#cbb37a}.node[data-group=organization] rect{fill:#f0f3fa;stroke:#a4afc7}.node.hub rect{fill:#2c5c49;stroke:#2c5c49}.node.hub text{fill:#fffef0}.node.hub .node-type{fill:#bdcdbb}.node:hover rect,.node.selected rect{stroke:#b38e46;stroke-width:3}.edge-label{fill:#809084;stroke:#fffefb;stroke-width:5px;font-size:10px}.graph-scroll svg>path{stroke:#acb9ac}.relations{margin-top:24px}.relations>summary{font-weight:600;font-size:13px}.table-wrap{border-color:var(--line);border-radius:10px;margin:12px 0}table{font-size:12px}th{background:#edf1e8;color:#61715f;font-size:10px;font-weight:600;letter-spacing:.5px}th,td{padding:16px 18px;border-color:#e8ece3}tbody tr:nth-child(even){background:#fafbf7}tbody tr:hover{background:#f1f5eb}caption{color:#71816c;font-size:11px}.muted{color:#84907f;font-size:11px}details{font-size:11px}summary{color:#7c8c74}details dl{padding:12px;background:#f4f6ef;border-radius:8px}.timeline{margin:26px 0 0 14px;border-left:1px solid #b9c9b0;padding-left:28px}.timeline .card{position:relative;max-width:920px}.timeline .card:before{content:"";position:absolute;left:-34px;top:26px;width:9px;height:9px;border-radius:50%;background:#5f8260;box-shadow:0 0 0 5px var(--paper)}.empty{border-style:dashed;color:#7c8c74;padding:60px 25px}
@media(min-width:1600px){.graph-wrap{grid-template-columns:minmax(0,1fr) 280px}}
@media(max-width:1150px){.sidebar{width:190px;padding-inline:12px}.workspace,header{margin-left:190px;padding-inline:24px}.graph-wrap{grid-template-columns:minmax(0,1fr) 200px}.stat{padding-inline:16px}.stat small{display:none}.stat strong{font-size:22px}.edition{display:none}}
@media(max-width:800px){.sidebar{position:static;width:auto;padding:18px 16px 0;border-right:0;border-bottom:1px solid var(--line)}.brand{font-size:16px}.brand-mark{height:36px;width:36px;font-size:27px}.brand small{font-size:9px}.nav-caption,.sidebar-note{display:none}nav{display:flex;overflow-x:auto;flex-wrap:nowrap;gap:5px;margin:16px 0 12px}nav button{flex-shrink:0;padding:9px 12px;font-size:12px}.nav-index,.nav-count{display:none}header{margin:0;padding:14px 18px;display:block;min-height:0}h1{font-size:13px}#meta{font-size:10px;margin-top:3px}.workspace{margin:0;padding:24px 16px 36px}h2{font-size:23px}.view-heading{margin-bottom:18px}.view-heading p{font-size:11px}#overview{padding:14px 0;margin-bottom:18px}.stat{padding:0 12px;display:flex;flex-direction:column;align-items:start;gap:6px}.stat>span{font-size:10px}.stat strong{font-size:19px}.toolbar{gap:8px}.toolbar label:first-child{min-width:190px}.toolbar button{font-size:11px;padding:7px 9px}#export{margin-left:0}.graph-heading{flex-wrap:wrap}.graph-heading .toolbar{margin-left:auto}.graph-wrap{grid-template-columns:1fr}.graph-wrap>.card{padding:18px}.insight-symbol{display:none}.insight-tip{margin-top:12px;padding-top:12px}.graph-scroll svg{min-height:0}.canvas-hint{text-align:left;padding-left:16px}.grid{grid-template-columns:1fr}.card{padding:18px}.legend{gap:10px}.table-wrap table{min-width:640px}}
@media print{.sidebar,.toolbar,.edition,.canvas-hint{display:none}header,.workspace{margin:0;padding:12px 0}.graph-wrap{display:block}.graph-scroll svg{width:100%!important;min-width:0!important}.graph-scroll,.table-wrap{overflow:visible}.table-wrap table{min-width:0}#overview,.card{box-shadow:none}.workspace{max-width:none}.graph-wrap>.card{margin-top:16px}.view-heading{break-after:avoid}}
`;
