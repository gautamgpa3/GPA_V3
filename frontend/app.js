const STORAGE_KEY = "work-pulse-tasks-v1";
const SETTINGS_KEY = "work-pulse-settings-v1";
const API_TASKS_URL = "http://127.0.0.1:8000/api/tasks/";

const statusGroups = ["Pending", "Going On", "Waiting", "Blocked", "Completed", "Delayed", "Cancelled"];
const boardGroups = ["Pending", "Going On", "Blocked", "Completed"];
const priorityWeight = { Urgent: 4, High: 3, Normal: 2, Low: 1 };
const LOCAL_TIME_ZONE = "Asia/Kolkata";

const state = {
  tasks: [],
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
  fields: {
    id: document.querySelector("#taskId"),
    title: document.querySelector("#taskTitle"),
    description: document.querySelector("#taskDescription"),
    category: document.querySelector("#taskCategory"),
    priority: document.querySelector("#taskPriority"),
    status: document.querySelector("#taskStatus"),
    start: document.querySelector("#taskStart"),
    due: document.querySelector("#taskDue"),
    reminder: document.querySelector("#taskReminder"),
    repeat: document.querySelector("#taskRepeat"),
    repeatEvery: document.querySelector("#taskRepeatEvery"),
    owner: document.querySelector("#taskOwner"),
    issue: document.querySelector("#taskIssue"),
  },
  emptyTemplate: document.querySelector("#emptyTemplate"),
};

function todayISO() {
  return dateISO(new Date());
}

function toDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
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

