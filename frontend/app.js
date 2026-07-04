const API_TASKS_URL = "/api/tasks";
const API_MASTER_DATA_URL = "/api/master-data";
const API_CLIENTS_URL = "/api/clients";
const API_MESSAGE_SCHEDULES_URL = "/api/client-message-schedules";
const API_DUE_MESSAGES_URL = "/api/client-message-due";
const API_MESSAGE_TEMPLATES_URL = "/api/message-templates";
const API_ACTIVITY_URL = "/api/activity";
const API_ASSISTANT_URL = "/api/assistant/command";
const API_BRIEFING_URL = "/api/briefing";
const SETTINGS_KEY = "gpa-v3-settings";
const LOCAL_TIME_ZONE = "Asia/Kolkata";

const state = {
  tasks: [],
  clients: [],
  messageSchedules: [],
  dueMessages: [],
  messageTemplates: [],
  activity: [],
  briefing: null,
  conversation: [],
  master: {
    categories: [],
    priorities: [],
    statuses: [],
    owners: [],
    repeat_types: [],
  },
  currentView: "dashboard",
  filters: {
    status: "All",
    priority: "All",
    repeat: "All",
    horizon: "All",
  },
  search: "",
};

const els = {
  todayLabel: document.querySelector("#todayLabel"),
  viewTitle: document.querySelector("#viewTitle"),
  views: {
    dashboard: document.querySelector("#dashboardView"),
    tasks: document.querySelector("#tasksView"),
    calendar: document.querySelector("#calendarView"),
    board: document.querySelector("#boardView"),
    reports: document.querySelector("#reportsView"),
    clients: document.querySelector("#clientsView"),
    settings: document.querySelector("#settingsView"),
  },
  navItems: document.querySelectorAll(".nav-item"),
  quickAddBtn: document.querySelector("#quickAddBtn"),
  quickInput: document.querySelector("#quickInput"),
  parseQuickBtn: document.querySelector("#parseQuickBtn"),
  voiceBtn: document.querySelector("#voiceBtn"),
  searchInput: document.querySelector("#searchInput"),
  notificationBtn: document.querySelector("#notificationBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  dialog: document.querySelector("#taskDialog"),
  form: document.querySelector("#taskForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  deleteTaskBtn: document.querySelector("#deleteTaskBtn"),
  clientDialog: document.querySelector("#clientDialog"),
  clientForm: document.querySelector("#clientForm"),
  clientDialogTitle: document.querySelector("#clientDialogTitle"),
  deleteClientBtn: document.querySelector("#deleteClientBtn"),
  scheduleDialog: document.querySelector("#scheduleDialog"),
  scheduleForm: document.querySelector("#scheduleForm"),
  scheduleDialogTitle: document.querySelector("#scheduleDialogTitle"),
  deleteScheduleBtn: document.querySelector("#deleteScheduleBtn"),
  masterDialog: document.querySelector("#masterDialog"),
  masterForm: document.querySelector("#masterForm"),
  masterDialogTitle: document.querySelector("#masterDialogTitle"),
  deleteMasterBtn: document.querySelector("#deleteMasterBtn"),
  fields: {
    id: document.querySelector("#taskId"),
    title: document.querySelector("#taskTitle"),
    description: document.querySelector("#taskDescription"),
    category: document.querySelector("#taskCategory"),
    client_id: document.querySelector("#taskClient"),
    priority: document.querySelector("#taskPriority"),
    status: document.querySelector("#taskStatus"),
    start_date: document.querySelector("#taskStart"),
    due_date: document.querySelector("#taskDue"),
    reminder: document.querySelector("#taskReminder"),
    repeat_type: document.querySelector("#taskRepeat"),
    repeat_every: document.querySelector("#taskRepeatEvery"),
    owner: document.querySelector("#taskOwner"),
    issue: document.querySelector("#taskIssue"),
    notes: document.querySelector("#taskNotes"),
  },
  clientFields: {
    id: document.querySelector("#clientId"),
    name: document.querySelector("#clientName"),
    phone: document.querySelector("#clientPhone"),
    whatsapp: document.querySelector("#clientWhatsapp"),
    address: document.querySelector("#clientAddress"),
    gst_no: document.querySelector("#clientGst"),
    work_scope: document.querySelector("#clientWorkScope"),
    notes: document.querySelector("#clientNotes"),
  },
  scheduleFields: {
    id: document.querySelector("#scheduleId"),
    name: document.querySelector("#scheduleName"),
    message_type: document.querySelector("#scheduleMessageType"),
    channel: document.querySelector("#scheduleChannel"),
    audience: document.querySelector("#scheduleAudience"),
    cadence: document.querySelector("#scheduleCadence"),
    day_of_week: document.querySelector("#scheduleDayOfWeek"),
    day_of_month: document.querySelector("#scheduleDayOfMonth"),
    send_time: document.querySelector("#scheduleTime"),
    client_ids: document.querySelector("#scheduleClients"),
    active: document.querySelector("#scheduleActive"),
  },
  masterFields: {
    type: document.querySelector("#masterType"),
    id: document.querySelector("#masterId"),
    name: document.querySelector("#masterName"),
  },
  emptyTemplate: document.querySelector("#emptyTemplate"),
};

function todayISO() {
  return dateISO(new Date());
}

function toDate(value) {
  if (!value) return null;
  const iso = String(value).slice(0, 10);
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function dateISO(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: LOCAL_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function diffDays(a, b = todayISO()) {
  const first = toDate(a);
  const second = toDate(b);
  if (!first || !second) return 0;
  return Math.round((first - second) / 86400000);
}

function addDays(iso, days) {
  const date = toDate(iso || todayISO());
  date.setDate(date.getDate() + days);
  return dateISO(date);
}

function formatDate(iso) {
  const date = toDate(iso);
  if (!date) return "No date";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function formatTimestamp(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: LOCAL_TIME_ZONE,
  });
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function priorityWeight(priority) {
  const priorities = state.master.priorities.length ? state.master.priorities : ["Urgent", "High", "Normal", "Low"];
  const index = priorities.indexOf(priority);
  return index === -1 ? 0 : priorities.length - index;
}

function activeStatuses() {
  return state.master.statuses.filter((status) => !["Completed", "Cancelled"].includes(status));
}

function boardGroups() {
  return activeStatuses().filter((status) => ["Pending", "Going On", "Waiting", "Blocked"].includes(status)).slice(0, 4);
}

function normalizeTask(task) {
  return {
    id: task.id,
    title: task.title || "",
    description: task.description || "",
    category: task.category || "Client",
    priority: task.priority || "Normal",
    status: task.status || "Pending",
    client_id: task.client_id || "",
    start_date: task.start_date || todayISO(),
    due_date: task.due_date || "",
    reminder: Boolean(task.reminder),
    repeat_type: task.repeat_type || "None",
    repeat_every: Number(task.repeat_every || 1),
    owner: task.owner || "Me",
    issue: task.issue || "",
    notes: task.notes || "",
    created_at: task.created_at || "",
    updated_at: task.updated_at || "",
    completed_at: task.completed_at || "",
    archived: Boolean(task.archived),
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed: ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

async function loadMasterData() {
  state.master = await api(API_MASTER_DATA_URL);
  populateMasterControls();
}

async function loadTasks() {
  const tasks = await api(API_TASKS_URL);
  state.tasks = Array.isArray(tasks) ? tasks.map(normalizeTask) : [];
}

async function loadClients() {
  const clients = await api(API_CLIENTS_URL);
  state.clients = Array.isArray(clients) ? clients : [];
}

async function loadMessageSchedules() {
  const schedules = await api(API_MESSAGE_SCHEDULES_URL);
  state.messageSchedules = Array.isArray(schedules) ? schedules : [];
}

async function loadDueMessages() {
  const messages = await api(API_DUE_MESSAGES_URL);
  state.dueMessages = Array.isArray(messages) ? messages : [];
}

async function loadMessageTemplates() {
  const templates = await api(API_MESSAGE_TEMPLATES_URL);
  state.messageTemplates = Array.isArray(templates) ? templates : [];
}

async function loadActivity() {
  const activity = await api(API_ACTIVITY_URL);
  state.activity = Array.isArray(activity) ? activity : [];
}

async function loadBriefing() {
  state.briefing = await api(API_BRIEFING_URL);
}

function optionTags(values, selected = "") {
  return values.map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
}

function clientName(clientId) {
  if (!clientId) return "";
  return state.clients.find((client) => Number(client.id) === Number(clientId))?.name || "";
}

function phoneDigits(value = "") {
  return String(value).replace(/[^\d]/g, "");
}

function populateScheduleClients(selectedIds = []) {
  const selected = new Set(selectedIds.map(Number));
  els.scheduleFields.client_ids.innerHTML = state.clients
    .map((client) => `<option value="${client.id}" ${selected.has(Number(client.id)) ? "selected" : ""}>${escapeHtml(client.name)}</option>`)
    .join("");
}

function populateMasterControls() {
  els.fields.category.innerHTML = optionTags(state.master.categories);
  els.fields.priority.innerHTML = optionTags(state.master.priorities);
  els.fields.status.innerHTML = optionTags(state.master.statuses);
  els.fields.repeat_type.innerHTML = optionTags(state.master.repeat_types);
  els.fields.owner.innerHTML = optionTags(state.master.owners);
  els.fields.client_id.innerHTML = `<option value="">No client</option>${state.clients
    .map((client) => `<option value="${client.id}">${escapeHtml(client.name)}</option>`)
    .join("")}`;
  populateScheduleClients();
}

function taskDerived(task) {
  const daysLeft = diffDays(task.due_date);
  const age = Math.max(0, -diffDays(task.start_date || todayISO()));
  const isDone = ["Completed", "Cancelled"].includes(task.status);
  const hasStarted = diffDays(task.start_date || todayISO()) <= 0;
  const activeToday = hasStarted && !isDone && !task.archived;
  const overdue = Boolean(task.due_date && daysLeft < 0 && !isDone);
  const dueSoon = Boolean(task.due_date && daysLeft >= 0 && daysLeft <= 3 && !isDone);
  const attention = activeToday && (overdue || task.priority === "Urgent" || task.status === "Blocked" || task.issue);
  return { daysLeft, age, hasStarted, activeToday, overdue, dueSoon, attention, isDone };
}

function filteredTasks() {
  const q = state.search.trim().toLowerCase();
  return state.tasks
    .filter((task) => {
      if (state.filters.status !== "All" && task.status !== state.filters.status) return false;
      if (state.filters.priority !== "All" && task.priority !== state.filters.priority) return false;
      if (state.filters.repeat !== "All") {
        const isRecurring = task.repeat_type && task.repeat_type !== "None";
        if (state.filters.repeat === "Recurring" && !isRecurring) return false;
        if (state.filters.repeat === "One-time" && isRecurring) return false;
      }
      if (state.filters.horizon !== "All") {
        const derived = taskDerived(task);
        if (state.filters.horizon === "Today" && !derived.activeToday) return false;
        if (state.filters.horizon === "Overdue" && !derived.overdue) return false;
        if (state.filters.horizon === "This week" && (diffDays(task.due_date) < 0 || diffDays(task.due_date) > 7)) return false;
      }
      if (!q) return true;
      return [task.title, task.description, task.category, task.owner, task.issue, task.notes].join(" ").toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const ad = taskDerived(a);
      const bd = taskDerived(b);
      if (ad.isDone !== bd.isDone) return ad.isDone ? 1 : -1;
      if (ad.overdue !== bd.overdue) return ad.overdue ? -1 : 1;
      if (ad.attention !== bd.attention) return ad.attention ? -1 : 1;
      if (priorityWeight(a.priority) !== priorityWeight(b.priority)) return priorityWeight(b.priority) - priorityWeight(a.priority);
      return (a.due_date || "9999").localeCompare(b.due_date || "9999");
    });
}

async function completeTask(task) {
  if (!window.confirm(`Mark "${task.title}" as completed?`)) return;
  await api(`${API_TASKS_URL}/${task.id}/complete`, { method: "PUT" });
  await loadTasks();
  await loadDueMessages();
  await loadActivity();
  render();
}

async function deleteTask(task) {
  if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
  await api(`${API_TASKS_URL}/${task.id}`, { method: "DELETE" });
  await loadTasks();
  await loadDueMessages();
  await loadActivity();
  els.dialog.close();
  render();
}

function createBadge(text, color = "green") {
  return `<span class="badge ${color}">${escapeHtml(text)}</span>`;
}

function taskCard(task) {
  const d = taskDerived(task);
  const classes = ["task-card"];
  if (d.overdue) classes.push("overdue");
  if (d.dueSoon) classes.push("due-soon");
  if (d.isDone) classes.push("completed");
  const dayText = d.overdue ? `${Math.abs(d.daysLeft)} days overdue` : d.daysLeft === 0 ? "Due today" : task.due_date ? `${d.daysLeft} days left` : "No due date";
  const repeatText = task.repeat_type === "None" ? "One-time" : task.repeat_type === "Custom Days" ? `Every ${task.repeat_every} days` : task.repeat_type;
  return `
    <article class="${classes.join(" ")}" data-id="${task.id}">
      <div class="task-row">
        <div>
          <button class="task-title" data-action="edit" data-id="${task.id}">${escapeHtml(task.title)}</button>
          <div class="task-meta">${escapeHtml(task.category)}${task.client_id ? ` - ${escapeHtml(clientName(task.client_id))}` : ""} - ${formatDate(task.due_date)} - Active ${d.age} days</div>
        </div>
        ${d.isDone ? "" : `<button class="icon-button" data-action="complete" data-id="${task.id}" title="Mark complete">OK</button>`}
      </div>
      <div class="badges">
        ${createBadge(task.status, task.status === "Blocked" || task.status === "Delayed" ? "red" : task.status === "Waiting" ? "amber" : "green")}
        ${createBadge(task.priority, task.priority === "Urgent" || task.priority === "High" ? "red" : "blue")}
        ${createBadge(dayText, d.overdue ? "red" : d.dueSoon ? "amber" : "blue")}
        ${task.reminder ? createBadge("Daily visible from start", "blue") : ""}
        ${createBadge(repeatText, "green")}
      </div>
      ${task.issue ? `<div class="task-note">${escapeHtml(task.issue)}</div>` : ""}
    </article>
  `;
}

function renderTaskList(tasks, emptyText = "No matching work") {
  if (!tasks.length) {
    const node = els.emptyTemplate.content.cloneNode(true);
    node.querySelector("strong").textContent = emptyText;
    const wrap = document.createElement("div");
    wrap.append(node);
    return wrap.innerHTML;
  }
  return `<div class="task-list">${tasks.map(taskCard).join("")}</div>`;
}

function getStats() {
  const active = state.tasks.filter((task) => !taskDerived(task).isDone && !task.archived);
  return {
    total: state.tasks.length,
    active: active.length,
    today: active.filter((task) => taskDerived(task).activeToday).length,
    dueToday: active.filter((task) => diffDays(task.due_date) === 0).length,
    overdue: active.filter((task) => taskDerived(task).overdue).length,
    blocked: active.filter((task) => task.status === "Blocked" || task.issue).length,
    completed: state.tasks.filter((task) => task.status === "Completed").length,
    recurring: state.tasks.filter((task) => task.repeat_type && task.repeat_type !== "None").length,
  };
}

function renderDashboard() {
  const stats = getStats();
  const briefing = state.briefing;
  const active = state.tasks.filter((task) => !taskDerived(task).isDone && !task.archived);
  const today = active.filter((task) => taskDerived(task).activeToday);
  const overdue = active.filter((task) => taskDerived(task).overdue);
  const soon = active.filter((task) => diffDays(task.due_date) > 0 && diffDays(task.due_date) <= 7 && !taskDerived(task).activeToday);
  const blocked = active.filter((task) => task.status === "Blocked" || task.issue);

  els.views.dashboard.innerHTML = `
    <div class="metric-grid">
      <div class="metric"><span>Today's pending</span><strong>${stats.today}</strong></div>
      <div class="metric"><span>Due today</span><strong>${stats.dueToday}</strong></div>
      <div class="metric"><span>Overdue</span><strong>${stats.overdue}</strong></div>
      <div class="metric"><span>Active</span><strong>${stats.active}</strong></div>
      <div class="metric"><span>Blocked / issue</span><strong>${stats.blocked}</strong></div>
    </div>
    <div class="content-grid">
      <div class="panel">
        <div class="panel-head"><h3>Good Morning Gautam</h3><span class="mini">${briefing?.date || todayISO()}</span></div>
        <div class="briefing-list">
          <div><strong>${briefing?.pending_count ?? stats.active}</strong><span>Pending tasks</span></div>
          <div><strong>${briefing?.meeting_count ?? 0}</strong><span>Meetings</span></div>
          <div><strong>${briefing?.bni_tomorrow_count ?? 0}</strong><span>BNI tomorrow</span></div>
          <div><strong>${briefing?.overdue_count ?? stats.overdue}</strong><span>Overdue</span></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Today's pending work</h3><span class="mini">${today.length} active items</span></div>
        ${renderTaskList(today, "No pending work for today")}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Overdue work</h3><span class="mini">${overdue.length} overdue</span></div>
        ${renderTaskList(overdue, "No overdue work")}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Next 7 days</h3><span class="mini">${soon.length} upcoming</span></div>
        ${renderTaskList(soon, "No upcoming work this week")}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Issues and blockers</h3><span class="mini">${blocked.length} needs attention</span></div>
        ${renderTaskList(blocked, "No issue notes recorded")}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Recurring work</h3><span class="mini">${stats.recurring} scheduled</span></div>
        ${renderTaskList(active.filter((task) => task.repeat_type && task.repeat_type !== "None").slice(0, 8), "No recurring work yet")}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>AI suggestions</h3><span class="mini">From your data</span></div>
        <div class="task-list">
          ${(briefing?.suggestions || ["Ask: good morning, prepare me for today's meetings, or I'm going to meet Kalpesh."])
            .map((suggestion) => `<div class="task-note">${escapeHtml(suggestion)}</div>`)
            .join("")}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Recent activity</h3><span class="mini">${state.activity.length} latest</span></div>
        <div class="task-list">
          ${
            state.activity.length
              ? state.activity.slice(0, 8).map((item) => `<div class="master-row"><span>${escapeHtml(item.summary)}</span><span class="mini">${formatTimestamp(item.created_at)}</span></div>`).join("")
              : renderTaskList([], "No activity yet")
          }
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Conversation history</h3><span class="mini">${state.conversation.length} messages</span></div>
        <div class="task-list">
          ${
            state.conversation.length
              ? state.conversation.slice(-6).map((item) => `<div class="task-note"><strong>${escapeHtml(item.role)}:</strong> ${escapeHtml(item.text)}</div>`).join("")
              : "<div class='task-note'>Use the voice or Ask AI input to start.</div>"
          }
        </div>
      </div>
    </div>
  `;
}

function renderTasks() {
  const tasks = filteredTasks();
  els.views.tasks.innerHTML = `
    <div class="filters">
      <select data-filter="status">${optionTags(["All", ...state.master.statuses], state.filters.status)}</select>
      <select data-filter="priority">${optionTags(["All", ...state.master.priorities], state.filters.priority)}</select>
      <select data-filter="repeat">${optionTags(["All", "Recurring", "One-time"], state.filters.repeat)}</select>
      <select data-filter="horizon">${optionTags(["All", "Today", "This week", "Overdue"], state.filters.horizon)}</select>
    </div>
    ${renderTaskList(tasks)}
  `;
}

function renderCalendar() {
  const base = new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - start.getDay());
  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const iso = dateISO(date);
    const tasks = state.tasks.filter((task) => task.due_date === iso);
    cells.push(`
      <div class="day-cell ${iso === todayISO() ? "today" : ""}">
        <div class="day-num">${date.toLocaleDateString(undefined, { weekday: "short", day: "2-digit" })}</div>
        ${tasks.map((task) => `<button class="day-task" data-action="edit" data-id="${task.id}" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</button>`).join("")}
      </div>
    `);
  }
  els.views.calendar.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3>${base.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3>
        <span class="mini">Due-date calendar</span>
      </div>
      <div class="calendar-grid">${cells.join("")}</div>
    </div>
  `;
}

function renderBoard() {
  const active = filteredTasks();
  const groups = boardGroups();
  els.views.board.innerHTML = `<div class="board-grid">${groups
    .map((group) => {
      const tasks = active.filter((task) => task.status === group || (group === "Blocked" && task.issue));
      return `<div class="board-column"><h3>${escapeHtml(group)} - ${tasks.length}</h3>${renderTaskList(tasks, `No ${group.toLowerCase()} work`)}</div>`;
    })
    .join("")}</div>`;
}

function reportLine(label, value, total) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return `<div><div class="task-row"><span>${escapeHtml(label)}</span><strong>${value}</strong></div><div class="bar"><span style="width:${pct}%"></span></div></div>`;
}

function renderReports() {
  const stats = getStats();
  const active = state.tasks.filter((task) => !taskDerived(task).isDone);
  const byStatus = state.master.statuses.map((status) => [status, state.tasks.filter((task) => task.status === status).length]);
  const byPriority = state.master.priorities.map((priority) => [priority, state.tasks.filter((task) => task.priority === priority).length]);
  const byCategory = [...new Set(state.tasks.map((task) => task.category || "Client"))].map((category) => [category, state.tasks.filter((task) => (task.category || "Client") === category).length]);
  const aging = active.map((task) => ({ task, age: taskDerived(task).age })).sort((a, b) => b.age - a.age).slice(0, 6);

  els.views.reports.innerHTML = `
    <div class="report-grid">
      <div class="report-card"><h3>Status report</h3>${byStatus.map(([label, value]) => reportLine(label, value, stats.total)).join("")}</div>
      <div class="report-card"><h3>Priority report</h3>${byPriority.map(([label, value]) => reportLine(label, value, stats.total)).join("")}</div>
      <div class="report-card"><h3>Category report</h3>${byCategory.map(([label, value]) => reportLine(label, value, stats.total)).join("")}</div>
      <div class="report-card"><h3>Assigned to report</h3>${state.master.owners.map((owner) => reportLine(owner, state.tasks.filter((task) => task.owner === owner && !taskDerived(task).isDone).length, Math.max(stats.active, 1))).join("")}</div>
      <div class="report-card"><h3>Aging report</h3>${aging.length ? aging.map(({ task, age }) => `<p class="task-meta"><strong>${escapeHtml(task.title)}</strong><br>${age} active days - due ${formatDate(task.due_date)}</p>`).join("") : "<p class='task-meta'>No active aging yet.</p>"}</div>
      <div class="report-card"><h3>Alert report</h3>${reportLine("Today's pending", stats.today, Math.max(stats.active, 1))}${reportLine("Due today", stats.dueToday, Math.max(stats.active, 1))}${reportLine("Overdue", stats.overdue, Math.max(stats.active, 1))}${reportLine("Blocked / issue", stats.blocked, Math.max(stats.active, 1))}</div>
      <div class="report-card"><h3>Completion report</h3>${reportLine("Completed", stats.completed, Math.max(stats.total, 1))}${reportLine("Active", stats.active, Math.max(stats.total, 1))}${reportLine("Recurring", stats.recurring, Math.max(stats.total, 1))}</div>
    </div>
  `;
}

function clientBlockers(clientId) {
  return state.tasks.filter(
    (task) =>
      Number(task.client_id) === Number(clientId) &&
      !task.archived &&
      task.status !== "Completed" &&
      (task.status === "Blocked" || task.issue)
  );
}

function clientMessage(client, type) {
  let subject = client.work_scope || "your pending work";

  if (type === "notes") subject = client.notes.trim();

  if (type === "block") {
    subject = clientBlockers(client.id)
      .map((task) => task.issue || `${task.title} is blocked.`)
      .filter(Boolean)
      .join("; ");
  }

  if (!subject) return "";
  const template =
    state.messageTemplates.find((item) => item.key === `client_${type}`)?.body ||
    "Hello {client_name}, please submit required documents for {subject}.";
  return renderMessageTemplate(template, {
    client_name: client.name,
    subject,
    work_scope: subject,
    notes: subject,
    block: subject,
  });
}

function renderMessageTemplate(template, values) {
  return Object.entries(values).reduce((message, [key, value]) => message.split(`{${key}}`).join(value ?? ""), template).trim();
}

function sendClientMessage(clientId, channel, source) {
  const client = state.clients.find((item) => Number(item.id) === Number(clientId));
  if (!client) return;

  const phone = phoneDigits(channel === "whatsapp" ? client.whatsapp || client.phone : client.phone);
  if (!phone) {
    window.alert(`No ${channel === "whatsapp" ? "WhatsApp" : "SMS"} number saved for ${client.name}.`);
    return;
  }

  const type = source.closest(".client-card")?.querySelector("[data-message-type]")?.value || "general";
  const message = clientMessage(client, type);
  if (!message) {
    window.alert(`${client.name} has no ${type === "notes" ? "notes" : "block"} message saved yet.`);
    return;
  }

  const encoded = encodeURIComponent(message);
  if (channel === "whatsapp") {
    window.open(`https://wa.me/${phone}?text=${encoded}`, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.href = `sms:${phone}?body=${encoded}`;
}

function openPreparedMessage(channel, phone, message) {
  const digits = phoneDigits(phone);
  if (!digits || !message) return;
  const encoded = encodeURIComponent(message);
  if (channel === "whatsapp") {
    window.open(`https://wa.me/${digits}?text=${encoded}`, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.href = `sms:${digits}?body=${encoded}`;
}

function scheduleWhen(schedule) {
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  if (schedule.cadence === "daily") return `Daily at ${schedule.send_time}`;
  if (schedule.cadence === "weekly") return `${weekdays[Number(schedule.day_of_week)] || "Monday"} at ${schedule.send_time}`;
  return `Every ${schedule.day_of_month} at ${schedule.send_time}`;
}

function messageTypeLabel(value) {
  return { general: "General", notes: "Notes", block: "Block" }[value] || value;
}

function renderDueClientMessages() {
  return `
    <div class="panel">
      <div class="panel-head">
        <h3>Due client messages</h3>
        <span class="mini">${state.dueMessages.length} ready</span>
      </div>
      <div class="task-list">
        ${
          state.dueMessages
            .map(
              (message) => `
                <div class="master-row">
                  <div>
                    <strong>${escapeHtml(message.client_name)}</strong>
                    <div class="task-meta">${escapeHtml(message.schedule_name)} - ${messageTypeLabel(message.message_type)} - ${message.channel.toUpperCase()} - ${message.send_time}</div>
                    <div class="task-note">${escapeHtml(message.message)}</div>
                  </div>
                  <button class="secondary-button" data-action="send-due-message" data-channel="${message.channel}" data-phone="${escapeHtml(message.phone)}" data-message="${escapeHtml(message.message)}" type="button">Send</button>
                </div>
              `
            )
            .join("") || renderTaskList([], "No scheduled client messages are due right now")
        }
      </div>
    </div>
  `;
}

function renderMessageSchedules() {
  return `
    <div class="panel">
      <div class="panel-head">
        <h3>Message schedules</h3>
        <button class="primary-button" data-action="add-schedule">Add schedule</button>
      </div>
      <div class="task-list">
        ${
          state.messageSchedules
            .map((schedule) => {
              const clientCount = schedule.audience === "all" ? "All clients" : `${schedule.client_ids.length} selected`;
              return `
                <div class="master-row">
                  <div>
                    <strong>${escapeHtml(schedule.name)}</strong>
                    <div class="task-meta">${messageTypeLabel(schedule.message_type)} - ${schedule.channel.toUpperCase()} - ${clientCount} - ${scheduleWhen(schedule)}</div>
                  </div>
                  <button class="icon-button" data-action="edit-schedule" data-id="${schedule.id}" type="button">Edit</button>
                </div>
              `;
            })
            .join("") || renderTaskList([], "No client message schedules yet")
        }
      </div>
    </div>
  `;
}

function renderClients() {
  els.views.clients.innerHTML = `
    ${renderDueClientMessages()}
    ${renderMessageSchedules()}
    <div class="panel">
      <div class="panel-head">
        <h3>Clients</h3>
        <button class="primary-button" data-action="add-client">Add client</button>
      </div>
      <div class="client-grid">
        ${state.clients
          .map((client) => {
            const blockers = clientBlockers(client.id);
            return `
              <article class="client-card">
                <div class="task-row">
                  <div>
                    <button class="task-title" data-action="edit-client" data-id="${client.id}">${escapeHtml(client.name)}</button>
                    <div class="task-meta">${escapeHtml(client.phone || "No phone")} - GST: ${escapeHtml(client.gst_no || "Not set")}</div>
                  </div>
                </div>
                <div class="task-note">${escapeHtml(client.work_scope || "No work scope recorded")}</div>
                <div class="badges">
                  ${client.address ? createBadge("Address saved", "blue") : ""}
                  ${client.notes ? createBadge("Notes", "green") : ""}
                  ${blockers.length ? createBadge(`${blockers.length} Block`, "red") : ""}
                </div>
                <label class="message-select">
                  <span>Message</span>
                  <select data-message-type>
                    <option value="general">General</option>
                    <option value="notes">Notes</option>
                    <option value="block">Block</option>
                  </select>
                </label>
                <div class="inline-actions">
                  <button class="secondary-button link-button" data-action="client-message" data-channel="whatsapp" data-id="${client.id}" type="button">WhatsApp</button>
                  <button class="secondary-button link-button" data-action="client-message" data-channel="sms" data-id="${client.id}" type="button">SMS</button>
                </div>
              </article>
            `;
          })
          .join("") || renderTaskList([], "No clients added yet")}
      </div>
    </div>
  `;
}

function masterList(title, type, items) {
  return `
    <div class="report-card">
      <div class="panel-head">
        <h3>${title}</h3>
        <button class="secondary-button" data-action="add-master" data-type="${type}">Add</button>
      </div>
      <div class="task-list">
        ${items
          .map((item) => `
            <div class="master-row">
              <span>${escapeHtml(item.name)}</span>
              <button class="icon-button" data-action="edit-master" data-type="${type}" data-id="${item.id}" data-name="${escapeHtml(item.name)}">Edit</button>
            </div>
          `)
          .join("")}
      </div>
    </div>
  `;
}

const TEMPLATE_VARIABLES = {
  client_general: [
    ["client_name", "Client name"],
    ["work_scope", "Work scope"],
    ["subject", "Selected message subject"],
  ],
  client_notes: [
    ["client_name", "Client name"],
    ["notes", "Client notes"],
    ["subject", "Selected message subject"],
  ],
  client_block: [
    ["client_name", "Client name"],
    ["block", "Block / issue text"],
    ["subject", "Selected message subject"],
  ],
  telegram_daily: [
    ["pending_count", "Pending tasks"],
    ["due_today_count", "Due today"],
    ["overdue_count", "Overdue"],
    ["meeting_count", "Meetings"],
    ["bni_tomorrow_count", "BNI tomorrow"],
  ],
};

function templateVariableButtons(templateKey) {
  const variables = TEMPLATE_VARIABLES[templateKey] || [];
  return variables
    .map(
      ([name, label]) => `
        <button class="variable-chip" data-action="insert-template-variable" data-key="${escapeHtml(templateKey)}" data-variable="{${escapeHtml(name)}}" title="${escapeHtml(label)}" type="button">
          {${escapeHtml(name)}}
        </button>
      `
    )
    .join("");
}

function messageTemplateList() {
  return `
    <div class="panel">
      <div class="panel-head">
        <h3>Message templates</h3>
        <span class="mini">${state.messageTemplates.length} editable</span>
      </div>
      <div class="template-list">
        ${state.messageTemplates
          .map(
            (template) => `
              <article class="template-card">
                <div class="panel-head">
                  <h3>${escapeHtml(template.name)}</h3>
                  <button class="secondary-button" data-action="save-template" data-key="${escapeHtml(template.key)}" type="button">Save</button>
                </div>
                <textarea data-template-body="${escapeHtml(template.key)}" rows="4">${escapeHtml(template.body)}</textarea>
                <div class="variable-list" aria-label="Template variables">
                  ${templateVariableButtons(template.key)}
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderSettings() {
  els.views.settings.innerHTML = `
    <div class="report-grid">
      ${masterList("Categories", "categories", state.master.category_items || [])}
      ${masterList("Assigned to / staff", "owners", state.master.owner_items || [])}
    </div>
    ${messageTemplateList()}
  `;
}

function assistantResponseText(response) {
  if (response.action === "BRIEFING" && response.briefing) {
    const priorities = (response.briefing.priorities || []).map((task) => task.title).slice(0, 4).join(", ");
    return `${response.message}${priorities ? ` Priorities: ${priorities}.` : ""}`;
  }
  if (response.action === "CLIENT_CONTEXT" && response.client) {
    const pending = (response.pending_tasks || []).map((task) => task.title).slice(0, 4).join(", ");
    return `${response.message}${pending ? ` Pending: ${pending}.` : ""}`;
  }
  if (response.action === "MEETING_PREP") {
    const tasks = (response.tasks || []).map((task) => task.title).slice(0, 5).join(", ");
    return `${response.message}${tasks ? ` Prepare for: ${tasks}.` : ""}`;
  }
  return response.message || "Done.";
}

function render() {
  els.todayLabel.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  els.viewTitle.textContent = state.currentView[0].toUpperCase() + state.currentView.slice(1);
  Object.entries(els.views).forEach(([key, view]) => view.classList.toggle("active-view", key === state.currentView));
  els.navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === state.currentView));
  renderDashboard();
  renderTasks();
  renderCalendar();
  renderBoard();
  renderReports();
  renderClients();
  renderSettings();
  checkNotificationHints();
}

function openTaskDialog(task = null) {
  els.form.reset();
  populateMasterControls();
  els.deleteTaskBtn.hidden = !task;
  els.dialogTitle.textContent = task ? "Edit work" : "Add work";
  const defaults = {
    id: "",
    title: "",
    description: "",
    category: state.master.categories[0] || "Client",
    client_id: "",
    priority: state.master.priorities[0] || "Normal",
    status: state.master.statuses[0] || "Pending",
    start_date: todayISO(),
    due_date: "",
    reminder: true,
    repeat_type: "None",
    repeat_every: 1,
    owner: state.master.owners[0] || "Me",
    issue: "",
    notes: "",
  };
  const data = { ...defaults, ...(task || {}) };
  Object.entries(els.fields).forEach(([key, field]) => {
    if (field.type === "checkbox") field.checked = Boolean(data[key]);
    else field.value = data[key] ?? "";
  });
  els.dialog.showModal();
}

function readForm() {
  return {
    title: els.fields.title.value.trim(),
    description: els.fields.description.value.trim(),
    category: els.fields.category.value || "Client",
    priority: els.fields.priority.value,
    status: els.fields.status.value,
    client_id: els.fields.client_id.value ? Number(els.fields.client_id.value) : null,
    start_date: els.fields.start_date.value || todayISO(),
    due_date: els.fields.due_date.value || null,
    reminder: els.fields.reminder.checked,
    repeat_type: els.fields.repeat_type.value || "None",
    repeat_every: Number(els.fields.repeat_every.value || 1),
    owner: els.fields.owner.value.trim() || "Me",
    issue: els.fields.issue.value.trim(),
    notes: els.fields.notes.value.trim(),
    archived: false,
  };
}

function openClientDialog(client = null) {
  els.clientForm.reset();
  els.deleteClientBtn.hidden = !client;
  els.clientDialogTitle.textContent = client ? "Edit client" : "Add client";
  const defaults = {
    id: "",
    name: "",
    phone: "",
    whatsapp: "",
    address: "",
    gst_no: "",
    work_scope: "",
    notes: "",
  };
  const data = { ...defaults, ...(client || {}) };
  Object.entries(els.clientFields).forEach(([key, field]) => {
    field.value = data[key] ?? "";
  });
  els.clientDialog.showModal();
}

function readClientForm() {
  return {
    name: els.clientFields.name.value.trim(),
    phone: els.clientFields.phone.value.trim(),
    whatsapp: els.clientFields.whatsapp.value.trim(),
    address: els.clientFields.address.value.trim(),
    gst_no: els.clientFields.gst_no.value.trim(),
    work_scope: els.clientFields.work_scope.value.trim(),
    notes: els.clientFields.notes.value.trim(),
    active: true,
  };
}

async function saveClientForm(event) {
  event.preventDefault();
  const payload = readClientForm();
  if (!payload.name) return;
  const id = els.clientFields.id.value;
  if (!window.confirm(`${id ? "Edit" : "Add"} client "${payload.name}"?`)) return;
  await api(id ? `${API_CLIENTS_URL}/${id}` : API_CLIENTS_URL, {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload),
  });
  await loadClients();
  await loadDueMessages();
  await loadActivity();
  populateMasterControls();
  els.clientDialog.close();
  render();
}

async function deleteClientFromDialog() {
  const id = els.clientFields.id.value;
  if (!id || !window.confirm("Delete this client? Existing task history will remain.")) return;
  await api(`${API_CLIENTS_URL}/${id}`, { method: "DELETE" });
  await loadClients();
  await loadMessageSchedules();
  await loadDueMessages();
  await loadActivity();
  populateMasterControls();
  els.clientDialog.close();
  render();
}

function openScheduleDialog(schedule = null) {
  els.scheduleForm.reset();
  els.deleteScheduleBtn.hidden = !schedule;
  els.scheduleDialogTitle.textContent = schedule ? "Edit schedule" : "Add schedule";
  const defaults = {
    id: "",
    name: "",
    message_type: "general",
    channel: "whatsapp",
    audience: "all",
    cadence: "weekly",
    day_of_week: 0,
    day_of_month: 1,
    send_time: "10:00",
    client_ids: [],
    active: true,
  };
  const data = { ...defaults, ...(schedule || {}) };
  els.scheduleFields.id.value = data.id || "";
  els.scheduleFields.name.value = data.name;
  els.scheduleFields.message_type.value = data.message_type;
  els.scheduleFields.channel.value = data.channel;
  els.scheduleFields.audience.value = data.audience;
  els.scheduleFields.cadence.value = data.cadence;
  els.scheduleFields.day_of_week.value = data.day_of_week;
  els.scheduleFields.day_of_month.value = data.day_of_month;
  els.scheduleFields.send_time.value = data.send_time;
  els.scheduleFields.active.checked = Boolean(data.active);
  populateScheduleClients(data.client_ids || []);
  els.scheduleDialog.showModal();
}

function readScheduleForm() {
  return {
    name: els.scheduleFields.name.value.trim(),
    message_type: els.scheduleFields.message_type.value,
    channel: els.scheduleFields.channel.value,
    audience: els.scheduleFields.audience.value,
    cadence: els.scheduleFields.cadence.value,
    day_of_week: Number(els.scheduleFields.day_of_week.value || 0),
    day_of_month: Number(els.scheduleFields.day_of_month.value || 1),
    send_time: els.scheduleFields.send_time.value,
    client_ids: Array.from(els.scheduleFields.client_ids.selectedOptions).map((option) => Number(option.value)),
    active: els.scheduleFields.active.checked,
  };
}

async function saveScheduleForm(event) {
  event.preventDefault();
  const payload = readScheduleForm();
  if (payload.audience === "selected" && !payload.client_ids.length) {
    window.alert("Select at least one client for this schedule.");
    return;
  }
  const id = els.scheduleFields.id.value;
  if (!window.confirm(`${id ? "Edit" : "Add"} message schedule "${payload.name}"?`)) return;
  await api(id ? `${API_MESSAGE_SCHEDULES_URL}/${id}` : API_MESSAGE_SCHEDULES_URL, {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload),
  });
  await loadMessageSchedules();
  await loadDueMessages();
  await loadActivity();
  els.scheduleDialog.close();
  render();
}

async function deleteScheduleFromDialog() {
  const id = els.scheduleFields.id.value;
  if (!id || !window.confirm("Delete this message schedule?")) return;
  await api(`${API_MESSAGE_SCHEDULES_URL}/${id}`, { method: "DELETE" });
  await loadMessageSchedules();
  await loadDueMessages();
  await loadActivity();
  els.scheduleDialog.close();
  render();
}

function openMasterDialog(type, item = null) {
  els.masterForm.reset();
  els.masterFields.type.value = type;
  els.masterFields.id.value = item?.id || "";
  els.masterFields.name.value = item?.name || "";
  els.deleteMasterBtn.hidden = !item;
  els.masterDialogTitle.textContent = `${item ? "Edit" : "Add"} ${type === "owners" ? "assignee" : "category"}`;
  els.masterDialog.showModal();
}

async function saveMasterForm(event) {
  event.preventDefault();
  const type = els.masterFields.type.value;
  const id = els.masterFields.id.value;
  const name = els.masterFields.name.value.trim();
  if (!type || !name) return;
  if (!window.confirm(`${id ? "Edit" : "Add"} ${type === "owners" ? "assignee" : "category"} "${name}"?`)) return;
  await api(id ? `${API_MASTER_DATA_URL}/${type}/${id}` : `${API_MASTER_DATA_URL}/${type}`, {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(id ? { name, active: true } : { name }),
  });
  await loadMasterData();
  await loadTasks();
  await loadActivity();
  populateMasterControls();
  els.masterDialog.close();
  render();
}

async function deleteMasterFromDialog() {
  const type = els.masterFields.type.value;
  const id = els.masterFields.id.value;
  if (!type || !id || !window.confirm("Delete this item from future dropdowns?")) return;
  await api(`${API_MASTER_DATA_URL}/${type}/${id}`, { method: "DELETE" });
  await loadMasterData();
  await loadActivity();
  populateMasterControls();
  els.masterDialog.close();
  render();
}

async function saveMessageTemplate(templateKey) {
  const selectorKey = window.CSS?.escape ? CSS.escape(templateKey) : templateKey;
  const field = document.querySelector(`[data-template-body="${selectorKey}"]`);
  const template = state.messageTemplates.find((item) => item.key === templateKey);
  if (!field || !template) return;
  const body = field.value.trim();
  if (!body) {
    window.alert("Message template cannot be blank.");
    return;
  }
  if (!window.confirm(`Save message template "${template.name}"?`)) return;
  await api(`${API_MESSAGE_TEMPLATES_URL}/${templateKey}`, {
    method: "PUT",
    body: JSON.stringify({ body, active: true }),
  });
  await loadMessageTemplates();
  await loadDueMessages();
  await loadActivity();
  render();
}

function insertTemplateVariable(templateKey, variable) {
  const selectorKey = window.CSS?.escape ? CSS.escape(templateKey) : templateKey;
  const field = document.querySelector(`[data-template-body="${selectorKey}"]`);
  if (!field) return;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  field.value = `${field.value.slice(0, start)}${variable}${field.value.slice(end)}`;
  const nextPosition = start + variable.length;
  field.focus();
  field.setSelectionRange(nextPosition, nextPosition);
}

async function saveForm(event) {
  event.preventDefault();
  const payload = readForm();
  if (!payload.title) return;
  const id = els.fields.id.value;
  if (!window.confirm(`${id ? "Edit" : "Add"} task "${payload.title}"?`)) return;
  await api(id ? `${API_TASKS_URL}/${id}` : API_TASKS_URL, {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload),
  });
  await loadTasks();
  await loadDueMessages();
  await loadActivity();
  els.dialog.close();
  render();
}

function parseSpokenDate(text) {
  const monthNames = "jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december";
  const monthMatch = text.match(new RegExp(`(?:due|by|on)?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})(?:\\s+(\\d{4}))?`, "i"));
  if (!monthMatch) return "";
  const date = new Date(`${monthMatch[1]} ${monthMatch[2]} ${monthMatch[3] || new Date().getFullYear()}`);
  if (Number.isNaN(date.getTime())) return "";
  if (!monthMatch[3] && dateISO(date) < todayISO()) date.setFullYear(date.getFullYear() + 1);
  return dateISO(date);
}

function cleanQuickTitle(text) {
  return text
    .replace(/\b(add|create|new task|remind me to)\b/gi, "")
    .replace(/\b(due|by)\s+in\s+\d+\s+days?.*/gi, "")
    .replace(/\b(due|by|on)\s+\d{1,2}(?:st|nd|rd|th)?\s+\w+(?:\s+\d{4})?.*/gi, "")
    .replace(/\b(every|daily|weekly|monthly|quarterly|yearly|tomorrow|today|high priority|urgent|low priority|normal priority).*/gi, "")
    .trim();
}

function parseQuickText(text) {
  const lower = text.toLowerCase();
  const task = {
    title: cleanQuickTitle(text) || text,
    description: text,
    category: lower.includes("friend") ? "Friend" : lower.includes("personal") ? "Personal" : lower.includes("payment") || lower.includes("pay") ? "Finance" : "Client",
    priority: lower.includes("urgent") ? "Urgent" : lower.includes("high") ? "High" : lower.includes("low") ? "Low" : "Normal",
    status: "Pending",
    client_id: null,
    start_date: todayISO(),
    due_date: todayISO(),
    reminder: true,
    repeat_type: "None",
    repeat_every: 1,
    owner: "Me",
    issue: "",
    notes: `Captured from: ${text}`,
    archived: false,
  };

  if (lower.includes("tomorrow")) task.due_date = addDays(todayISO(), 1);
  const dueIn = lower.match(/due in (\d+) days?/);
  if (dueIn) task.due_date = addDays(todayISO(), Number(dueIn[1]));
  const spokenDate = parseSpokenDate(text);
  if (spokenDate) task.due_date = spokenDate;
  const onDay = lower.match(/(?:on|by) (?:the )?(\d{1,2})(?:st|nd|rd|th)?/);
  if (onDay && !spokenDate) {
    const date = toDate(todayISO());
    date.setDate(Math.min(28, Number(onDay[1])));
    if (dateISO(date) < todayISO()) date.setMonth(date.getMonth() + 1);
    task.due_date = dateISO(date);
  }

  if (lower.includes("daily") || lower.includes("every day")) task.repeat_type = "Daily";
  else if (lower.includes("weekly") || lower.includes("every week")) task.repeat_type = "Weekly";
  else if (lower.includes("monthly") || lower.includes("every month")) task.repeat_type = "Monthly";
  else if (lower.includes("quarter")) task.repeat_type = "Quarterly";
  else if (lower.includes("yearly") || lower.includes("annual")) task.repeat_type = "Yearly";

  return task;
}

async function runAssistantCommand(text) {
  const response = await api(API_ASSISTANT_URL, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  state.conversation.push({ role: "You", text });
  state.conversation.push({ role: "GPA", text: assistantResponseText(response) });
  await loadTasks();
  await loadDueMessages();
  await loadActivity();
  await loadBriefing();
  render();
  return response;
}

async function captureQuick() {
  const text = els.quickInput.value.trim();
  if (!text) return;
  if (!window.confirm(`Send this command to GPA AI?\n\n${text}`)) return;
  await runAssistantCommand(text);
  els.quickInput.value = "";
}

function showVoiceNotice(message) {
  els.voiceBtn.title = message;
  els.voiceBtn.setAttribute("aria-label", message);
  els.voiceBtn.addEventListener("click", () => window.alert(message));
}

function setupVoice() {
  if (!window.isSecureContext) {
    showVoiceNotice("Voice commands need HTTPS on VPS. Open GPA with https:// or use localhost while developing.");
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showVoiceNotice("Voice capture is supported in Chrome or Edge. Type the command here for now.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => els.voiceBtn.classList.add("listening");
  recognition.onend = () => els.voiceBtn.classList.remove("listening");
  recognition.onerror = (event) => {
    els.voiceBtn.classList.remove("listening");
    const message =
      event.error === "not-allowed"
        ? "Microphone permission is blocked. Allow microphone access in your browser settings and try again."
        : `Voice capture failed: ${event.error}. You can type the same command here.`;
    window.alert(message);
  };
  recognition.onresult = (event) => {
    els.quickInput.value = event.results[0][0].transcript;
    captureQuick();
  };
  els.voiceBtn.addEventListener("click", () => {
    try {
      recognition.start();
    } catch (error) {
      window.alert("Voice capture is already starting. Please wait a moment and try again if needed.");
    }
  });
}

function checkNotificationHints() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  if (settings.lastNotificationDate === todayISO()) return;
  const pending = state.tasks.filter((task) => taskDerived(task).activeToday);
  const priority = pending.filter((task) => taskDerived(task).overdue || task.priority === "Urgent");
  if (!pending.length) return;
  new Notification("Gautam's PA", {
    body: `${pending.length} pending work item${pending.length > 1 ? "s" : ""} today. ${priority.length} priority alert${priority.length === 1 ? "" : "s"}.`,
  });
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, lastNotificationDate: todayISO() }));
}

function exportCSV() {
  const headers = ["Title", "Category", "Priority", "Status", "Start", "Due", "Repeat", "Owner", "Issue", "Notes", "Created", "Updated", "Completed"];
  const rows = state.tasks.map((task) =>
    [
      task.title,
      task.category,
      task.priority,
      task.status,
      task.start_date,
      task.due_date,
      task.repeat_type,
      task.owner,
      task.issue,
      task.notes,
      formatTimestamp(task.created_at),
      formatTimestamp(task.updated_at),
      formatTimestamp(task.completed_at),
    ]
      .map((value) => `"${String(value || "").replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gpa-v3-tasks-${todayISO()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  els.navItems.forEach((item) =>
    item.addEventListener("click", () => {
      state.currentView = item.dataset.view;
      render();
    })
  );
  els.quickAddBtn.addEventListener("click", () => openTaskDialog());
  els.parseQuickBtn.addEventListener("click", captureQuick);
  els.quickInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") captureQuick();
  });
  document.querySelectorAll(".chip").forEach((chip) =>
    chip.addEventListener("click", () => {
      els.quickInput.value = chip.dataset.template;
      captureQuick();
    })
  );
  els.searchInput.addEventListener("input", () => {
    state.search = els.searchInput.value;
    render();
  });
  els.form.addEventListener("submit", saveForm);
  els.clientForm.addEventListener("submit", saveClientForm);
  els.scheduleForm.addEventListener("submit", saveScheduleForm);
  els.masterForm.addEventListener("submit", saveMasterForm);
  els.deleteTaskBtn.addEventListener("click", () => {
    const task = state.tasks.find((item) => String(item.id) === String(els.fields.id.value));
    if (task) deleteTask(task);
  });
  els.deleteClientBtn.addEventListener("click", deleteClientFromDialog);
  els.deleteScheduleBtn.addEventListener("click", deleteScheduleFromDialog);
  els.deleteMasterBtn.addEventListener("click", deleteMasterFromDialog);
  document.body.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    if (target.dataset.action === "add-client") {
      openClientDialog();
      return;
    }
    if (target.dataset.action === "edit-client") {
      const client = state.clients.find((item) => String(item.id) === String(target.dataset.id));
      if (client) openClientDialog(client);
      return;
    }
    if (target.dataset.action === "client-message") {
      sendClientMessage(target.dataset.id, target.dataset.channel, target);
      return;
    }
    if (target.dataset.action === "send-due-message") {
      openPreparedMessage(target.dataset.channel, target.dataset.phone, target.dataset.message);
      return;
    }
    if (target.dataset.action === "add-schedule") {
      openScheduleDialog();
      return;
    }
    if (target.dataset.action === "edit-schedule") {
      const schedule = state.messageSchedules.find((item) => String(item.id) === String(target.dataset.id));
      if (schedule) openScheduleDialog(schedule);
      return;
    }
    if (target.dataset.action === "add-master") {
      openMasterDialog(target.dataset.type);
      return;
    }
    if (target.dataset.action === "edit-master") {
      openMasterDialog(target.dataset.type, {
        id: target.dataset.id,
        name: target.dataset.name,
      });
      return;
    }
    if (target.dataset.action === "save-template") {
      saveMessageTemplate(target.dataset.key);
      return;
    }
    if (target.dataset.action === "insert-template-variable") {
      insertTemplateVariable(target.dataset.key, target.dataset.variable);
      return;
    }
    const task = state.tasks.find((item) => String(item.id) === String(target.dataset.id));
    if (!task) return;
    if (target.dataset.action === "edit") openTaskDialog(task);
    if (target.dataset.action === "complete") completeTask(task);
  });
  document.body.addEventListener("change", (event) => {
    const target = event.target.closest("[data-filter]");
    if (!target) return;
    state.filters[target.dataset.filter] = target.value;
    render();
  });
  els.notificationBtn.addEventListener("click", async () => {
    if (!("Notification" in window)) {
      window.alert("This browser does not support browser alerts. Telegram daily reminders will still work from the VPS.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      window.alert("Browser alerts are enabled. They work only while this browser allows GPA notifications. Telegram reminders are separate and run from the VPS.");
    } else {
      window.alert("Browser alerts were not enabled. You can still receive Telegram reminders if the Telegram timer is configured on the VPS.");
    }
    checkNotificationHints();
  });
  els.exportBtn.addEventListener("click", exportCSV);
}

async function init() {
  try {
    await loadMasterData();
    await loadMessageTemplates();
    await loadClients();
    populateMasterControls();
    await loadTasks();
    await loadMessageSchedules();
    await loadDueMessages();
    await loadActivity();
    await loadBriefing();
    bindEvents();
    setupVoice();
    render();
  } catch (error) {
    document.body.innerHTML = `<main class="main"><div class="panel"><h2>GPA V3 could not load</h2><p class="task-meta">${escapeHtml(error.message)}</p></div></main>`;
  }
}

init();
