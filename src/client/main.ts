type Row = Record<string, any>;
type FieldType = "text" | "number" | "date" | "textarea" | "select" | "checkbox" | "password";
type SortDirection = "asc" | "desc";

interface Field {
  key: string;
  label: string;
  type?: FieldType;
  options?: string[] | (() => string[]);
  required?: boolean;
  full?: boolean;
}

interface AppState {
  view: string;
  data: Record<string, Row[]>;
  summary: Row;
  risks: Row[];
  reports: Row;
  search: string;
  mode: string;
  theme: string;
  week: string;
  weekMenuOpen: boolean;
  openMenu: string;
  commitmentFilters: {
    person: string;
    status: string;
    priority: string;
    category: string;
    sortBy: string;
    sortDir: SortDirection;
  };
  kpiEntryFilters: {
    person: string;
    kpi: string;
    result: string;
    periodType: string;
    sortBy: string;
    sortDir: SortDirection;
  };
  actionFilters: {
    owner: string;
    priority: string;
    status: string;
    due: string;
    sortBy: string;
    sortDir: SortDirection;
  };
  locked: boolean;
  lockEnabled: boolean;
}

const navItems = [
  ["dashboard", "Dashboard", "D"],
  ["scorecards", "KPI Tracker", "K"],
  ["commitments", "Weekly Commitments", "C"],
  ["tasks", "Actions", "A"],
  ["team", "Team", "T"],
  ["reviews", "1:1 Reviews", "R"],
  ["reports", "Reports", "P"],
  ["ai", "AI Assistant", "AI"],
  ["settings", "Settings", "S"]
];

const state: AppState = {
  view: "dashboard",
  data: {},
  summary: {},
  risks: [],
  reports: {},
  search: "",
  mode: "list",
  theme: localStorage.getItem("theme") || "light",
  week: currentMonday(),
  weekMenuOpen: false,
  openMenu: "",
  commitmentFilters: defaultCommitmentFilters(),
  kpiEntryFilters: defaultKpiEntryFilters(),
  actionFilters: defaultActionFilters(),
  locked: false,
  lockEnabled: false
};

const app = document.querySelector<HTMLDivElement>("#app")!;
const priorities = ["Low", "Medium", "High", "Critical"];
const commitmentSortColumns = ["person_id", "week_start", "title", "category", "target_value", "actual_value", "status", "priority", "due_date"];
const kpiEntrySortColumns = ["person_id", "kpi_id", "period_start", "period_type", "target_value", "actual_value", "notes"];
const actionColumns = [
  ["overdue", "Overdue"],
  ["ongoing", "Ongoing"],
  ["today", "Today"],
  ["tomorrow", "Tomorrow"],
  ["upcoming", "Upcoming"],
  ["unscheduled", "Unscheduled"],
  ["done", "Completed"]
];
let eventsBound = false;
let renderTimer: number | undefined;
document.documentElement.dataset.theme = state.theme;

const schemas: Record<string, Field[]> = {
  team_members: [
    { key: "name", label: "Name", required: true },
    { key: "role", label: "Role", required: true, full: true },
    { key: "region", label: "Region", type: "select", options: regions, required: true },
    { key: "business_type", label: "Team Area", type: "select", options: teamAreas, required: true },
    { key: "target", label: "Default Weekly Target", type: "number" },
    { key: "kpi_type", label: "KPI Type" },
    { key: "weekly_kpi_expectations", label: "Weekly KPI Expectations", type: "textarea", full: true },
    { key: "active", label: "Active", type: "checkbox" }
  ],
  kpis: [
    { key: "person_id", label: "Person", type: "select", options: memberOptions, required: true },
    { key: "name", label: "KPI Name", required: true },
    { key: "description", label: "Description", type: "textarea", full: true },
    { key: "cadence", label: "Cadence", type: "select", options: ["Weekly", "Monthly"] },
    { key: "target", label: "Default Target", type: "number" },
    { key: "unit", label: "Unit" },
    { key: "active", label: "Active", type: "checkbox" }
  ],
  weekly_kpi_entries: [
    { key: "kpi_id", label: "KPI", type: "select", options: kpiOptions, required: true },
    { key: "person_id", label: "Person", type: "select", options: memberOptions, required: true },
    { key: "period_start", label: "Week Start", type: "date", required: true },
    { key: "period_type", label: "Period Type", type: "select", options: ["Weekly", "Monthly"] },
    { key: "target_value", label: "Target Value", type: "number" },
    { key: "actual_value", label: "Actual Value", type: "number" },
    { key: "notes", label: "Notes", type: "textarea", full: true }
  ],
  commitments: [
    { key: "person_id", label: "Person", type: "select", options: memberOptions, required: true },
    { key: "week_start", label: "Week Start", type: "date", required: true },
    { key: "title", label: "Commitment Title", required: true, full: true },
    { key: "description", label: "Description", type: "textarea", full: true },
    { key: "category", label: "Category", type: "select", options: ["KPI Assignment", "KPI Review", "Follow-up", "Support", "University", "Admin", "Other"] },
    { key: "target_value", label: "Target Value", type: "number" },
    { key: "actual_value", label: "Actual Value", type: "number" },
    { key: "status", label: "Status", type: "select", options: ["Not Started", "In Progress", "Done", "Partially Done", "Missed"] },
    { key: "reason_if_missed", label: "Reason If Missed", type: "textarea", full: true },
    { key: "manager_comment", label: "Manager Comment", type: "textarea", full: true },
    { key: "priority", label: "Priority", type: "select", options: priorities },
    { key: "due_date", label: "Due Date", type: "date" }
  ],
  tasks: [
    { key: "title", label: "Action Title", required: true, full: true },
    { key: "description", label: "Description", type: "textarea", full: true },
    { key: "owner_id", label: "Owner", type: "select", options: memberOptions, required: true },
    { key: "priority", label: "Priority", type: "select", options: priorities },
    { key: "due_date", label: "Due Date", type: "date" },
    { key: "status", label: "Status", type: "select", options: ["Open", "In Progress", "Blocked", "Done", "Completed"] },
    { key: "tags", label: "Tags" },
    { key: "recurring", label: "Recurring", type: "select", options: ["No", "Weekly", "Monthly", "Quarterly"] },
    { key: "notes", label: "Notes", type: "textarea", full: true },
    { key: "completed_date", label: "Completed Date", type: "date" }
  ],
  one_to_one_reviews: [
    { key: "person_id", label: "Person", type: "select", options: memberOptions, required: true },
    { key: "review_date", label: "Date", type: "date", required: true },
    { key: "wins", label: "Wins", type: "textarea", full: true },
    { key: "blockers", label: "Blockers", type: "textarea", full: true },
    { key: "commitments_reviewed", label: "KPIs / Commitments Reviewed", type: "textarea", full: true },
    { key: "performance_notes", label: "Performance Notes", type: "textarea", full: true },
    { key: "coaching_points", label: "Coaching Points", type: "textarea", full: true },
    { key: "action_items", label: "Action Items", type: "textarea", full: true },
    { key: "manager_feedback", label: "Manager Feedback", type: "textarea", full: true },
    { key: "employee_concerns", label: "Employee Concerns", type: "textarea", full: true },
    { key: "followup_date", label: "Follow-up Date", type: "date" },
    { key: "private_manager_notes", label: "Private Manager Notes", type: "textarea", full: true }
  ],
  ai_settings: [
    { key: "enabled", label: "Enable AI", type: "checkbox" },
    { key: "provider", label: "Provider" },
    { key: "endpoint", label: "API Endpoint", full: true },
    { key: "model", label: "Model Name" },
    { key: "api_key", label: "API Key", type: "password", full: true }
  ],
  tags: [
    { key: "name", label: "Tag Name", required: true },
    { key: "color", label: "Color" }
  ]
};

init();

async function init() {
  await refresh();
  renderShell();
}

async function refresh() {
  const security = await api("/api/security/status");
  state.locked = Boolean(security.locked);
  state.lockEnabled = Boolean(security.lock_enabled);
  if (state.locked) return;
  const payload = await api("/api/bootstrap");
  state.data = payload.data;
  state.summary = payload.summary || {};
  state.risks = payload.risks || [];
  state.reports = payload.reports || {};
  state.theme = localStorage.getItem("theme") || setting("theme") || "light";
  document.documentElement.dataset.theme = state.theme;
}