function localTimestamp(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: LOCAL_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} IST`;
}

function formatLocalTimestamp(value) {
  if (!value) return "";
  if (String(value).endsWith("IST")) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return localTimestamp(parsed);
}

function addDays(iso, days) {
  const date = toDate(iso || todayISO());
  date.setDate(date.getDate() + days);
  return dateISO(date);
}

function addMonths(iso, months) {
  const date = toDate(iso || todayISO());
  const originalDay = date.getDate();
  date.setMonth(date.getMonth() + months);
  if (date.getDate() !== originalDay) date.setDate(0);
  return dateISO(date);
}

function diffDays(a, b = todayISO()) {
  const first = toDate(a);
  const second = toDate(b);
  if (!first || !second) return 0;
  return Math.round((first - second) / 86400000);
}

function formatDate(iso) {
  if (!iso) return "No date";
  return toDate(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function uid() {
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function loadTasks() {
  try {
    const response = await fetch(API_TASKS_URL, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Unable to load tasks");
    }

    const remoteTasks = await response.json();

    state.tasks = Array.isArray(remoteTasks) ? remoteTasks : [];

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));

  } catch (error) {
    console.error("Error loading tasks:", error);
    state.tasks = [];
  }
}

async function saveTasks() {
  // Temporary - do nothing.
  // Backend APIs will be called directly by create/update/delete functions.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
}

function taskDerived(task) {
  const daysLeft = diffDays(task.due);
  const age = Math.max(0, -diffDays(task.start || todayISO()));
  const isDone = task.status === "Completed" || task.status === "Cancelled";
  const hasStarted = diffDays(task.start || todayISO()) <= 0;
  const activeToday = hasStarted && !isDone;
  const overdue = task.due && daysLeft < 0 && !isDone;
  const dueSoon = task.due && daysLeft >= 0 && daysLeft <= 3 && !isDone;
  const reminderDue = task.due && daysLeft <= Number(task.reminder || 0) && !isDone;
  const attention = activeToday && (overdue || reminderDue || task.priority === "Urgent" || task.status === "Blocked" || task.issue);
  return { daysLeft, age, hasStarted, activeToday, overdue, dueSoon, reminderDue, attention, isDone };
}

function filteredTasks() {
  const q = state.search.trim().toLowerCase();
  return state.tasks
    .filter((task) => {
      if (state.filters.status !== "All" && task.status !== state.filters.status) return false;
      if (state.filters.priority !== "All" && task.priority !== state.filters.priority) return false;
      if (state.filters.repeat !== "All") {
        const isRecurring = task.repeat && task.repeat !== "none";
        if (state.filters.repeat === "Recurring" && !isRecurring) return false;
        if (state.filters.repeat === "One-time" && isRecurring) return false;
      }
      if (state.filters.horizon !== "All") {
        const d = taskDerived(task);
        if (state.filters.horizon === "Today" && !d.activeToday) return false;
        if (state.filters.horizon === "Overdue" && !d.overdue) return false;
        if (state.filters.horizon === "This week" && (diffDays(task.due) < 0 || diffDays(task.due) > 7)) return false;
      }
      if (!q) return true;
      return [task.title, task.description, task.category, task.owner, task.issue, ...(task.notes || []).map((n) => n.text)]
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => {
      const ad = taskDerived(a);
      const bd = taskDerived(b);
      if (ad.isDone !== bd.isDone) return ad.isDone ? 1 : -1;
      if (ad.overdue !== bd.overdue) return ad.overdue ? -1 : 1;
      if (ad.reminderDue !== bd.reminderDue) return ad.reminderDue ? -1 : 1;
      if (ad.attention !== bd.attention) return ad.attention ? -1 : 1;
      if (priorityWeight[a.priority] !== priorityWeight[b.priority]) return priorityWeight[b.priority] - priorityWeight[a.priority];
      if ((a.due || "") !== (b.due || "")) return (a.due || "9999").localeCompare(b.due || "9999");
      return (a.title || "").localeCompare(b.title || "");
    });
}

function nextDueDate(task) {
  if (!task.due) return "";
  if (task.repeat === "daily") return addDays(task.due, 1);
  if (task.repeat === "weekly") return addDays(task.due, 7);
  if (task.repeat === "monthly") return addMonths(task.due, 1);
  if (task.repeat === "quarterly") return addMonths(task.due, 3);
  if (task.repeat === "yearly") return addMonths(task.due, 12);
  if (task.repeat === "custom") return addDays(task.due, Number(task.repeatEvery || 1));
  return "";
}

function completeTask(task) {
  if (!window.confirm(`Mark "${task.title}" as completed?`)) return;
  const updated = { ...task, status: "Completed", completedAt: localTimestamp(), updatedAt: localTimestamp() };
  const index = state.tasks.findIndex((item) => item.id === task.id);
  state.tasks[index] = updated;

  const nextDue = nextDueDate(updated);
  if (nextDue) {
    state.tasks.push({
      ...updated,
      id: uid(),
      status: "Pending",
      start: nextDue,
      due: nextDue,
      issue: "",
      notes: [{ at: localTimestamp(), text: `Auto-created from recurring work after ${formatDate(task.due)} was completed.` }],
      createdAt: localTimestamp(),
      updatedAt: localTimestamp(),
      completedAt: "",
    });
  }
  saveTasks();
  render();
}

function createBadge(text, color = "green") {
  return `<span class="badge ${color}">${escapeHtml(text)}</span>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function taskCard(task) {
  const d = taskDerived(task);
  const classes = ["task-card"];
  if (d.overdue) classes.push("overdue");
  if (d.dueSoon) classes.push("due-soon");
  if (d.reminderDue) classes.push("reminder-due");
  if (d.isDone) classes.push("completed");
  const dayText = d.overdue ? `${Math.abs(d.daysLeft)} days overdue` : d.daysLeft === 0 ? "Due today" : `${d.daysLeft} days left`;
  const repeatText = task.repeat && task.repeat !== "none" ? task.repeat === "custom" ? `Every ${task.repeatEvery} days` : task.repeat : "One-time";
  const reminderText = d.reminderDue ? "Reminder priority" : `${task.reminder || 0} day reminder`;
  return `
    <article class="${classes.join(" ")}" data-id="${task.id}">
      <div class="task-row">
        <div>
          <button class="task-title" data-action="edit" data-id="${task.id}">${escapeHtml(task.title)}</button>
          <div class="task-meta">${escapeHtml(task.category || "General")} · ${formatDate(task.due)} · Active ${d.age} days</div>
        </div>
        <button class="icon-button" data-action="complete" data-id="${task.id}" title="Mark complete">✓</button>
      </div>
      <div class="badges">
        ${createBadge(task.status, task.status === "Blocked" || task.status === "Delayed" ? "red" : task.status === "Waiting" ? "amber" : "green")}
        ${createBadge(task.priority, task.priority === "Urgent" || task.priority === "High" ? "red" : "blue")}
        ${createBadge(dayText, d.overdue ? "red" : d.dueSoon ? "amber" : "blue")}
        ${createBadge(reminderText, d.reminderDue ? "red" : "blue")}
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
  const active = state.tasks.filter((t) => !taskDerived(t).isDone);
  return {
    total: state.tasks.length,
    active: active.length,
    today: active.filter((t) => taskDerived(t).activeToday).length,
    dueToday: active.filter((t) => diffDays(t.due) === 0).length,
    reminders: active.filter((t) => taskDerived(t).reminderDue).length,
    overdue: active.filter((t) => taskDerived(t).overdue).length,
    blocked: active.filter((t) => t.status === "Blocked" || t.issue).length,
    completed: state.tasks.filter((t) => t.status === "Completed").length,
    recurring: state.tasks.filter((t) => t.repeat && t.repeat !== "none").length,
  };
}

function renderDashboard() {
  const stats = getStats();
  const active = state.tasks.filter((t) => !taskDerived(t).isDone);
  const today = active.filter((t) => taskDerived(t).activeToday).sort((a, b) => {
    const ad = taskDerived(a);
    const bd = taskDerived(b);
    if (ad.overdue !== bd.overdue) return ad.overdue ? -1 : 1;
    if (ad.reminderDue !== bd.reminderDue) return ad.reminderDue ? -1 : 1;
    if (priorityWeight[a.priority] !== priorityWeight[b.priority]) return priorityWeight[b.priority] - priorityWeight[a.priority];
    return (a.due || "9999").localeCompare(b.due || "9999");
  });
  const overdue = active.filter((t) => taskDerived(t).overdue);
  const reminders = active.filter((t) => taskDerived(t).reminderDue);
  const soon = active.filter((t) => diffDays(t.due) > 0 && diffDays(t.due) <= 7 && !taskDerived(t).activeToday);
  const blocked = active.filter((t) => t.status === "Blocked" || t.issue);

  els.views.dashboard.innerHTML = `
    <div class="metric-grid">
      <div class="metric"><span>Today's pending</span><strong>${stats.today}</strong></div>
      <div class="metric"><span>Reminder priority</span><strong>${stats.reminders}</strong></div>
      <div class="metric"><span>Overdue</span><strong>${stats.overdue}</strong></div>
      <div class="metric"><span>Active</span><strong>${stats.active}</strong></div>
      <div class="metric"><span>Blocked / issue</span><strong>${stats.blocked}</strong></div>
    </div>
    <div class="content-grid">
      <div class="panel">
        <div class="panel-head"><h3>Today's pending work</h3><span class="mini">${today.length} active items</span></div>
        ${renderTaskList(today, "No pending work for today")}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Reminder priority</h3><span class="mini">${reminders.length} alerts</span></div>
        ${renderTaskList(reminders, "No reminder alerts today")}
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
        ${renderTaskList(active.filter((t) => t.repeat && t.repeat !== "none").slice(0, 8), "No recurring work yet")}
      </div>
    </div>
  `;
}

function renderTasks() {
  const tasks = filteredTasks();
  els.views.tasks.innerHTML = `
    <div class="filters">
      <select data-filter="status">${["All", ...statusGroups].map((s) => `<option ${state.filters.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      <select data-filter="priority">${["All", "Urgent", "High", "Normal", "Low"].map((s) => `<option ${state.filters.priority === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      <select data-filter="repeat">${["All", "Recurring", "One-time"].map((s) => `<option ${state.filters.repeat === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      <select data-filter="horizon">${["All", "Today", "This week", "Overdue"].map((s) => `<option ${state.filters.horizon === s ? "selected" : ""}>${s}</option>`).join("")}</select>
    </div>
    ${renderTaskList(tasks)}
  `;
}

function renderCalendar() {
  const base = new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const firstOffset = start.getDay();
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - firstOffset);
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    const iso = dateISO(date);
    const tasks = state.tasks.filter((t) => t.due === iso);
    cells.push(`
      <div class="day-cell ${iso === todayISO() ? "today" : ""}">
        <div class="day-num">${date.toLocaleDateString(undefined, { weekday: "short", day: "2-digit" })}</div>
        ${tasks.map((t) => `<button class="day-task" data-action="edit" data-id="${t.id}" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</button>`).join("")}
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
  els.views.board.innerHTML = `<div class="board-grid">${boardGroups
    .map((group) => {
      const tasks = active.filter((task) => {
        if (group === "Blocked") return task.status === "Blocked" || task.status === "Waiting" || task.issue;
        return task.status === group;
      });
      return `<div class="board-column"><h3>${group} · ${tasks.length}</h3>${renderTaskList(tasks, `No ${group.toLowerCase()} work`)}</div>`;
    })
    .join("")}</div>`;
}

function reportLine(label, value, total) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return `<div><div class="task-row"><span>${label}</span><strong>${value}</strong></div><div class="bar"><span style="width:${pct}%"></span></div></div>`;
}

function renderReports() {
  const stats = getStats();
  const active = state.tasks.filter((t) => !taskDerived(t).isDone);
  const byStatus = statusGroups.map((s) => [s, state.tasks.filter((t) => t.status === s).length]);
  const byPriority = ["Urgent", "High", "Normal", "Low"].map((p) => [p, state.tasks.filter((t) => t.priority === p).length]);
  const byCategory = [...new Set(state.tasks.map((t) => t.category || "General"))].map((c) => [c, state.tasks.filter((t) => (t.category || "General") === c).length]);
  const aging = active
    .map((t) => ({ task: t, age: taskDerived(t).age }))
    .sort((a, b) => b.age - a.age)
    .slice(0, 6);

  els.views.reports.innerHTML = `
    <div class="report-grid">
      <div class="report-card">
        <h3>Status report</h3>
        ${byStatus.map(([label, value]) => reportLine(label, value, stats.total)).join("")}
      </div>
      <div class="report-card">
        <h3>Priority report</h3>
        ${byPriority.map(([label, value]) => reportLine(label, value, stats.total)).join("")}
      </div>
      <div class="report-card">
        <h3>Category report</h3>
        ${byCategory.map(([label, value]) => reportLine(label, value, stats.total)).join("")}
      </div>
      <div class="report-card">
        <h3>Aging report</h3>
        ${aging.length ? aging.map(({ task, age }) => `<p class="task-meta"><strong>${escapeHtml(task.title)}</strong><br>${age} active days · due ${formatDate(task.due)}</p>`).join("") : "<p class='task-meta'>No active aging yet.</p>"}
      </div>
      <div class="report-card">
        <h3>Alert report</h3>
        ${reportLine("Today's pending", stats.today, Math.max(stats.active, 1))}
        ${reportLine("Due today", stats.dueToday, Math.max(stats.active, 1))}
        ${reportLine("Reminder priority", stats.reminders, Math.max(stats.active, 1))}
        ${reportLine("Overdue", stats.overdue, Math.max(stats.active, 1))}
        ${reportLine("Blocked / issue", stats.blocked, Math.max(stats.active, 1))}
      </div>
      <div class="report-card">
        <h3>Completion report</h3>
        ${reportLine("Completed", stats.completed, Math.max(stats.total, 1))}
        ${reportLine("Active", stats.active, Math.max(stats.total, 1))}
        ${reportLine("Recurring", stats.recurring, Math.max(stats.total, 1))}
      </div>
    </div>
  `;
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
  checkNotificationHints();
}

function openTaskDialog(task = null) {
  els.form.reset();
  els.deleteTaskBtn.hidden = !task;
  els.dialogTitle.textContent = task ? "Edit work" : "Add work";
  const defaults = {
    id: "",
    title: "",
    description: "",
    category: "",
    priority: "Normal",
    status: "Pending",
    start: todayISO(),
    due: todayISO(),
    reminder: 1,
    repeat: "none",
    repeatEvery: 15,
    owner: "Me",
    issue: "",
  };
  const data = { ...defaults, ...(task || {}) };
  Object.entries(els.fields).forEach(([key, field]) => {
    field.value = data[key] ?? "";
  });
  els.dialog.showModal();
}

function readForm() {
  const existing = state.tasks.find((task) => task.id === els.fields.id.value);
  const issue = els.fields.issue.value.trim();
  const notes = [...(existing?.notes || [])];
  if (issue && issue !== existing?.issue) notes.push({ at: localTimestamp(), text: issue });
  const status = els.fields.status.value;
  return {
    id: els.fields.id.value || uid(),
    title: els.fields.title.value.trim(),
    description: els.fields.description.value.trim(),
    category: els.fields.category.value.trim() || "General",
    priority: els.fields.priority.value,
    status,
    start: els.fields.start.value || todayISO(),
    due: els.fields.due.value,
    reminder: Number(els.fields.reminder.value),
    repeat: els.fields.repeat.value,
    repeatEvery: Number(els.fields.repeatEvery.value || 1),
    owner: els.fields.owner.value.trim() || "Me",
    issue,
    notes,
    createdAt: existing?.createdAt || localTimestamp(),
    updatedAt: localTimestamp(),
    completedAt: status === "Completed" ? existing?.completedAt || localTimestamp() : "",
  };
}

function saveForm(event) {
  event.preventDefault();
  const task = readForm();
  if (!task.title) return;
  const index = state.tasks.findIndex((item) => item.id === task.id);
  if (index >= 0) state.tasks[index] = task;
  else state.tasks.push(task);
  saveTasks();
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
    .replace(/\b(reminder|alert)\s+(?:on\s+)?(?:due date|\d+\s+days?\s+before).*/gi, "")
    .replace(/\b(due|by)\s+in\s+\d+\s+days?.*/gi, "")
    .replace(/\b(due|by|on)\s+\d{1,2}(?:st|nd|rd|th)?\s+\w+(?:\s+\d{4})?.*/gi, "")
    .replace(/\b(every|daily|weekly|monthly|quarterly|yearly|tomorrow|today|high priority|urgent|low priority|normal priority).*/gi, "")
    .trim();
}

function parseQuickText(text) {
  const lower = text.toLowerCase();
  const task = {
    id: uid(),
    title: cleanQuickTitle(text) || text,
    description: text,
    category: lower.includes("gst") || lower.includes("filing") || lower.includes("compliance") ? "Compliance" : lower.includes("payment") || lower.includes("pay") ? "Finance" : "General",
    priority: lower.includes("urgent") ? "Urgent" : lower.includes("high") ? "High" : lower.includes("low") ? "Low" : "Normal",
    status: "Pending",
    start: todayISO(),
    due: todayISO(),
    reminder: lower.includes("urgent") || lower.includes("high") ? 1 : 3,
    repeat: "none",
    repeatEvery: 15,
    owner: "Me",
    issue: "",
    notes: [{ at: localTimestamp(), text: `Captured from: ${text}` }],
    createdAt: localTimestamp(),
    updatedAt: localTimestamp(),
    completedAt: "",
  };

  if (lower.includes("tomorrow")) task.due = addDays(todayISO(), 1);
  if (lower.includes("today")) task.due = todayISO();
  const dueIn = lower.match(/due in (\d+) days?/);
  if (dueIn) task.due = addDays(todayISO(), Number(dueIn[1]));
  const spokenDate = parseSpokenDate(text);
  if (spokenDate) task.due = spokenDate;
  const onDay = lower.match(/(?:on|by) (?:the )?(\d{1,2})(?:st|nd|rd|th)?/);
  if (onDay && !spokenDate) {
    const day = Math.min(28, Number(onDay[1]));
    const date = toDate(todayISO());
    date.setDate(day);
    if (dateISO(date) < todayISO()) date.setMonth(date.getMonth() + 1);
    task.due = dateISO(date);
  }

  if (lower.includes("daily") || lower.includes("every day")) task.repeat = "daily";
  else if (lower.includes("weekly") || lower.includes("every week") || lower.includes("every friday") || lower.includes("every monday")) task.repeat = "weekly";
  else if (lower.includes("monthly") || lower.includes("every month")) task.repeat = "monthly";
  else if (lower.includes("quarter")) task.repeat = "quarterly";
  else if (lower.includes("yearly") || lower.includes("annual")) task.repeat = "yearly";

  const reminderMatch = lower.match(/(?:reminder|alert)\s+(?:on\s+)?(\d+)\s+days?\s+before/);
  if (reminderMatch) task.reminder = Number(reminderMatch[1]);
  if (lower.includes("reminder on due date") || lower.includes("alert on due date")) task.reminder = 0;

  return task;
}

function captureQuick() {
  const text = els.quickInput.value.trim();
  if (!text) return;
  state.tasks.push(parseQuickText(text));
  els.quickInput.value = "";
  saveTasks();
  render();
}

function setupVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    els.voiceBtn.title = "Voice capture is not supported in this browser";
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => els.voiceBtn.classList.add("listening");
  recognition.onend = () => els.voiceBtn.classList.remove("listening");
  recognition.onresult = (event) => {
    els.quickInput.value = event.results[0][0].transcript;
    captureQuick();
  };
  els.voiceBtn.addEventListener("click", () => recognition.start());
}

function checkNotificationHints() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  if (settings.lastNotificationDate === todayISO()) return;
  const pending = state.tasks.filter((task) => taskDerived(task).activeToday);
  const priority = pending.filter((task) => taskDerived(task).reminderDue || taskDerived(task).overdue || task.priority === "Urgent");
  if (!pending.length) return;
  new Notification("Gautam's PA", {
    body: `${pending.length} pending work item${pending.length > 1 ? "s" : ""} today. ${priority.length} priority alert${priority.length === 1 ? "" : "s"}.`,
  });
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, lastNotificationDate: todayISO() }));
}

function exportCSV() {
  const headers = ["Title", "Category", "Priority", "Status", "Start", "Due", "Repeat", "Owner", "Issue", "Created Local", "Updated Local", "Completed Local"];
  const rows = state.tasks.map((task) =>
    [
      task.title,
      task.category,
      task.priority,
      task.status,
      task.start,
      task.due,
      task.repeat,
      task.owner,
      task.issue,
      formatLocalTimestamp(task.createdAt),
      formatLocalTimestamp(task.updatedAt),
      formatLocalTimestamp(task.completedAt),
    ]
      .map((value) => `"${String(value || "").replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gautams-pa-${todayISO()}.csv`;
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
  els.deleteTaskBtn.addEventListener("click", () => {
    const id = els.fields.id.value;
    const task = state.tasks.find((item) => item.id === id);
    if (!task || !window.confirm(`Are you sure you want to delete "${task.title}"? This cannot be undone.`)) return;
    state.tasks = state.tasks.filter((task) => task.id !== id);
    saveTasks();
    els.dialog.close();
    render();
  });
  document.body.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const task = state.tasks.find((item) => item.id === target.dataset.id);
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
    if (!("Notification" in window)) return;
    await Notification.requestPermission();
    checkNotificationHints();
  });
  els.exportBtn.addEventListener("click", exportCSV);
}

async function init() {
  await loadTasks();
  bindEvents();
  setupVoice();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
  render();
}

init();