function renderShell() {
  if (state.locked) {
    app.innerHTML = lockScreen();
    bind();
    focusUnlockPin();
    return;
  }

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">KT</div>
          <div>
            <div class="brand-title">Team KPI Tracker</div>
            <div class="brand-subtitle">Weekly accountability</div>
          </div>
        </div>
        <nav class="nav">
          ${navItems.map(([key, label, icon]) => `<button class="${state.view === key ? "active" : ""}" data-view="${key}"><span>${icon}</span><span>${label}</span></button>`).join("")}
        </nav>
        <div class="sidebar-footer">
          Shared KPI workspace<br />
          AI is optional and selected-data only
        </div>
      </aside>
      <main class="main">
        <div class="topbar">
          <label class="search"><span>Search</span><input id="global-search" placeholder="Search people, KPIs, actions, reviews..." value="${escapeHtml(state.search)}" /></label>
          <div class="actions">
            <button class="btn" data-refresh>Refresh</button>
            ${state.lockEnabled ? `<button class="btn" data-lock-now>Lock</button>` : ""}
            <a class="btn" href="/api/backup">Backup DB</a>
          </div>
        </div>
        <section class="content">${renderView()}</section>
      </main>
    </div>
    <div id="modal-root"></div>
  `;
  bind();
}

function lockScreen() {
  return `
    <div class="app-shell" style="grid-template-columns:1fr">
      <main class="main">
        <section class="content" style="min-height:100vh;place-content:center;max-width:520px;margin:0 auto;width:100%">
          <div class="card pad">
            <div class="brand" style="border:0;color:var(--text);padding:0 0 18px">
              <div class="brand-mark">KT</div>
              <div>
                <div class="brand-title">Team KPI Tracker</div>
                <div class="brand-subtitle" style="color:var(--muted)">Enter your local PIN</div>
              </div>
            </div>
            <div class="form-field"><label for="unlock-pin">PIN</label><input class="field" id="unlock-pin" type="text" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="PIN" /></div>
            <div class="pin-pad" aria-label="PIN keypad">
              ${["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => `<button class="btn" type="button" data-pin-digit="${digit}">${digit}</button>`).join("")}
              <button class="btn" type="button" data-pin-backspace>Back</button>
              <button class="btn" type="button" data-pin-digit="0">0</button>
              <button class="btn" type="button" data-pin-clear>Clear</button>
            </div>
            <div class="modal-footer" style="padding-left:0;padding-right:0"><button class="btn primary" data-unlock>Unlock</button></div>
          </div>
        </section>
      </main>
    </div>
  `;
}

function renderView() {
  if (state.view === "dashboard") return dashboard();
  if (state.view === "scorecards") return kpiTracker();
  if (state.view === "commitments") return commitments();
  if (state.view === "tasks") return actionsPage();
  if (state.view === "team") return teamPage();
  if (state.view === "reviews") return reviews();
  if (state.view === "reports") return reports();
  if (state.view === "ai") return aiAssistant();
  if (state.view === "settings") return settings();
  return "";
}

function dashboard() {
  const week = state.week;
  const entries = weekEntries(week);
  const commitmentsRows = weekCommitments(week);
  const assigned = entries.length;
  const met = entries.filter((e) => Number(e.actual_value) >= Number(e.target_value)).length;
  const behind = assigned - met;
  const completion = percent(met, assigned);
  const commDone = commitmentsRows.filter((r) => r.status === "Done").length;
  const overdue = (state.data.tasks || []).filter((t) => isOverdue(t.due_date) && !["Done", "Completed"].includes(t.status)).length;
  const reviews = (state.data.one_to_one_reviews || []).filter((r) => String(r.review_date) >= week && String(r.review_date) <= weekEnd(week)).length;
  const manojWork = (state.data.tasks || []).filter((t) => t.owner_id === "manoj" && !["Done", "Completed"].includes(t.status)).length
    + commitmentsRows.filter((r) => r.person_id === "manoj" && r.status !== "Done").length;
  const teamRows = state.data.team_members || [];
  const risks = weekRisks(week);
  return `
    ${title("Dashboard", "Weekly KPI assignment, progress, accountability, and follow-up visibility.", weekSelector())}
    <div class="grid cols-4">
      ${metric("Weekly KPIs Assigned", assigned, weekLabel(week))}
      ${metric("KPIs On Track", `${completion}%`, `${met}/${assigned} met or ahead`)}
      ${metric("Behind Target", behind, "Needs attention")}
      ${metric("Commitments Done", `${commDone}/${commitmentsRows.length}`, "Weekly commitments")}
      ${metric("Overdue Actions", overdue, "Past due")}
      ${metric("Reviews This Week", reviews, weekLabel(week))}
      ${metric("Manoj Workload", manojWork, "Open actions + commitments")}
      ${metric("Active Team", teamRows.filter((m) => Number(m.active) === 1).length, "People tracked")}
    </div>
    <div class="grid cols-2">
      <div class="card pad">
        <div class="toolbar"><h2>KPI Progress by Person</h2><button class="btn" data-view="scorecards">Open KPI Tracker</button></div>
        ${scorecardRows(week)}
      </div>
      <div class="card pad warning-card">
        <div class="toolbar"><h2>Warnings</h2><span class="badge High">${risks.length} active</span></div>
        ${risks.length ? risks.slice(0, 8).map((risk) => `<div class="item-card"><strong>${escapeHtml(risk.type)}: ${escapeHtml(risk.title)}</strong><span class="subtle">${escapeHtml(ownerName(risk.owner_id))} ${escapeHtml(risk.detail || "")}</span></div>`).join("") : empty("No warnings for this week.")}
      </div>
    </div>
    <div class="card pad">
      <div class="toolbar"><h2>Team Completion Trend</h2><span class="subtle">% of KPIs met each week</span></div>
      ${completionTrend()}
    </div>
    <div class="grid cols-2">
      <div class="card pad">
        <div class="toolbar"><h2>This Week's KPI Entries</h2><button class="btn" data-add="weekly_kpi_entries">Assign KPI</button></div>
        ${miniTable(entries.slice(0, 10), ["person_id", "kpi_id", "target_value", "actual_value", "notes"])}
      </div>
      <div class="card pad">
        <div class="toolbar"><h2>Weekly Commitments</h2><button class="btn" data-view="commitments">Review</button></div>
        ${miniTable(commitmentsRows.slice(0, 10), ["person_id", "title", "status", "due_date"])}
      </div>
    </div>
  `;
}

function kpiTracker() {
  const week = state.week;
  const allEntries = weekEntries(week);
  const entries = visibleKpiEntries(allEntries);
  const kpis = filtered("kpis");
  const met = allEntries.filter((e) => Number(e.actual_value) >= Number(e.target_value)).length;
  const entryColumns = ["person_id", "kpi_id", "period_start", "period_type", "target_value", "actual_value", "notes"];
  return `
    ${title("KPI Tracker", "Assign weekly KPIs to each person, enter actuals, review gaps, and export scorecards.", `${weekSelector()}<button class="btn primary" data-add="weekly_kpi_entries">Assign Weekly KPI</button><button class="btn" type="button" data-paste-kpi title="Paste HubSpot/Excel actuals into the selected week">Paste from Excel</button><button class="btn" data-duplicate-week title="Copy last week's KPI assignments into this week">Copy Last Week</button><button class="btn" data-add="kpis">Create KPI</button><button class="btn" type="button" data-kpi-import>Import KPI CSV</button><input type="file" id="kpi-csv-file" hidden accept=".csv,text/csv,.txt" /><button class="btn" type="button" data-kpi-template>Template</button>${exportLinks("weekly_kpi_entries")}`)}
    <div class="grid cols-4">
      ${metric("Assigned", allEntries.length, weekLabel(week))}
      ${metric("Met", met, "Actual >= target")}
      ${metric("Behind", allEntries.length - met, "Needs follow-up")}
      ${metric("Definitions", kpis.length, "Available KPIs")}
    </div>
    <div class="grid cols-2">
      <div class="card pad">
        <h2>Progress by Person</h2>
        ${scorecardRows(week)}
      </div>
      <div class="card">${table(kpis, "kpis", ["person_id", "name", "cadence", "target", "unit", "active"])}</div>
    </div>
    ${kpiEntryFilterBar(entries.length, allEntries.length)}
    <div class="card">${kpiEntryTable(entries, entryColumns)}</div>
  `;
}

function commitments() {
  const week = state.week;
  const all = weekCommitments(week);
  const mode = ["monday", "friday", "list"].includes(state.mode) ? state.mode : "list";
  const baseRows = mode === "friday" ? all.filter((r) => r.status !== "Done") : all;
  const rows = visibleCommitments(baseRows);
  const completion = percent(all.filter((r) => r.status === "Done").length, all.length);
  const columns = mode === "monday"
    ? ["person_id", "title", "category", "target_value", "priority", "due_date", "status"]
    : mode === "friday"
      ? ["person_id", "title", "status", "target_value", "actual_value", "reason_if_missed", "manager_comment"]
      : ["person_id", "week_start", "title", "category", "target_value", "actual_value", "status", "priority", "due_date"];
  const hint = mode === "monday"
    ? "Monday Planning: set this week's commitments, owners, priorities, and due dates."
    : mode === "friday"
      ? "Friday Review: showing commitments not yet Done — record actuals, reasons, and manager comments."
      : "All commitments for the selected week.";
  return `
    ${title("Weekly Commitments", "Use commitments for manager-visible weekly promises alongside KPI targets.", weekSelector() + actions("commitments", "Add Commitment") + `<button class="btn" data-carry-forward>Carry Forward</button>`)}
    <div class="grid cols-4">
      ${metric("Completion", `${completion}%`, `${all.filter((r) => r.status === "Done").length}/${all.length} done`)}
      ${metric("Pending", all.filter((r) => r.status !== "Done").length, "Open")}
      ${metric("Missed", all.filter((r) => r.status === "Missed").length, "Needs reason")}
      ${metric("High Priority", all.filter((r) => ["High", "Critical"].includes(r.priority)).length, "Watch closely")}
    </div>
    <div class="toolbar">
      <div class="filters"><button class="btn ${mode === "monday" ? "primary" : ""}" data-mode="monday">Monday Planning</button><button class="btn ${mode === "friday" ? "primary" : ""}" data-mode="friday">Friday Review</button><button class="btn ${mode === "list" ? "primary" : ""}" data-mode="list">List</button></div>
      <div class="actions">${exportLinks("commitments")}</div>
    </div>
    <div class="subtle">${hint}</div>
    ${commitmentFilterBar(rows.length, baseRows.length)}
    <div class="card">${commitmentTable(rows, columns)}</div>
  `;
}

function actionsPage() {
  const all = filtered("tasks");
  const rows = visibleActions(all);
  const mode = ["kanban", "list", "dashboard"].includes(state.mode) ? state.mode : "kanban";
  const content = mode === "dashboard"
    ? actionDashboard(rows, all)
    : mode === "list"
      ? actionList(rows)
      : actionBoard(rows);
  return `
    ${title("Actions", "Track follow-ups, blockers, recurring review tasks, and work needed to keep KPIs moving.", actions("tasks", "Add Action"))}
    <div class="action-stats">
      ${actionStat("Open", all.filter((r) => !isActionDone(r)).length, "Team actions")}
      ${actionStat("Due Today", all.filter((r) => !isActionDone(r) && actionBucket(r) === "today").length, "Needs focus")}
      ${actionStat("Overdue", all.filter((r) => !isActionDone(r) && actionBucket(r) === "overdue").length, "Past due")}
      ${actionStat("Done", all.filter(isActionDone).length, "Completed")}
    </div>
    <div class="toolbar action-toolbar">
      <div class="filters"><button class="btn ${mode === "kanban" ? "primary" : ""}" data-mode="kanban">Board</button><button class="btn ${mode === "list" ? "primary" : ""}" data-mode="list">List</button><button class="btn ${mode === "dashboard" ? "primary" : ""}" data-mode="dashboard">Task Dashboard</button></div>
      <div class="actions">${exportLinks("tasks")}</div>
    </div>
    ${actionFilterBar(rows.length, all.length)}
    ${content}
  `;
}

function reviews() {
  const rows = filtered("one_to_one_reviews");
  return `
    ${title("One-to-One Reviews", "Review KPI progress, blockers, coaching points, action items, and private manager notes.", actions("one_to_one_reviews", "Add 1:1 Review"))}
    <div class="grid cols-2">
      <div class="card">${table(rows, "one_to_one_reviews", ["person_id", "review_date", "wins", "blockers", "action_items", "followup_date"])}</div>
      <div class="card pad"><h2>Review Cadence</h2>${reviewTrend()}</div>
    </div>
  `;
}

function reports() {
  const week = state.week;
  const report = buildReport();
  const entries = weekEntries(week);
  const groups = new Set(entries.map((e) => e.person_id)).size;
  const overdue = (state.data.tasks || []).filter((t) => isOverdue(t.due_date) && !["Done", "Completed"].includes(t.status)).length;
  return `
    ${title("Reports", "Weekly team KPI report, individual scorecards, missed commitments, and overdue actions.", `${weekSelector()}<button class="btn" data-copy-report>Copy Markdown</button><button class="btn" data-print>PDF / Print</button><button class="btn" data-download-report>Download Markdown</button>`)}
    <div class="grid cols-3">
      ${metric("KPI Groups", groups, "By person")}
      ${metric("KPI Lines", entries.length, weekLabel(week))}
      ${metric("Overdue Actions", overdue, "Report-ready")}
    </div>
    <pre class="report" id="report-output">${escapeHtml(report)}</pre>
  `;
}

function aiAssistant() {
  const enabled = Number(state.data.ai_settings?.[0]?.enabled || 0) === 1;
  return `
    ${title("AI Assistant", "Optional DeepSeek support for KPI summaries and 1:1 preparation. The tracker works fully without AI.", "")}
    <div class="grid cols-2">
      <div class="card pad">
        <div class="ai-warning">Selected data may be sent to the AI provider. AI is ${enabled ? "enabled" : "disabled"} in Settings.</div>
        <div class="form-grid">
          <div class="form-field full"><label>AI Feature</label>${selectHtml("ai-feature", ["Weekly KPI Summary", "1:1 Preparation", "KPI Risk Review", "Manager Message Draft", "Team Performance Insights"], "Weekly KPI Summary")}</div>
          <div class="form-field full"><label>Selected Content</label><textarea id="ai-selected">${escapeHtml(JSON.stringify(aiSelection(), null, 2))}</textarea></div>
          <div class="form-field full"><label>Instruction</label><textarea id="ai-prompt">Create a concise KPI management summary with clear next actions.</textarea></div>
        </div>
        <div class="modal-footer"><button class="btn primary" data-run-ai ${enabled ? "" : "disabled"}>Run AI</button><button class="btn" data-view="settings">AI Settings</button></div>
      </div>
      <div class="card pad"><h2>Output</h2><pre class="report" id="ai-output">AI output will appear here.</pre></div>
    </div>
  `;
}

function settings() {
  const ai = state.data.ai_settings?.[0] || { id: "default" };
  return `
    ${title("Settings", "Manage team setup, KPI definitions, tags, AI, backups, restore, PIN lock, and theme.", "")}
    <div class="grid cols-2">
      <div class="card pad"><h2>AI Settings</h2><p class="subtle">Your API key is encrypted locally. AI remains optional.</p><button class="btn primary" data-edit="ai_settings" data-id="${ai.id || "default"}">Manage DeepSeek Settings</button></div>
      <div class="card pad"><h2>Backup and Restore</h2><div class="actions"><a class="btn primary" href="/api/backup">Backup SQLite Database</a><label class="btn">Restore Database<input type="file" id="restore-file" hidden accept=".sqlite,.db" /></label></div></div>
      <div class="card pad"><h2>Theme</h2><div class="actions"><button class="btn ${state.theme === "light" ? "primary" : ""}" data-theme="light">Light</button><button class="btn ${state.theme === "dark" ? "primary" : ""}" data-theme="dark">Dark</button></div></div>
      <div class="card pad">
        <h2>PIN Lock</h2>
        <p class="subtle">${state.lockEnabled ? "PIN lock is enabled for this PC." : "Set a local PIN to lock this app on this PC."}</p>
        <div class="actions"><button class="btn primary" data-pin-settings>Manage PIN</button>${state.lockEnabled ? `<button class="btn" data-lock-now>Lock Now</button>` : ""}</div>
      </div>
      <div class="card pad"><h2>Managed Lists</h2><div class="actions"><button class="btn" data-add="tags">Add Tag</button><button class="btn" data-add="kpis">Add KPI Definition</button><button class="btn" data-view="team">Manage Team</button></div></div>
      <div class="card pad"><h2>Export Data</h2><div class="actions">${["team_members", "kpis", "weekly_kpi_entries", "commitments", "tasks", "one_to_one_reviews", "tags"].map((t) => `<a class="btn" href="/api/export/${t}?format=xlsx">${labelFor(t)}</a>`).join("")}</div></div>
    </div>
  `;
}

function showPinDialog() {
  const modal = document.querySelector("#modal-root")!;
  modal.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" id="pin-dialog" role="dialog" aria-modal="true">
        <div class="modal-header"><h2>PIN Lock</h2><button class="btn" type="button" data-close>Close</button></div>
        <div class="form-grid">
          ${state.lockEnabled ? `<div class="form-field full"><label for="current-pin">Current PIN</label><input class="field" id="current-pin" type="text" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="Current PIN" /></div>` : ""}
          <div class="form-field full"><label for="new-pin">${state.lockEnabled ? "New PIN" : "PIN"}</label><input class="field" id="new-pin" type="text" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="${state.lockEnabled ? "New PIN" : "PIN"}" /></div>
        </div>
        <div class="modal-footer">
          <button class="btn" type="button" data-close>Cancel</button>
          ${state.lockEnabled ? `<button class="btn danger" type="button" data-disable-pin>Disable PIN</button>` : ""}
          <button class="btn primary" type="button" data-set-pin>${state.lockEnabled ? "Change PIN" : "Enable PIN"}</button>
        </div>
      </div>
    </div>
  `;
  const dialog = document.querySelector<HTMLElement>("#pin-dialog")!;
  dialog.addEventListener("click", async (event) => {
    event.stopPropagation();
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-close],[data-set-pin],[data-disable-pin]");
    if (!button) return;
    if (button.dataset.close !== undefined) {
      modal.innerHTML = "";
      return;
    }
    if (button.dataset.setPin !== undefined) {
      await setPinFromInputs();
      return;
    }
    if (button.dataset.disablePin !== undefined) {
      await disablePinFromInputs();
    }
  });
  dialog.addEventListener("keydown", async (event) => {
    if (event.key === "Escape") modal.innerHTML = "";
    if (event.key === "Enter") {
      event.preventDefault();
      await setPinFromInputs();
    }
  });
  setTimeout(() => {
    const field = document.querySelector<HTMLInputElement>(state.lockEnabled ? "#current-pin" : "#new-pin");
    field?.focus();
    field?.select();
  }, 0);
}

function tablePage(heading: string, subtitle: string, tableName: string, columns: string[]) {
  return `${title(heading, subtitle, actions(tableName, `Add ${heading.replace(/s$/, "")}`))}<div class="card">${table(filtered(tableName), tableName, columns)}</div>`;
}

function teamPage() {
  const columns = ["name", "role", "region", "business_type", "kpi_type", "weekly_kpi_expectations", "active"];
  const right = `
    <button class="btn primary" data-add="team_members">Add Team Member</button>
    <button class="btn" type="button" data-team-import>Import Team CSV</button>
    <input type="file" id="team-csv-file" hidden accept=".csv,text/csv,.txt" />
    <button class="btn" type="button" data-team-template>Template</button>
    ${exportLinks("team_members")}
  `;
  return `
    ${title("Team", "Maintain the people, roles, regions, KPI type, and weekly expectations.", right)}
    <div class="card">${table(filtered("team_members"), "team_members", columns)}</div>
  `;
}

function title(heading: string, subtitle: string, right: string) {
  return `<div class="page-title"><div><h1>${heading}</h1><div class="subtle">${subtitle}</div></div><div class="actions">${right}</div></div>`;
}

function actions(tableName: string, label: string) {
  return `<button class="btn primary" data-add="${tableName}">${label}</button>${exportLinks(tableName)}`;
}

function exportLinks(tableName: string) {
  return `<a class="btn" href="/api/export/${tableName}?format=csv">CSV</a><a class="btn" href="/api/export/${tableName}?format=xlsx">Excel</a>`;
}

function metric(label: string, value: any, note: string) {
  return `<div class="card pad metric"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></div>`;
}

function kpiEntryFilterBar(visibleCount: number, totalCount: number) {
  const filters = state.kpiEntryFilters;
  const periodTypeOptions = tableFilterOptions("weekly_kpi_entries", "period_type", "All Periods");
  const sortOptions = kpiEntrySortColumns.map((column) => `${column}|${labelFor(column)}`);
  return `
    <div class="toolbar table-tools">
      <div class="filters">
        <label class="compact-field"><span>Person</span>${menuSelectHtml("kpi-entry-filter-person", ["all|All People", ...memberOptions()], filters.person)}</label>
        <label class="compact-field compact-field-wide"><span>KPI</span>${menuSelectHtml("kpi-entry-filter-kpi", ["all|All KPIs", ...kpiOptions()], filters.kpi)}</label>
        <label class="compact-field"><span>Result</span>${menuSelectHtml("kpi-entry-filter-result", ["all|All Results", "met|Met / Ahead", "behind|Behind Target"], filters.result)}</label>
        <label class="compact-field"><span>Period</span>${menuSelectHtml("kpi-entry-filter-period-type", periodTypeOptions, filters.periodType)}</label>
        <label class="compact-field"><span>Sort By</span>${menuSelectHtml("kpi-entry-sort-by", sortOptions, filters.sortBy)}</label>
        <label class="compact-field compact-field-small"><span>Direction</span>${menuSelectHtml("kpi-entry-sort-dir", ["asc|Ascending", "desc|Descending"], filters.sortDir)}</label>
      </div>
      <div class="actions"><span class="subtle">${visibleCount} of ${totalCount} shown</span><button class="btn" data-kpi-entry-clear>Clear Filters</button></div>
    </div>
  `;
}

function kpiEntryTable(rows: Row[], columns: string[]) {
  if (!rows.length) return empty("No KPI entries match the selected filters.");
  return `<div class="table-wrap"><table><thead><tr>${columns.map(kpiEntryHeader).join("")}<th>Actions</th></tr></thead><tbody>${rows.map((row) => `
    <tr>${columns.map((col) => `<td>${formatCell(col, row[col])}</td>`).join("")}
      <td class="actions"><button class="btn" data-edit="weekly_kpi_entries" data-id="${row.id}">Edit</button><button class="btn danger" data-delete="weekly_kpi_entries" data-id="${row.id}">Delete</button></td>
    </tr>`).join("")}</tbody></table></div>`;
}

function kpiEntryHeader(column: string) {
  const active = state.kpiEntryFilters.sortBy === column;
  const direction = state.kpiEntryFilters.sortDir;
  const icon = active ? (direction === "asc" ? "&uarr;" : "&darr;") : "";
  return `<th><button type="button" class="sort-header ${active ? "active" : ""}" data-kpi-entry-sort="${escapeHtml(column)}"><span>${labelFor(column)}</span><span class="sort-icon" aria-hidden="true">${icon}</span></button></th>`;
}

function commitmentFilterBar(visibleCount: number, totalCount: number) {
  const filters = state.commitmentFilters;
  const statusOptions = tableFilterOptions("commitments", "status", "All Statuses");
  const priorityOptions = tableFilterOptions("commitments", "priority", "All Priorities");
  const categoryOptions = tableFilterOptions("commitments", "category", "All Categories");
  const sortOptions = commitmentSortColumns.map((column) => `${column}|${labelFor(column)}`);
  return `
    <div class="toolbar table-tools">
      <div class="filters">
        <label class="compact-field"><span>Person</span>${menuSelectHtml("commitment-filter-person", ["all|All People", ...memberOptions()], filters.person)}</label>
        <label class="compact-field"><span>Status</span>${menuSelectHtml("commitment-filter-status", statusOptions, filters.status)}</label>
        <label class="compact-field"><span>Priority</span>${menuSelectHtml("commitment-filter-priority", priorityOptions, filters.priority)}</label>
        <label class="compact-field"><span>Category</span>${menuSelectHtml("commitment-filter-category", categoryOptions, filters.category)}</label>
        <label class="compact-field"><span>Sort By</span>${menuSelectHtml("commitment-sort-by", sortOptions, filters.sortBy)}</label>
        <label class="compact-field compact-field-small"><span>Direction</span>${menuSelectHtml("commitment-sort-dir", ["asc|Ascending", "desc|Descending"], filters.sortDir)}</label>
      </div>
      <div class="actions"><span class="subtle">${visibleCount} of ${totalCount} shown</span><button class="btn" data-commitment-clear>Clear Filters</button></div>
    </div>
  `;
}

function commitmentTable(rows: Row[], columns: string[]) {
  if (!rows.length) return empty("No commitments match the selected filters.");
  return `<div class="table-wrap"><table><thead><tr>${columns.map(commitmentHeader).join("")}<th>Actions</th></tr></thead><tbody>${rows.map((row) => `
    <tr>${columns.map((col) => `<td>${formatCell(col, row[col])}</td>`).join("")}
      <td class="actions"><button class="btn" data-edit="commitments" data-id="${row.id}">Edit</button><button class="btn danger" data-delete="commitments" data-id="${row.id}">Delete</button></td>
    </tr>`).join("")}</tbody></table></div>`;
}

function commitmentHeader(column: string) {
  const active = state.commitmentFilters.sortBy === column;
  const direction = state.commitmentFilters.sortDir;
  const icon = active ? (direction === "asc" ? "&uarr;" : "&darr;") : "";
  return `<th><button type="button" class="sort-header ${active ? "active" : ""}" data-commitment-sort="${escapeHtml(column)}"><span>${labelFor(column)}</span><span class="sort-icon" aria-hidden="true">${icon}</span></button></th>`;
}

function actionFilterBar(visibleCount: number, totalCount: number) {
  const filters = state.actionFilters;
  return `
    <div class="toolbar table-tools action-filter-tools">
      <div class="filters">
        <label class="compact-field"><span>Owner</span>${menuSelectHtml("action-filter-owner", ["all|All People", ...memberOptions()], filters.owner)}</label>
        <label class="compact-field"><span>Priority</span>${menuSelectHtml("action-filter-priority", ["all|All Priorities", ...priorities.map((item) => `${item}|${item}`)], filters.priority)}</label>
        <label class="compact-field"><span>Status</span>${menuSelectHtml("action-filter-status", ["all|All Statuses", "Open|Open", "In Progress|In Progress", "Blocked|Blocked", "Done|Done", "Completed|Completed"], filters.status)}</label>
        <label class="compact-field"><span>Due</span>${menuSelectHtml("action-filter-due", ["all|All Dates", "overdue|Overdue", "ongoing|Ongoing", "today|Today", "tomorrow|Tomorrow", "upcoming|Upcoming", "unscheduled|Unscheduled", "done|Completed"], filters.due)}</label>
        <label class="compact-field"><span>Sort By</span>${menuSelectHtml("action-sort-by", ["due_date|Date", "priority|Priority", "title|Title", "owner_id|Owner", "status|Status"], filters.sortBy)}</label>
        <label class="compact-field compact-field-small"><span>Direction</span>${menuSelectHtml("action-sort-dir", ["asc|Ascending", "desc|Descending"], filters.sortDir)}</label>
      </div>
      <div class="actions"><span class="subtle">${visibleCount} of ${totalCount} shown</span><button class="btn" data-action-clear>Clear Filters</button></div>
    </div>
  `;
}

function actionBoard(rows: Row[]) {
  const grouped = Object.fromEntries(actionColumns.map(([id]) => [id, [] as Row[]]));
  rows.forEach((row) => grouped[actionBucket(row)].push(row));
  return `
    <section class="action-workspace">
      <div class="action-board">
        ${actionColumns.map(([id, label]) => actionColumn(id, label, grouped[id])).join("")}
      </div>
    </section>
  `;
}

function actionColumn(id: string, label: string, rows: Row[]) {
  return `
    <section class="action-column ${escapeHtml(id)}" data-action-column="${escapeHtml(id)}">
      <div class="action-column-head">
        <div class="action-column-title"><h3>${escapeHtml(label)}</h3></div>
        <span class="action-count">${rows.length}</span>
      </div>
      <div class="action-list">
        ${rows.length ? rows.map(actionCard).join("") : actionEmpty(id)}
        ${["today", "ongoing", "tomorrow", "upcoming", "unscheduled"].includes(id) ? `<button class="action-add-btn" type="button" data-action-add-column="${escapeHtml(id)}">Add action</button>` : ""}
      </div>
    </section>
  `;
}

function actionCard(row: Row) {
  const done = isActionDone(row);
  const notes = row.notes || row.description || "";
  const priority = String(row.priority || "Medium");
  const status = String(row.status || "Open");
  return `
    <article class="action-card ${done ? "done-state" : ""}" draggable="true" data-action-card="${escapeHtml(row.id)}">
      <div class="action-card-top">
        <button class="action-complete ${done ? "is-complete" : ""}" type="button" data-action-complete="${escapeHtml(row.id)}" aria-label="Toggle completion">${done ? "&#10003;" : ""}</button>
        <h4>${escapeHtml(row.title || "Untitled action")}</h4>
      </div>
      <p class="action-note-preview">${notes ? escapeHtml(notes) : "No notes yet"}</p>
      <div class="action-meta">
        <span class="badge ${escapeHtml(priority)}">${escapeHtml(priority)}</span>
        <span class="badge ${escapeHtml(status)}">${escapeHtml(status)}</span>
        <span class="action-chip">${escapeHtml(ownerName(row.owner_id))}</span>
        <span class="action-chip">${escapeHtml(row.due_date || "Unscheduled")}</span>
        ${row.recurring && row.recurring !== "No" ? `<span class="action-chip">${escapeHtml(row.recurring)}</span>` : ""}
      </div>
      <div class="action-card-footer">
        <button class="btn" type="button" data-edit="tasks" data-id="${escapeHtml(row.id)}">Edit</button>
        <button class="btn danger" type="button" data-delete="tasks" data-id="${escapeHtml(row.id)}">Delete</button>
      </div>
    </article>
  `;
}

function actionEmpty(columnId: string) {
  const copy: Record<string, string> = {
    overdue: "Nothing overdue",
    ongoing: "No ongoing actions",
    today: "Clear for today",
    tomorrow: "No actions scheduled",
    upcoming: "No upcoming actions",
    unscheduled: "No unscheduled actions",
    done: "No completed actions"
  };
  return `<div class="action-empty">${copy[columnId] || "No actions"}</div>`;
}

function actionList(rows: Row[]) {
  return `<div class="card">${table(rows, "tasks", ["title", "owner_id", "priority", "due_date", "status", "tags", "recurring"])}</div>`;
}

function actionDashboard(rows: Row[], allRows: Row[]) {
  const activeRows = allRows.filter((row) => !isActionDone(row));
  const people = state.data.team_members || [];
  const ownerRows = people.map((person) => {
    const owned = activeRows.filter((row) => row.owner_id === person.id);
    return { name: person.name, total: owned.length, overdue: owned.filter((row) => actionBucket(row) === "overdue").length, high: owned.filter((row) => ["High", "Critical"].includes(row.priority)).length };
  }).filter((row) => row.total || row.overdue || row.high);
  const grouped = Object.fromEntries(actionColumns.map(([id]) => [id, rows.filter((row) => actionBucket(row) === id).length]));
  return `
    <section class="action-dashboard">
      <div class="action-dashboard-summary">
        ${actionStat("Visible", rows.length, "Filtered actions")}
        ${actionStat("Active", activeRows.length, "Not completed")}
        ${actionStat("High", activeRows.filter((row) => ["High", "Critical"].includes(row.priority)).length, "Priority watch")}
        ${actionStat("Recurring", allRows.filter((row) => row.recurring && row.recurring !== "No").length, "Repeating")}
      </div>
      <div class="grid cols-2">
        <div class="card pad">
          <div class="toolbar"><h2>Work by Bucket</h2><span class="subtle">Visible actions</span></div>
          ${actionColumns.map(([id, label]) => `<div class="chart-row"><strong>${escapeHtml(label)}</strong><div class="bar"><span style="width:${percent(grouped[id], Math.max(1, rows.length))}%"></span></div><span>${grouped[id]}</span></div>`).join("")}
        </div>
        <div class="card pad">
          <div class="toolbar"><h2>Owner Load</h2><span class="subtle">Active actions</span></div>
          ${ownerRows.length ? ownerRows.map((row) => `<div class="item-card"><strong>${escapeHtml(row.name)}</strong><span class="subtle">${row.total} active &middot; ${row.overdue} overdue &middot; ${row.high} high priority</span></div>`).join("") : empty("No active owner workload.")}
        </div>
      </div>
    </section>
  `;
}

function actionStat(label: string, value: any, note: string) {
  return metric(label, value, note);
}

function table(rows: Row[], tableName: string, columns: string[]) {
  if (!rows.length) return empty("No records yet.");
  return `<div class="table-wrap"><table><thead><tr>${columns.map((c) => `<th>${labelFor(c)}</th>`).join("")}<th>Actions</th></tr></thead><tbody>${rows.map((row) => `
    <tr>${columns.map((col) => `<td>${formatCell(col, row[col])}</td>`).join("")}
      <td class="actions"><button class="btn" data-edit="${tableName}" data-id="${row.id}">Edit</button><button class="btn danger" data-delete="${tableName}" data-id="${row.id}">Delete</button></td>
    </tr>`).join("")}</tbody></table></div>`;
}

function miniTable(rows: Row[], columns: string[]) {
  if (!rows.length) return empty("Nothing to show.");
  return `<div class="table-wrap"><table><thead><tr>${columns.map((c) => `<th>${labelFor(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((c) => `<td>${formatCell(c, row[c])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function kanban(rows: Row[], tableName: string, field: string, lanes: string[]) {
  return `<div class="kanban">${lanes.map((lane) => `<div class="lane"><h3>${lane}</h3>${rows.filter((r) => (r[field] || "Open") === lane).map((row) => `<div class="item-card"><strong>${escapeHtml(row.title || row.name)}</strong><span class="subtle">${escapeHtml(ownerName(row.owner_id || row.person_id))}</span><span class="badge ${escapeHtml(row.priority || row.status || lane)}">${escapeHtml(row.priority || row.status || lane)}</span><button class="btn" data-edit="${tableName}" data-id="${row.id}">Edit</button></div>`).join("") || empty("No items.")}</div>`).join("")}</div>`;
}

function reviewTrend() {
  return (state.data.team_members || []).map((p) => {
    const reviews = (state.data.one_to_one_reviews || []).filter((r) => r.person_id === p.id).length;
    const actions = (state.data.one_to_one_reviews || []).filter((r) => r.person_id === p.id && r.action_items).length;
    return `<div class="chart-row"><strong>${p.name}</strong><div class="bar"><span style="width:${Math.min(100, reviews * 20)}%"></span></div><span>${reviews} reviews</span></div><div class="subtle">${actions} with action items</div>`;
  }).join("");
}

function scorecardRows(week = state.week) {
  const entries = weekEntries(week);
  return (state.data.team_members || []).map((p) => {
    const mine = entries.filter((e) => e.person_id === p.id);
    const target = sum(mine, "target_value");
    const actual = sum(mine, "actual_value");
    const pct = percent(actual, target);
    const color = mine.length ? barColor(pct) : "transparent";
    return `<div class="chart-row"><strong>${escapeHtml(p.name)}</strong><div class="bar"><span style="width:${pct}%;background:${color}"></span></div><span>${mine.length ? `${pct}%` : "—"}</span></div>`;
  }).join("");
}

function barColor(pct: number) {
  if (pct >= 80) return "var(--success)";
  if (pct >= 50) return "var(--primary)";
  return "var(--danger)";
}

function buildReport() {
  const week = state.week;
  const entries = weekEntries(week);
  const comm = weekCommitments(week);
  const team = state.data.team_members || [];
  const assigned = entries.length;
  const met = entries.filter((e) => Number(e.actual_value) >= Number(e.target_value)).length;

  const kpiSummary = team.map((p) => {
    const mine = entries.filter((e) => e.person_id === p.id);
    if (!mine.length) return "";
    const personMet = mine.filter((e) => Number(e.actual_value) >= Number(e.target_value)).length;
    return `- ${p.name}: ${personMet}/${mine.length} KPIs met`;
  }).filter(Boolean).join("\n") || "- No KPI entries recorded.";

  const kpiDetails = entries.map((e) => `- ${ownerName(e.person_id)}: ${kpiName(e.kpi_id)} ${e.actual_value}/${e.target_value} ${e.notes || ""}`).join("\n") || "- No KPI details recorded.";

  const commitments = team.map((p) => {
    const mine = comm.filter((c) => c.person_id === p.id);
    if (!mine.length) return "";
    const done = mine.filter((c) => c.status === "Done").length;
    return `- ${p.name}: ${done}/${mine.length} commitments done`;
  }).filter(Boolean).join("\n") || "- No commitments recorded.";

  const risks = weekRisks(week).map((r) => `- ${r.type}: ${r.title} (${ownerName(r.owner_id)}) ${r.detail || ""}`).join("\n") || "- No active warnings.";
  const overdue = (state.data.tasks || [])
    .filter((t) => isOverdue(t.due_date) && !["Done", "Completed"].includes(t.status))
    .map((t) => `- ${t.title} owner ${ownerName(t.owner_id)} due ${t.due_date}`).join("\n") || "- None.";

  return `# Weekly KPI Report — Week of ${week} (${weekLabel(week)})

Team KPI completion: ${percent(met, assigned)}% (${met}/${assigned} met)

## KPI Summary
${kpiSummary}

## KPI Details
${kpiDetails}

## Commitments
${commitments}

## Warnings
${risks}

## Overdue Actions
${overdue}

## Suggested Manager Actions
- Confirm every person has clear weekly KPI targets.
- Review people behind target before Friday.
- Turn blockers into owner-specific actions.
`;
}

function aiSelection() {
  return {
    week: state.week,
    team: filtered("team_members"),
    kpi_entries: weekEntries(state.week).slice(0, 60),
    kpis: filtered("kpis").slice(0, 60),
    commitments: weekCommitments(state.week).slice(0, 40),
    actions: filtered("tasks").slice(0, 40)
  };
}

function showForm(tableName: string, id = "") {
  const fields = schemas[tableName];
  if (!fields) {
    toast("Form not configured.");
    return;
  }
  const row = id ? (state.data[tableName] || []).find((item) => item.id === id) || {} : defaultsFor(tableName);
  const modal = document.querySelector("#modal-root")!;
  modal.innerHTML = `
    <div class="modal-backdrop">
      <form class="modal" id="entity-form" data-table="${escapeHtml(tableName)}" data-id="${escapeHtml(id)}">
        <div class="modal-header"><h2>${id ? "Edit" : "Add"} ${labelFor(tableName)}</h2><button class="btn" type="button" data-close>Close</button></div>
        <div class="form-grid">${fields.map((field) => fieldHtml(field, row[field.key])).join("")}</div>
        <div class="modal-footer"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-save>Save</button></div>
      </form>
    </div>
  `;
  const form = document.querySelector<HTMLFormElement>("#entity-form")!;
  form.addEventListener("click", async (event) => {
    event.stopPropagation();
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-close],[data-save]");
    if (!button) return;
    if (button.dataset.close !== undefined) {
      modal.innerHTML = "";
      return;
    }
    if (button.dataset.save !== undefined) {
      await saveEntityForm(form);
    }
  });
}

function fieldHtml(field: Field, value: any) {
  const type = field.type || "text";
  const options = typeof field.options === "function" ? field.options() : field.options || [];
  const common = `name="${field.key}" ${field.required ? "required" : ""}`;
  const content = type === "textarea"
    ? `<textarea ${common}>${escapeHtml(value || "")}</textarea>`
    : type === "select"
      ? `<select ${common}>${options.map((option) => `<option value="${escapeHtml(optionValue(option))}" ${String(value ?? "") === optionValue(option) ? "selected" : ""}>${escapeHtml(optionLabel(option))}</option>`).join("")}</select>`
      : type === "checkbox"
        ? `<input ${common} type="checkbox" ${Number(value ?? 1) === 1 ? "checked" : ""} />`
        : `<input class="field" ${common} type="${type}" value="${escapeHtml(value ?? "")}" />`;
  return `<div class="form-field ${field.full ? "full" : ""}"><label>${field.label}</label>${content}</div>`;
}

function defaultsFor(tableName: string) {
  const base: Row = {};
  if (tableName === "commitments") Object.assign(base, { week_start: currentMonday(), status: "Not Started", priority: "Medium", category: "KPI Assignment", due_date: today() });
  if (tableName === "tasks") Object.assign(base, { status: "Open", priority: "Medium", due_date: today(), recurring: "No" });
  if (tableName === "one_to_one_reviews") Object.assign(base, { review_date: today(), followup_date: today() });
  if (tableName === "kpis") Object.assign(base, { cadence: "Weekly", active: 1, unit: "count" });
  if (tableName === "weekly_kpi_entries") {
    const firstKpi = (state.data.kpis || []).find((kpi) => Number(kpi.active) === 1) || state.data.kpis?.[0];
    Object.assign(base, {
      kpi_id: firstKpi?.id || "",
      person_id: firstKpi?.person_id || "",
      period_start: currentMonday(),
      period_type: "Weekly",
      target_value: Number(firstKpi?.target || 0),
      actual_value: 0
    });
  }
  if (tableName === "tags") Object.assign(base, { color: "#2563eb" });
  return base;
}

function bind() {
  document.querySelector("#global-search")?.addEventListener("input", (event) => {
    state.search = (event.target as HTMLInputElement).value;
    renderShell();
  });
  if (eventsBound) return;
  eventsBound = true;
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("dragstart", handleActionDragStart);
  document.addEventListener("dragend", handleActionDragEnd);
  document.addEventListener("dragover", handleActionDragOver);
  document.addEventListener("dragleave", handleActionDragLeave);
  document.addEventListener("drop", handleActionDrop);
}

function focusUnlockPin() {
  setTimeout(() => {
    const input = document.querySelector<HTMLInputElement>("#unlock-pin");
    input?.focus();
    input?.select();
  }, 0);
}

function appendUnlockPin(value: string) {
  const input = document.querySelector<HTMLInputElement>("#unlock-pin");
  if (!input) return;
  input.value = `${input.value}${value}`.slice(0, 12);
  input.focus();
}

function backspaceUnlockPin() {
  const input = document.querySelector<HTMLInputElement>("#unlock-pin");
  if (!input) return;
  input.value = input.value.slice(0, -1);
  input.focus();
}

function clearUnlockPin() {
  const input = document.querySelector<HTMLInputElement>("#unlock-pin");
  if (!input) return;
  input.value = "";
  input.focus();
}

async function unlockFromInput() {
  const pin = (document.querySelector("#unlock-pin") as HTMLInputElement)?.value || "";
  try {
    await api("/api/security/unlock", { method: "POST", body: JSON.stringify({ pin }) });
    await refresh();
    renderShell();
  } catch (error) {
    toast(error instanceof Error ? error.message : "Unlock failed.");
    clearUnlockPin();
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (!state.locked && event.key === "Escape" && state.openMenu) {
    event.preventDefault();
    state.openMenu = "";
    renderShell();
    return;
  }
  if (!state.locked) return;
  if (/^\d$/.test(event.key)) {
    event.preventDefault();
    appendUnlockPin(event.key);
    return;
  }
  if (event.key === "Backspace") {
    event.preventDefault();
    backspaceUnlockPin();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    clearUnlockPin();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    void unlockFromInput();
  }
}

async function handleSubmit(event: SubmitEvent) {
  const form = (event.target as HTMLElement | null)?.closest<HTMLFormElement>("#entity-form");
  if (!form) return;
  event.preventDefault();
  await saveEntityForm(form);
}

async function setPinFromInputs() {
  const pin = (document.querySelector("#new-pin") as HTMLInputElement)?.value || "";
  const currentPin = (document.querySelector("#current-pin") as HTMLInputElement | null)?.value || "";
  const wasEnabled = state.lockEnabled;
  if (pin.length < 4) {
    toast("PIN must be at least 4 characters.");
    return;
  }
  if (wasEnabled && !currentPin) {
    toast("Enter the current PIN first.");
    return;
  }
  try {
    await api("/api/security/set-pin", { method: "POST", body: JSON.stringify({ pin, current_pin: currentPin }) });
    document.querySelector("#modal-root")!.innerHTML = "";
    await refresh();
    renderShell();
    toast(wasEnabled ? "PIN changed." : "PIN lock enabled.");
  } catch (error) {
    toast(error instanceof Error ? error.message : "PIN update failed.");
  }
}

async function disablePinFromInputs() {
  const pin = (document.querySelector("#current-pin") as HTMLInputElement)?.value || "";
  if (state.lockEnabled && !pin) {
    toast("Enter the current PIN first.");
    return;
  }
  try {
    await api("/api/security/disable", { method: "POST", body: JSON.stringify({ pin }) });
    document.querySelector("#modal-root")!.innerHTML = "";
    await refresh();
    renderShell();
    toast("PIN lock disabled.");
  } catch (error) {
    toast(error instanceof Error ? error.message : "PIN disable failed.");
  }
}

async function saveEntityForm(form: HTMLFormElement) {
  const tableName = form.dataset.table || "";
  const id = form.dataset.id || "";
  const fields = schemas[tableName];
  if (!fields) {
    toast("Form not configured.");
    return;
  }
  const payload: Row = {};
  for (const field of fields) {
    const input = form.elements.namedItem(field.key) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    if (!input) continue;
    payload[field.key] = field.type === "checkbox" ? ((input as HTMLInputElement).checked ? 1 : 0) : field.type === "number" ? Number(input.value || 0) : input.value;
    if (field.required && !payload[field.key]) {
      toast(`${field.label} is required.`);
      return;
    }
  }
  try {
    if (id) await updateTableRow(tableName, id, payload);
    else await api(tableApiUrl(tableName), { method: "POST", body: JSON.stringify(payload) });
    document.querySelector("#modal-root")!.innerHTML = "";
    await refresh();
    renderShell();
    toast("Saved.");
  } catch (error) {
    toast(error instanceof Error ? error.message : "Save failed.");
  }
}

async function handleClick(event: Event) {
  const target = event.target as HTMLElement;
  if (state.weekMenuOpen && !target.closest(".week-nav")) {
    state.weekMenuOpen = false;
    closeWeekMenuDom();
  }
  if (state.openMenu && !target.closest(".filter-menu")) {
    state.openMenu = "";
    closeFilterMenuDom();
  }
  const button = target.closest<HTMLElement>("[data-view],[data-add],[data-edit],[data-delete],[data-save],[data-close],[data-refresh],[data-mode],[data-carry-forward],[data-theme],[data-copy-report],[data-download-report],[data-print],[data-run-ai],[data-unlock],[data-pin-digit],[data-pin-backspace],[data-pin-clear],[data-pin-settings],[data-set-pin],[data-disable-pin],[data-lock-now],[data-week-prev],[data-week-next],[data-week-current],[data-week-toggle],[data-week-pick],[data-duplicate-week],[data-team-import],[data-team-template],[data-kpi-import],[data-kpi-template],[data-paste-kpi],[data-commitment-sort],[data-commitment-clear],[data-kpi-entry-sort],[data-kpi-entry-clear],[data-action-clear],[data-action-complete],[data-action-add-column],[data-filter-toggle],[data-filter-option]");
  if (!button) return;
  if (button.dataset.filterToggle) {
    state.openMenu = state.openMenu === button.dataset.filterToggle ? "" : button.dataset.filterToggle;
    renderShell();
    return;
  }
  if (button.dataset.filterOption) {
    const updated = applyFilterValue(button.dataset.filterOption, button.dataset.value || "");
    state.openMenu = "";
    if (updated) renderShell();
    return;
  }
  if (button.dataset.kpiEntrySort) {
    const sortBy = button.dataset.kpiEntrySort;
    state.kpiEntryFilters.sortDir = state.kpiEntryFilters.sortBy === sortBy && state.kpiEntryFilters.sortDir === "asc" ? "desc" : "asc";
    state.kpiEntryFilters.sortBy = sortBy;
    renderShell();
    return;
  }
  if (button.dataset.kpiEntryClear !== undefined) {
    state.kpiEntryFilters = defaultKpiEntryFilters();
    renderShell();
    return;
  }
  if (button.dataset.actionClear !== undefined) {
    state.actionFilters = defaultActionFilters();
    renderShell();
    return;
  }
  if (button.dataset.actionComplete) {
    await toggleActionComplete(button.dataset.actionComplete);
    return;
  }
  if (button.dataset.actionAddColumn) {
    showTaskFormForColumn(button.dataset.actionAddColumn);
    return;
  }
  if (button.dataset.commitmentSort) {
    const sortBy = button.dataset.commitmentSort;
    state.commitmentFilters.sortDir = state.commitmentFilters.sortBy === sortBy && state.commitmentFilters.sortDir === "asc" ? "desc" : "asc";
    state.commitmentFilters.sortBy = sortBy;
    renderShell();
    return;
  }
  if (button.dataset.commitmentClear !== undefined) {
    state.commitmentFilters = defaultCommitmentFilters();
    renderShell();
    return;
  }
  if (button.dataset.weekToggle !== undefined) {
    state.weekMenuOpen = !state.weekMenuOpen;
    renderShell();
    return;
  }
  if (button.dataset.weekPick !== undefined) {
    state.week = button.dataset.weekPick;
    state.weekMenuOpen = false;
    renderShell();
    return;
  }
  if (button.dataset.weekPrev !== undefined) {
    state.week = shiftWeek(state.week, -1);
    state.weekMenuOpen = false;
    renderShell();
    return;
  }
  if (button.dataset.weekNext !== undefined) {
    state.week = shiftWeek(state.week, 1);
    state.weekMenuOpen = false;
    renderShell();
    return;
  }
  if (button.dataset.weekCurrent !== undefined) {
    state.week = currentMonday();
    state.weekMenuOpen = false;
    renderShell();
    return;
  }
  if (button.dataset.duplicateWeek !== undefined) {
    await duplicateWeek();
    return;
  }
  if (button.dataset.teamImport !== undefined) {
    document.querySelector<HTMLInputElement>("#team-csv-file")?.click();
    return;
  }
  if (button.dataset.teamTemplate !== undefined) {
    downloadTeamCsvTemplate();
    return;
  }
  if (button.dataset.kpiImport !== undefined) {
    document.querySelector<HTMLInputElement>("#kpi-csv-file")?.click();
    return;
  }
  if (button.dataset.kpiTemplate !== undefined) {
    downloadKpiCsvTemplate();
    return;
  }
  if (button.dataset.pasteKpi !== undefined) {
    showPasteDialog();
    return;
  }
  if (button.dataset.view) {
    state.view = button.dataset.view;
    state.mode = state.view === "tasks" ? "kanban" : "list";
    renderShell();
    return;
  }
  if (button.dataset.mode) {
    state.mode = button.dataset.mode;
    renderShell();
    return;
  }
  if (button.dataset.add) return showForm(button.dataset.add);
  if (button.dataset.edit) return showForm(button.dataset.edit, button.dataset.id || "");
  if (button.dataset.save !== undefined) {
    const form = button.closest<HTMLFormElement>("#entity-form");
    if (form) await saveEntityForm(form);
    return;
  }
  if (button.dataset.close !== undefined) {
    document.querySelector("#modal-root")!.innerHTML = "";
    return;
  }
  if (button.dataset.refresh !== undefined) {
    await refresh();
    renderShell();
    toast("Refreshed.");
    return;
  }
  if (button.dataset.delete) {
    if (!confirm("Delete this record?")) return;
    await deleteTableRow(button.dataset.delete, button.dataset.id || "");
    await refresh();
    renderShell();
    toast("Deleted.");
    return;
  }
  if (button.dataset.carryForward !== undefined) {
    const result = await api("/api/commitments/carry-forward", { method: "POST", body: JSON.stringify({ week_start: currentMonday() }) });
    await refresh();
    renderShell();
    toast(`Carried forward ${result.created} commitments.`);
    return;
  }
  if (button.dataset.theme) {
    state.theme = button.dataset.theme;
    localStorage.setItem("theme", state.theme);
    document.documentElement.dataset.theme = state.theme;
    renderShell();
    return;
  }
  if (button.dataset.copyReport !== undefined) {
    await navigator.clipboard.writeText(buildReport());
    toast("Report copied.");
    return;
  }
  if (button.dataset.downloadReport !== undefined) return download("weekly-kpi-report.md", buildReport(), "text/markdown");
  if (button.dataset.print !== undefined) return window.print();
  if (button.dataset.runAi !== undefined) return runAi();
  if (button.dataset.pinSettings !== undefined) {
    showPinDialog();
    return;
  }
  if (button.dataset.pinDigit) {
    appendUnlockPin(button.dataset.pinDigit);
    return;
  }
  if (button.dataset.pinBackspace !== undefined) {
    backspaceUnlockPin();
    return;
  }
  if (button.dataset.pinClear !== undefined) {
    clearUnlockPin();
    return;
  }
  if (button.dataset.unlock !== undefined) {
    await unlockFromInput();
    return;
  }
  if (button.dataset.setPin !== undefined) {
    await setPinFromInputs();
    return;
  }
  if (button.dataset.disablePin !== undefined) {
    await disablePinFromInputs();
    return;
  }
  if (button.dataset.lockNow !== undefined) {
    await api("/api/security/lock", { method: "POST" });
    await refresh();
    renderShell();
  }
}

function handleActionDragStart(event: DragEvent) {
  const target = event.target as HTMLElement;
  if (target.closest("button,a,input,select,textarea")) return;
  const card = target.closest<HTMLElement>("[data-action-card]");
  if (!card || state.view !== "tasks") return;
  event.dataTransfer?.setData("text/plain", card.dataset.actionCard || "");
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  card.classList.add("dragging");
}

function handleActionDragEnd() {
  document.querySelectorAll(".action-card.dragging").forEach((card) => card.classList.remove("dragging"));
  document.querySelectorAll(".action-column.drop-target").forEach((column) => column.classList.remove("drop-target"));
}

function handleActionDragOver(event: DragEvent) {
  const column = (event.target as HTMLElement).closest<HTMLElement>("[data-action-column]");
  if (!column || state.view !== "tasks") return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".action-column.drop-target").forEach((item) => {
    if (item !== column) item.classList.remove("drop-target");
  });
  column.classList.add("drop-target");
}

function handleActionDragLeave(event: DragEvent) {
  const column = (event.target as HTMLElement).closest<HTMLElement>("[data-action-column]");
  if (!column) return;
  const next = event.relatedTarget as Node | null;
  if (!next || !column.contains(next)) column.classList.remove("drop-target");
}

async function handleActionDrop(event: DragEvent) {
  const column = (event.target as HTMLElement).closest<HTMLElement>("[data-action-column]");
  if (!column || state.view !== "tasks") return;
  event.preventDefault();
  column.classList.remove("drop-target");
  const id = event.dataTransfer?.getData("text/plain") || document.querySelector<HTMLElement>(".action-card.dragging")?.dataset.actionCard || "";
  await moveActionToColumn(id, column.dataset.actionColumn || "");
}

function closeWeekMenuDom() {
  document.querySelector(".week-menu")?.remove();
  document.querySelector("[data-week-toggle]")?.setAttribute("aria-expanded", "false");
}

function closeFilterMenuDom() {
  document.querySelector(".filter-menu-list")?.remove();
  document.querySelector("[data-filter-toggle][aria-expanded='true']")?.setAttribute("aria-expanded", "false");
}

async function handleChange(event: Event) {
  const control = event.target as HTMLInputElement | HTMLSelectElement;
  if (updateKpiEntryFilters(control) || updateCommitmentFilters(control)) {
    queueRender();
    return;
  }
  const form = control.closest<HTMLFormElement>("#entity-form");
  if (form?.dataset.table === "weekly_kpi_entries" && control.name === "kpi_id") {
    syncWeeklyKpiForm(form, control.value);
  }
  if (control instanceof HTMLInputElement && control.id === "team-csv-file" && control.files?.[0]) {
    await importTeamCsv(control.files[0]);
    control.value = "";
    return;
  }
  if (control instanceof HTMLInputElement && control.id === "kpi-csv-file" && control.files?.[0]) {
    await importKpiCsv(control.files[0]);
    control.value = "";
    return;
  }
  if (control.id === "week-jump") {
    const jumped = normalizeWeek(control.value);
    if (jumped) {
      state.week = jumped;
      state.weekMenuOpen = false;
      renderShell();
    }
    return;
  }
  if (control.id === "paste-data") {
    const preview = document.querySelector("#paste-preview");
    if (preview) preview.innerHTML = pastePreviewHtml(control.value);
    return;
  }
  if (control instanceof HTMLInputElement && control.id === "restore-file" && control.files?.[0]) {
    if (!confirm("Restore will replace the current database. Continue?")) return;
    const buffer = await control.files[0].arrayBuffer();
    await api("/api/restore", { method: "POST", body: JSON.stringify({ base64: arrayBufferToBase64(buffer) }) });
    await refresh();
    renderShell();
    toast("Database restored.");
  }
}

function syncWeeklyKpiForm(form: HTMLFormElement, kpiId: string) {
  const kpi = (state.data.kpis || []).find((item) => item.id === kpiId);
  if (!kpi) return;
  const person = form.elements.namedItem("person_id") as HTMLSelectElement | null;
  const target = form.elements.namedItem("target_value") as HTMLInputElement | null;
  if (person) person.value = String(kpi.person_id || "");
  if (target) target.value = String(kpi.target || 0);
}

function showTaskFormForColumn(columnId: string) {
  showForm("tasks");
  const form = document.querySelector<HTMLFormElement>("#entity-form");
  if (!form) return;
  const status = form.elements.namedItem("status") as HTMLSelectElement | null;
  const dueDate = form.elements.namedItem("due_date") as HTMLInputElement | null;
  if (status) status.value = columnId === "ongoing" ? "In Progress" : columnId === "done" ? "Done" : "Open";
  if (dueDate) {
    if (columnId === "today" || columnId === "ongoing") dueDate.value = today();
    else if (columnId === "tomorrow") dueDate.value = offsetDate(1);
    else if (columnId === "upcoming") dueDate.value = offsetDate(7);
    else if (columnId === "overdue") dueDate.value = offsetDate(-1);
    else if (columnId === "unscheduled") dueDate.value = "";
  }
}

async function toggleActionComplete(id: string) {
  const row = (state.data.tasks || []).find((item) => item.id === id);
  if (!row) return;
  const done = isActionDone(row);
  await updateTableRow("tasks", id, { status: done ? "Open" : "Done", completed_date: done ? "" : today() });
  await refresh();
  renderShell();
  toast(done ? "Action reopened." : "Action completed.");
}

async function moveActionToColumn(id: string, columnId: string) {
  const row = (state.data.tasks || []).find((item) => item.id === id);
  if (!row || !columnId || !actionColumns.some(([value]) => value === columnId)) return;
  const currentBucket = actionBucket(row);
  if (currentBucket === columnId) return;
  await updateTableRow("tasks", id, actionColumnUpdate(row, columnId));
  await refresh();
  renderShell();
  toast(`Moved to ${actionColumnLabel(columnId)}.`);
}

function actionColumnUpdate(row: Row, columnId: string) {
  const keepBlocked = String(row.status || "") === "Blocked";
  const statusForDate = keepBlocked ? "Blocked" : "Open";
  if (columnId === "overdue") return { status: statusForDate, due_date: offsetDate(-1), completed_date: "" };
  if (columnId === "ongoing") return { status: "In Progress", due_date: row.due_date || today(), completed_date: "" };
  if (columnId === "today") return { status: statusForDate, due_date: today(), completed_date: "" };
  if (columnId === "tomorrow") return { status: statusForDate, due_date: offsetDate(1), completed_date: "" };
  if (columnId === "upcoming") return { status: statusForDate, due_date: offsetDate(7), completed_date: "" };
  if (columnId === "unscheduled") return { status: statusForDate, due_date: "", completed_date: "" };
  return { status: "Done", completed_date: today() };
}

function actionColumnLabel(columnId: string) {
  return actionColumns.find(([value]) => value === columnId)?.[1] || "column";
}

async function runAi() {
  const output = document.querySelector("#ai-output")!;
  output.textContent = "Working...";
  try {
    const feature = (document.querySelector("#ai-feature") as HTMLSelectElement).value;
    const prompt = (document.querySelector("#ai-prompt") as HTMLTextAreaElement).value;
    const selectedData = JSON.parse((document.querySelector("#ai-selected") as HTMLTextAreaElement).value || "{}");
    const result = await api("/api/ai/generate", { method: "POST", body: JSON.stringify({ feature, prompt, selectedData }) });
    output.textContent = result.output;
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : "AI request failed.";
  }
}

async function api(url: string, options: RequestInit = {}) {
  const response = await fetch(url, { headers: { "content-type": "application/json" }, ...options });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}

function tableApiUrl(tableName: string, id = "") {
  return `/api/table/${encodeURIComponent(tableName)}${id ? `?id=${encodeURIComponent(id)}` : ""}`;
}

function updateTableRow(tableName: string, id: string, row: Row) {
  return api("/api/row", { method: "POST", body: JSON.stringify({ action: "update", table: tableName, id, row }) });
}

function deleteTableRow(tableName: string, id: string) {
  return api("/api/row", { method: "POST", body: JSON.stringify({ action: "delete", table: tableName, id }) });
}

function filtered(tableName: string) {
  const rows = state.data[tableName] || [];
  if (!state.search) return rows;
  const needle = state.search.toLowerCase();
  return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(needle));
}

function queueRender() {
  if (renderTimer) window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    renderTimer = undefined;
    renderShell();
  }, 0);
}

function defaultCommitmentFilters() {
  return {
    person: "all",
    status: "all",
    priority: "all",
    category: "all",
    sortBy: "person_id",
    sortDir: "asc" as SortDirection
  };
}

function defaultKpiEntryFilters() {
  return {
    person: "all",
    kpi: "all",
    result: "all",
    periodType: "all",
    sortBy: "person_id",
    sortDir: "asc" as SortDirection
  };
}

function defaultActionFilters() {
  return {
    owner: "all",
    priority: "all",
    status: "all",
    due: "all",
    sortBy: "due_date",
    sortDir: "asc" as SortDirection
  };
}

function updateKpiEntryFilters(control: HTMLInputElement | HTMLSelectElement) {
  return updateKpiEntryFilterValue(control.id, control.value);
}

function updateKpiEntryFilterValue(id: string, value: string) {
  if (id === "kpi-entry-filter-person") state.kpiEntryFilters.person = value;
  else if (id === "kpi-entry-filter-kpi") state.kpiEntryFilters.kpi = value;
  else if (id === "kpi-entry-filter-result") state.kpiEntryFilters.result = value;
  else if (id === "kpi-entry-filter-period-type") state.kpiEntryFilters.periodType = value;
  else if (id === "kpi-entry-sort-by") state.kpiEntryFilters.sortBy = value;
  else if (id === "kpi-entry-sort-dir") state.kpiEntryFilters.sortDir = value === "desc" ? "desc" : "asc";
  else return false;
  return true;
}

function updateCommitmentFilters(control: HTMLInputElement | HTMLSelectElement) {
  return updateCommitmentFilterValue(control.id, control.value);
}

function updateActionFilterValue(id: string, value: string) {
  if (id === "action-filter-owner") state.actionFilters.owner = value;
  else if (id === "action-filter-priority") state.actionFilters.priority = value;
  else if (id === "action-filter-status") state.actionFilters.status = value;
  else if (id === "action-filter-due") state.actionFilters.due = value;
  else if (id === "action-sort-by") state.actionFilters.sortBy = value;
  else if (id === "action-sort-dir") state.actionFilters.sortDir = value === "desc" ? "desc" : "asc";
  else return false;
  return true;
}

function updateCommitmentFilterValue(id: string, value: string) {
  if (id === "commitment-filter-person") state.commitmentFilters.person = value;
  else if (id === "commitment-filter-status") state.commitmentFilters.status = value;
  else if (id === "commitment-filter-priority") state.commitmentFilters.priority = value;
  else if (id === "commitment-filter-category") state.commitmentFilters.category = value;
  else if (id === "commitment-sort-by") state.commitmentFilters.sortBy = value;
  else if (id === "commitment-sort-dir") state.commitmentFilters.sortDir = value === "desc" ? "desc" : "asc";
  else return false;
  return true;
}

function applyFilterValue(id: string, value: string) {
  return updateKpiEntryFilterValue(id, value) || updateCommitmentFilterValue(id, value) || updateActionFilterValue(id, value);
}

function visibleActions(rows: Row[]) {
  const filters = state.actionFilters;
  const visible = rows.filter((row) => {
    if (filters.owner !== "all" && String(row.owner_id || "") !== filters.owner) return false;
    if (filters.priority !== "all" && String(row.priority || "") !== filters.priority) return false;
    if (filters.status !== "all" && String(row.status || "") !== filters.status) return false;
    if (filters.due !== "all" && actionBucket(row) !== filters.due) return false;
    return true;
  });
  return sortActionRows(visible, filters.sortBy, filters.sortDir);
}

function visibleKpiEntries(rows: Row[]) {
  const filters = state.kpiEntryFilters;
  const visible = rows.filter((row) => {
    if (filters.person !== "all" && String(row.person_id || "") !== filters.person) return false;
    if (filters.kpi !== "all" && String(row.kpi_id || "") !== filters.kpi) return false;
    if (filters.periodType !== "all" && String(row.period_type || "") !== filters.periodType) return false;
    if (filters.result === "met" && Number(row.actual_value || 0) < Number(row.target_value || 0)) return false;
    if (filters.result === "behind" && Number(row.actual_value || 0) >= Number(row.target_value || 0)) return false;
    return true;
  });
  return sortRows(visible, filters.sortBy, filters.sortDir);
}

function visibleCommitments(rows: Row[]) {
  const filters = state.commitmentFilters;
  const visible = rows.filter((row) => {
    if (filters.person !== "all" && String(row.person_id || "") !== filters.person) return false;
    if (filters.status !== "all" && String(row.status || "") !== filters.status) return false;
    if (filters.priority !== "all" && String(row.priority || "") !== filters.priority) return false;
    if (filters.category !== "all" && String(row.category || "") !== filters.category) return false;
    return true;
  });
  return sortRows(visible, filters.sortBy, filters.sortDir);
}

function sortActionRows(rows: Row[], key: string, direction: SortDirection) {
  const multiplier = direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const first = actionSortValue(a, key);
    const second = actionSortValue(b, key);
    if (typeof first === "number" && typeof second === "number") return (first - second) * multiplier;
    return String(first).localeCompare(String(second), undefined, { numeric: true, sensitivity: "base" }) * multiplier;
  });
}

function actionSortValue(row: Row, key: string) {
  if (key === "owner_id") return ownerName(row.owner_id);
  if (key === "priority") return priorityRank(row.priority);
  if (key === "due_date") return row.due_date || "9999-12-31";
  return String(row[key] ?? "");
}

function sortRows(rows: Row[], key: string, direction: SortDirection) {
  const multiplier = direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const first = sortValue(a, key);
    const second = sortValue(b, key);
    if (typeof first === "number" && typeof second === "number") return (first - second) * multiplier;
    return String(first).localeCompare(String(second), undefined, { numeric: true, sensitivity: "base" }) * multiplier;
  });
}

function sortValue(row: Row, key: string) {
  const value = row[key];
  if (key === "person_id" || key === "owner_id") return ownerName(String(value || ""));
  if (key === "kpi_id") return kpiName(String(value || ""));
  if (["target_value", "actual_value", "target"].includes(key)) return Number(value || 0);
  return String(value ?? "");
}

function actionBucket(row: Row) {
  if (isActionDone(row)) return "done";
  if (String(row.status || "") === "In Progress") return "ongoing";
  const due = String(row.due_date || "");
  if (!due) return "unscheduled";
  if (due < today()) return "overdue";
  if (due === today()) return "today";
  if (due === offsetDate(1)) return "tomorrow";
  return "upcoming";
}

function isActionDone(row: Row) {
  return ["Done", "Completed"].includes(String(row.status || ""));
}

function priorityRank(value: string) {
  const order: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  return order[String(value || "Medium")] ?? 4;
}

function tableFilterOptions(tableName: string, key: string, allLabel: string) {
  const schemaOptions = schemas[tableName]?.find((field) => field.key === key)?.options || [];
  const rawOptions = Array.isArray(schemaOptions) ? schemaOptions : schemaOptions();
  const schemaValues = rawOptions.map((option) => optionValue(option));
  const knownValues = new Set<string>(schemaValues);
  (state.data[tableName] || []).forEach((row) => {
    const value = String(row[key] || "");
    if (value) knownValues.add(value);
  });
  const extraValues = [...knownValues].filter((value) => !schemaValues.includes(value)).sort((a, b) => a.localeCompare(b));
  return [`all|${allLabel}`, ...[...schemaValues, ...extraValues].map((value) => `${value}|${value}`)];
}

function weekEntries(week = state.week) {
  return filtered("weekly_kpi_entries").filter((e) => String(e.period_start) === week);
}

function weekCommitments(week = state.week) {
  return filtered("commitments").filter((c) => String(c.week_start) === week);
}

function weekRisks(week = state.week) {
  const overdue = (state.data.tasks || [])
    .filter((t) => isOverdue(t.due_date) && !["Done", "Completed"].includes(t.status))
    .map((t) => ({ type: "Overdue action", title: t.title, detail: `due ${t.due_date}`, owner_id: t.owner_id }));
  const missed = weekCommitments(week)
    .filter((c) => c.status === "Missed")
    .map((c) => ({ type: "Missed commitment", title: c.title, detail: c.reason_if_missed || "", owner_id: c.person_id }));
  const behind = weekEntries(week)
    .filter((e) => Number(e.actual_value) < Number(e.target_value))
    .map((e) => ({ type: "KPI behind target", title: kpiName(e.kpi_id), detail: `${e.actual_value}/${e.target_value}`, owner_id: e.person_id }));
  return [...overdue, ...missed, ...behind];
}

function knownWeeks() {
  const set = new Set<string>();
  (state.data.weekly_kpi_entries || []).forEach((e) => e.period_start && set.add(String(e.period_start)));
  (state.data.commitments || []).forEach((c) => c.week_start && set.add(String(c.week_start)));
  set.add(currentMonday());
  set.add(state.week);
  return [...set].sort().reverse();
}

function weekSelector() {
  const weeks = knownWeeks();
  const isThis = state.week === currentMonday();
  const label = `${weekLabel(state.week)}${isThis ? " · This week" : ""}`;
  return `
    <div class="week-nav">
      <button class="btn" type="button" data-week-prev title="Previous week">◀</button>
      <div class="week-picker">
        <button class="btn week-current-btn" type="button" data-week-toggle aria-haspopup="listbox" aria-expanded="${state.weekMenuOpen}">${escapeHtml(label)} <span class="caret">▾</span></button>
        ${state.weekMenuOpen ? `<div class="week-menu" role="listbox"><label class="week-jump-row">Jump to week<input type="date" id="week-jump" value="${state.week}" /></label>${weeks.map((w) => `<button type="button" class="week-option ${w === state.week ? "active" : ""}" data-week-pick="${w}" role="option">${escapeHtml(weekLabel(w))}${w === currentMonday() ? " · This week" : ""}</button>`).join("")}</div>` : ""}
      </div>
      <button class="btn" type="button" data-week-next title="Next week">▶</button>
      ${isThis ? "" : `<button class="btn" type="button" data-week-current>This week</button>`}
    </div>
  `;
}

function teamCompletion(week: string): number | null {
  const entries = (state.data.weekly_kpi_entries || []).filter((e) => String(e.period_start) === week);
  if (!entries.length) return null;
  const met = entries.filter((e) => Number(e.actual_value) >= Number(e.target_value)).length;
  return Math.round((met / entries.length) * 100);
}

function completionTrend() {
  const points = [...knownWeeks()].sort().slice(-8).map((w) => ({ w, v: teamCompletion(w) }));
  if (points.filter((p) => p.v !== null).length < 1) return empty("No KPI data yet to chart.");
  const W = 320, H = 96, pad = 8, topH = 14, labelH = 14;
  const chartH = H - topH - labelH;
  const n = points.length;
  const gap = 8;
  const bw = (W - pad * 2 - gap * (n - 1)) / n;
  const bars = points.map((p, i) => {
    const v = p.v ?? 0;
    const h = (v / 100) * chartH;
    const x = pad + i * (bw + gap);
    const y = topH + (chartH - h);
    const color = p.v === null ? "var(--border)" : barColor(v);
    const current = p.w === state.week ? ` stroke="var(--text)" stroke-width="1"` : "";
    const valueLabel = p.v === null ? "" : `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" font-size="8" text-anchor="middle" fill="var(--muted)">${p.v}%</text>`;
    const short = weekLabel(p.w).split(" – ")[0];
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="2" fill="${color}"${current}><title>${escapeHtml(weekLabel(p.w))}: ${p.v === null ? "no data" : p.v + "%"}</title></rect>${valueLabel}<text x="${(x + bw / 2).toFixed(1)}" y="${H - 3}" font-size="7.5" text-anchor="middle" fill="var(--muted)">${escapeHtml(short)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="trend-svg" role="img" aria-label="Team weekly KPI completion trend">${bars}</svg>`;
}

async function duplicateWeek() {
  const week = state.week;
  const prev = shiftWeek(week, -1);
  const source = (state.data.weekly_kpi_entries || []).filter((e) => String(e.period_start) === prev);
  if (!source.length) {
    toast(`No KPI assignments found for week of ${prev}.`);
    return;
  }
  const existing = new Set(weekEntries(week).map((e) => `${e.kpi_id}|${e.person_id}`));
  const toCreate = source.filter((e) => !existing.has(`${e.kpi_id}|${e.person_id}`));
  if (!toCreate.length) {
    toast("This week already has those KPI assignments.");
    return;
  }
  if (!confirm(`Copy ${toCreate.length} KPI assignment(s) from week of ${prev} into week of ${week}?\nTargets carry over; actuals reset to 0.`)) return;
  for (const e of toCreate) {
    await api("/api/table/weekly_kpi_entries", {
      method: "POST",
      body: JSON.stringify({
        kpi_id: e.kpi_id,
        person_id: e.person_id,
        period_start: week,
        period_type: e.period_type || "Weekly",
        target_value: Number(e.target_value || 0),
        actual_value: 0,
        notes: ""
      })
    });
  }
  await refresh();
  renderShell();
  toast(`Copied ${toCreate.length} KPI assignment(s) into week of ${week}.`);
}

async function importTeamCsv(file: File) {
  try {
    toast("Importing team CSV...");
    const records = csvRecordsToObjects(parseCsv(await file.text()));
    const rows = prepareTeamCsvRows(records);
    if (!rows.length) {
      toast("No valid team rows found. Include a Name or Employee Name column.");
      return;
    }
    const result = await api("/api/import", { method: "POST", body: JSON.stringify({ table: "team_members", rows }) });
    await refresh();
    renderShell();
    toast(`Team import complete: ${result.inserted || 0} added, ${result.updated || 0} updated.`);
  } catch (error) {
    console.error("Team CSV import failed", error);
    toast(`Team CSV import failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

function prepareTeamCsvRows(records: Row[]) {
  const existing = state.data.team_members || [];
  const usedIds = new Set(existing.map((row) => String(row.id || "")));
  const byName = new Map(existing.map((row) => [normalizeLookup(row.name), row]));
  const byKey = new Map<string, Row>();

  for (const record of records) {
    const name = cleanCell(record.name);
    if (!name) continue;
    const existingRow = byName.get(normalizeLookup(name));
    const id = cleanCell(record.id) || String(existingRow?.id || "") || uniqueTeamId(name, usedIds);
    const row = {
      id,
      name,
      role: cleanCell(record.role) || "KPI Tracked Role",
      region: normalizeChoice(cleanCell(record.region), regions(), "UK"),
      business_type: normalizeChoice(cleanCell(record.business_type), teamAreas(), "KPI Tracked Role"),
      target: numberFromCell(record.target),
      kpi_type: cleanCell(record.kpi_type),
      weekly_kpi_expectations: cleanCell(record.weekly_kpi_expectations),
      active: activeFromCell(record.active)
    };
    usedIds.add(id);
    byKey.set(id || normalizeLookup(name), row);
  }

  return [...byKey.values()];
}

function csvRecordsToObjects(records: string[][]) {
  const [headerRow, ...bodyRows] = records.filter((row) => row.some((cell) => cell.trim()));
  if (!headerRow?.length) return [];
  const headers = headerRow.map(teamCsvKey);
  return bodyRows.map((row) => {
    const record: Row = {};
    headers.forEach((header, index) => {
      if (header) record[header] = row[index] || "";
    });
    return record;
  });
}

function parseCsv(text: string) {
  const delimiter = detectCsvDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function detectCsvDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = countDelimiter(firstLine, candidate);
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function countDelimiter(line: string, delimiter: string) {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (quoted && char === "\"" && next === "\"") {
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

function teamCsvKey(header: string) {
  const key = normalizeHeader(header);
  const aliases: Record<string, string> = {
    id: "id",
    personid: "id",
    employeeid: "id",
    memberid: "id",
    name: "name",
    person: "name",
    employee: "name",
    employeename: "name",
    teammember: "name",
    teammembername: "name",
    role: "role",
    title: "role",
    jobtitle: "role",
    region: "region",
    market: "region",
    location: "region",
    businesstype: "business_type",
    teamarea: "business_type",
    area: "business_type",
    department: "business_type",
    target: "target",
    defaulttarget: "target",
    weeklytarget: "target",
    defaultweeklytarget: "target",
    kpitarget: "target",
    weeklykpitarget: "target",
    defaultweeklykpitarget: "target",
    kpitype: "kpi_type",
    kpicategory: "kpi_type",
    weeklykpiexpectations: "weekly_kpi_expectations",
    kpiexpectations: "weekly_kpi_expectations",
    weeklyexpectations: "weekly_kpi_expectations",
    expectations: "weekly_kpi_expectations",
    active: "active",
    enabled: "active",
    status: "active"
  };
  return aliases[key] || "";
}

function normalizeHeader(value: string) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleanCell(value: any) {
  return String(value ?? "").trim();
}

function normalizeLookup(value: any) {
  return cleanCell(value).toLowerCase();
}

function normalizeChoice(value: string, options: string[], fallback: string) {
  if (!value) return fallback;
  return options.find((option) => option.toLowerCase() === value.toLowerCase()) || value;
}

function numberFromCell(value: any) {
  const parsed = Number(cleanCell(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function activeFromCell(value: any) {
  const text = cleanCell(value).toLowerCase();
  if (!text) return 1;
  if (["0", "no", "n", "false", "inactive", "disabled"].includes(text)) return 0;
  return 1;
}

function uniqueTeamId(name: string, usedIds: Set<string>) {
  const base = slugId(name) || `member-${Date.now()}`;
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function slugId(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function downloadTeamCsvTemplate() {
  const content = [
    "id,name,role,region,business_type,target,kpi_type,weekly_kpi_expectations,active",
    "remote-team-member,Asha Patel,KPI Tracked Role,Remote,KPI Tracked Role,3,Weekly KPI,Complete weekly assigned KPIs,1"
  ].join("\n");
  download("team-members-template.csv", content, "text/csv");
}

function downloadKpiCsvTemplate() {
  const content = [
    "Person,KPI,Week,Target,Actual,Notes",
    `Sunny,Follow-ups completed,${currentMonday()},5,4,Two carried to next week`,
    `Suraj,Weekly updates submitted,${currentMonday()},3,3,`
  ].join("\n");
  download("kpi-weekly-template.csv", content, "text/csv");
}

// Auto-detecting KPI importer. People and KPIs are matched by name (ids used
// when present). A file with a Week/Actual column is treated as weekly numbers
// (weekly_kpi_entries); otherwise as KPI definitions (kpis).
async function importKpiCsv(file: File) {
  try {
    toast("Importing KPI CSV...");
    const { headerKeys, records } = mapCsvRecords(parseCsv(await file.text()), kpiCsvKey);
    if (!records.length) {
      toast("No data rows found in the KPI CSV.");
      return;
    }
    const isEntries = headerKeys.includes("period_start") || headerKeys.includes("actual");
    if (isEntries) await importKpiEntries(records);
    else await importKpiDefinitions(records);
  } catch (error) {
    console.error("KPI CSV import failed", error);
    toast(`KPI CSV import failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

async function importKpiDefinitions(records: Row[]) {
  const existingKpis = state.data.kpis || [];
  const unmatched = new Set<string>();
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const rec of records) {
    const kpiName = cleanCell(rec.kpi_name);
    if (!kpiName) continue;
    const person = resolvePerson(rec.person);
    if (cleanCell(rec.person) && !person) {
      unmatched.add(cleanCell(rec.person));
      continue;
    }
    const personId = String(person?.id || "");
    const dedupe = `${personId}|${normalizeLookup(kpiName)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const existing = existingKpis.find((k) => String(k.person_id) === personId && normalizeLookup(k.name) === normalizeLookup(kpiName));
    rows.push({
      ...(cleanCell(rec.id) ? { id: cleanCell(rec.id) } : existing ? { id: existing.id } : {}),
      person_id: personId,
      name: kpiName,
      description: cleanCell(rec.description),
      cadence: normalizeChoice(cleanCell(rec.cadence), ["Weekly", "Monthly"], "Weekly"),
      target: numberFromCell(rec.target),
      unit: cleanCell(rec.unit) || "count",
      active: activeFromCell(rec.active)
    });
  }
  if (!rows.length) {
    toast(unmatched.size ? `No people matched (${[...unmatched].join(", ")}). Import the team first.` : "No KPI rows with a KPI name were found.");
    return;
  }
  const result = await api("/api/import", { method: "POST", body: JSON.stringify({ table: "kpis", rows }) });
  await refresh();
  renderShell();
  const warn = unmatched.size ? ` Skipped unknown people: ${[...unmatched].join(", ")}.` : "";
  toast(`KPI definitions imported: ${result.inserted || 0} added, ${result.updated || 0} updated.${warn}`);
}

async function importKpiEntries(records: Row[]) {
  const existingEntries = state.data.weekly_kpi_entries || [];
  const unmatched = new Set<string>();
  const plans: { personId: string; kpiName: string; week: string; rec: Row }[] = [];
  for (const rec of records) {
    const kpiName = cleanCell(rec.kpi_name);
    if (!kpiName) continue;
    const person = resolvePerson(rec.person);
    if (!person) {
      if (cleanCell(rec.person)) unmatched.add(cleanCell(rec.person));
      continue;
    }
    plans.push({ personId: String(person.id), kpiName, week: normalizeWeek(cleanCell(rec.period_start)) || state.week, rec });
  }
  if (!plans.length) {
    toast(unmatched.size ? `No people matched (${[...unmatched].join(", ")}). Import the team first.` : "No KPI entry rows were found.");
    return;
  }

  // Ensure a KPI definition exists for each person+KPI, creating missing ones to get an id.
  const kpiIdByKey = new Map<string, string>();
  for (const k of state.data.kpis || []) kpiIdByKey.set(`${k.person_id}|${normalizeLookup(k.name)}`, String(k.id));
  let createdDefs = 0;
  for (const plan of plans) {
    const key = `${plan.personId}|${normalizeLookup(plan.kpiName)}`;
    if (kpiIdByKey.has(key)) continue;
    const created = await api(tableApiUrl("kpis"), {
      method: "POST",
      body: JSON.stringify({ person_id: plan.personId, name: plan.kpiName, description: "", cadence: "Weekly", target: numberFromCell(plan.rec.target), unit: "count", active: 1 })
    });
    const newId = String(created?.data?.id || "");
    if (newId) {
      kpiIdByKey.set(key, newId);
      createdDefs += 1;
    }
  }

  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const plan of plans) {
    const kpiId = kpiIdByKey.get(`${plan.personId}|${normalizeLookup(plan.kpiName)}`);
    if (!kpiId) continue;
    const dedupe = `${kpiId}|${plan.personId}|${plan.week}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const existing = existingEntries.find((e) => String(e.kpi_id) === kpiId && String(e.person_id) === plan.personId && String(e.period_start) === plan.week);
    rows.push({
      ...(existing ? { id: existing.id } : {}),
      kpi_id: kpiId,
      person_id: plan.personId,
      period_start: plan.week,
      period_type: normalizeChoice(cleanCell(plan.rec.period_type), ["Weekly", "Monthly"], "Weekly"),
      target_value: numberFromCell(plan.rec.target),
      actual_value: numberFromCell(plan.rec.actual),
      notes: cleanCell(plan.rec.notes)
    });
  }
  const result = await api("/api/import", { method: "POST", body: JSON.stringify({ table: "weekly_kpi_entries", rows }) });
  await refresh();
  renderShell();
  const defNote = createdDefs ? ` Created ${createdDefs} new KPI definition(s).` : "";
  const warn = unmatched.size ? ` Skipped unknown people: ${[...unmatched].join(", ")}.` : "";
  toast(`Weekly KPI entries imported: ${result.inserted || 0} added, ${result.updated || 0} updated.${defNote}${warn}`);
}

function mapCsvRecords(rows: string[][], keyFn: (header: string) => string) {
  const filledRows = rows.filter((row) => row.some((cell) => cell.trim()));
  const [headerRow, ...bodyRows] = filledRows;
  if (!headerRow?.length) return { headerKeys: [] as string[], records: [] as Row[] };
  const headerKeys = headerRow.map(keyFn);
  const records = bodyRows.map((row) => {
    const record: Row = {};
    headerKeys.forEach((key, index) => {
      if (key && record[key] === undefined) record[key] = row[index] ?? "";
    });
    return record;
  });
  return { headerKeys, records };
}

function kpiCsvKey(header: string) {
  const key = normalizeHeader(header);
  const aliases: Record<string, string> = {
    id: "id",
    person: "person",
    personname: "person",
    personid: "person",
    member: "person",
    teammember: "person",
    owner: "person",
    assignee: "person",
    employee: "person",
    employeename: "person",
    kpi: "kpi_name",
    kpiname: "kpi_name",
    metric: "kpi_name",
    indicator: "kpi_name",
    measure: "kpi_name",
    name: "kpi_name",
    description: "description",
    desc: "description",
    details: "description",
    cadence: "cadence",
    frequency: "cadence",
    unit: "unit",
    units: "unit",
    uom: "unit",
    week: "period_start",
    weekstart: "period_start",
    weekstarting: "period_start",
    weekof: "period_start",
    period: "period_start",
    periodstart: "period_start",
    date: "period_start",
    periodtype: "period_type",
    target: "target",
    targetvalue: "target",
    goal: "target",
    planned: "target",
    actual: "actual",
    actualvalue: "actual",
    result: "actual",
    achieved: "actual",
    notes: "notes",
    note: "notes",
    comment: "notes",
    comments: "notes",
    active: "active",
    enabled: "active"
  };
  return aliases[key] || "";
}

function resolvePerson(value: any) {
  const text = cleanCell(value);
  if (!text) return undefined;
  const team = state.data.team_members || [];
  return team.find((member) => String(member.id) === text) || team.find((member) => normalizeLookup(member.name) === normalizeLookup(text));
}

function normalizeWeek(value: string) {
  const text = cleanCell(value);
  if (!text) return "";
  const date = new Date(text.includes("T") ? text : `${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getDay();
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
  date.setHours(0, 0, 0, 0);
  return formatLocalDate(date);
}

// "Paste from Excel": paste a wide HubSpot-style block (one row per person,
// activity columns) and record the values as this week's actuals. People are
// matched by name (full name, else first name, else first + last initial).
function showPasteDialog() {
  const modal = document.querySelector("#modal-root")!;
  modal.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal" id="paste-dialog" role="dialog" aria-modal="true">
        <div class="modal-header"><h2>Paste KPI actuals from Excel</h2><button class="btn" type="button" data-close>Close</button></div>
        <div class="form-grid">
          <div class="form-field full"><div class="subtle">Recording into <strong>${escapeHtml(weekLabel(state.week))}</strong> (week of ${state.week}). Change the week with the picker on the KPI Tracker page, then reopen this.</div></div>
          <div class="form-field full">
            <label for="paste-data">Paste rows from Excel — include the header row (e.g. Employee, Connected Calls, Emails Sent, Meetings Arranged)</label>
            <textarea id="paste-data" rows="7" placeholder="Employee   Connected Calls   Emails Sent   Meetings Arranged&#10;Sung Hyun Kwon   12   5   0"></textarea>
          </div>
          <div class="form-field full"><label>Preview</label><div id="paste-preview" class="paste-preview">${pastePreviewHtml("")}</div></div>
        </div>
        <div class="modal-footer"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-paste-import>Import actuals</button></div>
      </div>
    </div>
  `;
  const dialog = document.querySelector<HTMLElement>("#paste-dialog")!;
  const textarea = document.querySelector<HTMLTextAreaElement>("#paste-data")!;
  textarea.addEventListener("input", () => {
    const preview = document.querySelector("#paste-preview");
    if (preview) preview.innerHTML = pastePreviewHtml(textarea.value);
  });
  dialog.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-close],[data-paste-import]");
    if (!button) return;
    if (button.dataset.close !== undefined) {
      modal.innerHTML = "";
      return;
    }
    if (button.dataset.pasteImport !== undefined) {
      await importPastedKpis((document.querySelector("#paste-data") as HTMLTextAreaElement)?.value || "");
    }
  });
  setTimeout(() => document.querySelector<HTMLTextAreaElement>("#paste-data")?.focus(), 0);
}

function parsePastedRows(text: string) {
  const lines = text.replace(/\r/g, "").split("\n").filter((line) => line.trim() !== "");
  if (!lines.length) return [] as string[][];
  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(",") ? "," : "\t";
  return lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
}

function detectPasteColumns(header: string[]) {
  const norm = header.map(normalizeHeader);
  const skip = new Set(["totalengagements", "total", "firstname", "lastname", "weekstartlist", "weekstart", "week", "employee", "name", "person", "fullname", "teammember", "definitions"]);
  const nameKeys = ["employee", "name", "person", "fullname", "teammember"];
  const nameIdx = norm.findIndex((h) => nameKeys.includes(h));
  const firstIdx = norm.indexOf("firstname");
  const lastIdx = norm.indexOf("lastname");
  const kpiCols: { index: number; name: string }[] = [];
  header.forEach((h, index) => {
    const n = norm[index];
    if (!n || skip.has(n) || index === firstIdx || index === lastIdx) return;
    kpiCols.push({ index, name: h.trim() });
  });
  return { nameIdx, firstIdx, lastIdx, kpiCols };
}

function nameForRow(cells: string[], nameIdx: number, firstIdx: number, lastIdx: number) {
  if (nameIdx >= 0 && cleanCell(cells[nameIdx])) return cleanCell(cells[nameIdx]);
  if (firstIdx >= 0 || lastIdx >= 0) return [cleanCell(cells[firstIdx]), cleanCell(cells[lastIdx])].filter(Boolean).join(" ");
  return cleanCell(cells[0]);
}

function resolvePersonFuzzy(value: string) {
  const text = cleanCell(value);
  if (!text) return undefined;
  const team = state.data.team_members || [];
  const norm = normalizeLookup(text);
  const exact = team.find((member) => String(member.id) === text || normalizeLookup(member.name) === norm);
  if (exact) return exact;
  const tokens = norm.split(/\s+/).filter(Boolean);
  const first = tokens[0] || "";
  const lastInitial = tokens.length > 1 ? tokens[tokens.length - 1][0] : "";
  const byInitial = team.filter((member) => {
    const parts = normalizeLookup(member.name).split(/\s+/).filter(Boolean);
    if (parts[0] !== first) return false;
    const last = parts.length > 1 ? parts[parts.length - 1] : "";
    return !lastInitial || !last || last[0] === lastInitial;
  });
  if (byInitial.length === 1) return byInitial[0];
  const byFirst = team.filter((member) => normalizeLookup(member.name).split(/\s+/)[0] === first);
  return byFirst.length === 1 ? byFirst[0] : undefined;
}

function pasteDataRows(grid: string[][], cols: ReturnType<typeof detectPasteColumns>) {
  return grid.slice(1).filter((cells) => {
    const name = nameForRow(cells, cols.nameIdx, cols.firstIdx, cols.lastIdx);
    return name && !["total", "definitions", "grand total"].includes(normalizeLookup(name));
  });
}

function pastePreviewHtml(text: string) {
  const grid = parsePastedRows(text);
  if (grid.length < 2) return `<div class="subtle">Paste your Excel rows (including the header row) to see what will be imported.</div>`;
  const cols = detectPasteColumns(grid[0]);
  if (!cols.kpiCols.length) return `<div class="subtle">No KPI columns detected. Make sure the header row has columns like Connected Calls, Emails Sent, Meetings Arranged.</div>`;
  const dataRows = pasteDataRows(grid, cols);
  if (!dataRows.length) return `<div class="subtle">No people rows detected under the header.</div>`;
  const body = dataRows.map((cells) => {
    const raw = nameForRow(cells, cols.nameIdx, cols.firstIdx, cols.lastIdx);
    const person = resolvePersonFuzzy(raw);
    const matched = person ? `<span class="badge Done">${escapeHtml(person.name)}</span>` : `<span class="badge Missed">no match</span>`;
    const values = cols.kpiCols.map((col) => `<td>${escapeHtml(cells[col.index] ?? "")}</td>`).join("");
    return `<tr><td>${escapeHtml(raw)}</td><td>${matched}</td>${values}</tr>`;
  }).join("");
  return `<div class="subtle">KPIs: ${cols.kpiCols.map((c) => escapeHtml(c.name)).join(", ")} → ${escapeHtml(weekLabel(state.week))}</div>
    <div class="table-wrap"><table><thead><tr><th>Pasted name</th><th>Matched person</th>${cols.kpiCols.map((c) => `<th>${escapeHtml(c.name)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
}

async function importPastedKpis(text: string) {
  try {
    const grid = parsePastedRows(text);
    if (grid.length < 2) {
      toast("Paste the header row and at least one data row.");
      return;
    }
    const cols = detectPasteColumns(grid[0]);
    if (!cols.kpiCols.length) {
      toast("No KPI columns detected (e.g. Connected Calls, Emails Sent).");
      return;
    }
    toast("Importing pasted actuals...");
    const week = state.week;
    const unmatched = new Set<string>();
    const matched = new Set<string>();
    const plans: { personId: string; kpiName: string; value: number }[] = [];
    for (const cells of pasteDataRows(grid, cols)) {
      const person = resolvePersonFuzzy(nameForRow(cells, cols.nameIdx, cols.firstIdx, cols.lastIdx));
      if (!person) {
        unmatched.add(nameForRow(cells, cols.nameIdx, cols.firstIdx, cols.lastIdx));
        continue;
      }
      matched.add(person.name);
      for (const col of cols.kpiCols) {
        const cell = cells[col.index];
        if (cell === undefined || cell === "") continue;
        plans.push({ personId: String(person.id), kpiName: col.name, value: numberFromCell(cell) });
      }
    }
    if (!plans.length) {
      toast(unmatched.size ? `No people matched (${[...unmatched].join(", ")}).` : "No values found to import.");
      return;
    }

    const kpiIdByKey = new Map<string, string>();
    for (const k of state.data.kpis || []) kpiIdByKey.set(`${k.person_id}|${normalizeLookup(k.name)}`, String(k.id));
    let createdDefs = 0;
    for (const plan of plans) {
      const key = `${plan.personId}|${normalizeLookup(plan.kpiName)}`;
      if (kpiIdByKey.has(key)) continue;
      const created = await api(tableApiUrl("kpis"), {
        method: "POST",
        body: JSON.stringify({ person_id: plan.personId, name: plan.kpiName, description: "", cadence: "Weekly", target: 0, unit: "count", active: 1 })
      });
      const newId = String(created?.data?.id || "");
      if (newId) {
        kpiIdByKey.set(key, newId);
        createdDefs += 1;
      }
    }

    const existingEntries = state.data.weekly_kpi_entries || [];
    const seen = new Set<string>();
    const rows: Row[] = [];
    for (const plan of plans) {
      const kpiId = kpiIdByKey.get(`${plan.personId}|${normalizeLookup(plan.kpiName)}`);
      if (!kpiId || seen.has(kpiId)) continue;
      seen.add(kpiId);
      const existing = existingEntries.find((e) => String(e.kpi_id) === kpiId && String(e.person_id) === plan.personId && String(e.period_start) === week);
      rows.push({
        ...(existing ? { id: existing.id } : {}),
        kpi_id: kpiId,
        person_id: plan.personId,
        period_start: week,
        period_type: "Weekly",
        target_value: existing ? existing.target_value : 0,
        actual_value: plan.value,
        notes: existing ? existing.notes : ""
      });
    }
    const result = await api("/api/import", { method: "POST", body: JSON.stringify({ table: "weekly_kpi_entries", rows }) });
    document.querySelector("#modal-root")!.innerHTML = "";
    await refresh();
    renderShell();
    const defNote = createdDefs ? ` Created ${createdDefs} KPI definition(s).` : "";
    const warn = unmatched.size ? ` Skipped unknown names: ${[...unmatched].join(", ")}.` : "";
    toast(`Imported actuals for ${matched.size} people into ${weekLabel(week)}: ${result.inserted || 0} added, ${result.updated || 0} updated.${defNote}${warn}`);
  } catch (error) {
    console.error("Paste import failed", error);
    toast(`Paste import failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

function shiftWeek(week: string, deltaWeeks: number) {
  const date = new Date(`${week}T00:00:00`);
  date.setDate(date.getDate() + deltaWeeks * 7);
  return formatLocalDate(date);
}

function weekEnd(week: string) {
  const date = new Date(`${week}T00:00:00`);
  date.setDate(date.getDate() + 6);
  return formatLocalDate(date);
}

function weekLabel(week: string) {
  const start = new Date(`${week}T00:00:00`);
  if (Number.isNaN(start.getTime())) return week;
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatCell(key: string, value: any) {
  const raw = value ?? "";
  if (key === "person_id" || key === "owner_id") return escapeHtml(ownerName(raw));
  if (key === "kpi_id") return escapeHtml(kpiName(raw));
  if (["status", "priority"].includes(key)) return `<span class="badge ${escapeHtml(raw)}">${escapeHtml(raw)}</span>`;
  return escapeHtml(String(raw).slice(0, 160));
}

function memberOptions() {
  return (state.data.team_members || []).map((m) => `${m.id}|${m.name}`);
}

function kpiOptions() {
  return (state.data.kpis || []).map((k) => `${k.id}|${ownerName(k.person_id)} - ${k.name}`);
}

function regions() {
  return ["UK", "Ireland", "UK/Ireland", "French Speaking Europe", "University", "Remote"];
}

function teamAreas() {
  return ["Team Leadership", "KPI Tracked Role", "Technical Support", "University", "Other"];
}

function ownerName(id: string) {
  return (state.data.team_members || []).find((m) => m.id === id)?.name || id || "";
}

function kpiName(id: string) {
  return (state.data.kpis || []).find((k) => k.id === id)?.name || id || "";
}

function sum(rows: Row[], key: string) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function labelFor(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function empty(message: string) {
  return `<div class="empty">${message}</div>`;
}

function escapeHtml(value: any) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]!));
}

function optionValue(option: string) {
  return option.includes("|") ? option.split("|")[0] : option;
}

function optionLabel(option: string) {
  return option.includes("|") ? option.split("|")[1] : option;
}

function selectHtml(id: string, options: string[], value: string) {
  return `<select id="${id}">${options.map((option) => `<option value="${escapeHtml(optionValue(option))}" ${optionValue(option) === value ? "selected" : ""}>${escapeHtml(optionLabel(option))}</option>`).join("")}</select>`;
}

function menuSelectHtml(id: string, options: string[], value: string) {
  const selected = options.find((option) => optionValue(option) === value) || options[0] || "";
  const selectedLabel = selected ? optionLabel(selected) : "Select";
  const open = state.openMenu === id;
  return `
    <div class="filter-menu" data-filter-menu="${escapeHtml(id)}">
      <button class="filter-menu-button" type="button" data-filter-toggle="${escapeHtml(id)}" aria-haspopup="listbox" aria-expanded="${open}">
        <span>${escapeHtml(selectedLabel)}</span><span class="caret" aria-hidden="true">v</span>
      </button>
      ${open ? `<div class="filter-menu-list" role="listbox">${options.map((option) => {
        const optionVal = optionValue(option);
        const active = optionVal === value;
        return `<button type="button" class="filter-menu-option ${active ? "active" : ""}" data-filter-option="${escapeHtml(id)}" data-value="${escapeHtml(optionVal)}" role="option" aria-selected="${active}">${escapeHtml(optionLabel(option))}</button>`;
      }).join("")}</div>` : ""}
    </div>
  `;
}

function isOverdue(date: string) {
  return date && date < today();
}

function today() {
  return formatLocalDate(new Date());
}

function offsetDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

function currentMonday() {
  const date = new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return formatLocalDate(date);
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setting(key: string) {
  return (state.data.app_settings || []).find((row) => row.key === key)?.value || "";
}

function toast(message: string) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function download(filename: string, content: string, type: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
