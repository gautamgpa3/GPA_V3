const API_TASKS_URL = "/api/tasks";
const API_MASTER_DATA_URL = "/api/master-data";
const API_CLIENTS_URL = "/api/clients";
const API_CONTACTS_URL = "/api/contacts";
const API_MESSAGE_SCHEDULES_URL = "/api/client-message-schedules";
const API_DUE_MESSAGES_URL = "/api/client-message-due";
const API_MESSAGE_TEMPLATES_URL = "/api/message-templates";
const API_ACTIVITY_URL = "/api/activity";
const API_ASSISTANT_URL = "/api/assistant/command";
const API_BRIEFING_URL = "/api/briefing";
const API_AUTH_STATUS_URL = "/api/auth/status";
const API_AUTH_LOGIN_URL = "/api/auth/login";
const API_AUTH_LOGOUT_URL = "/api/auth/logout";
const SETTINGS_KEY = "gpa-v3-settings";
const LOCAL_TIME_ZONE = "Asia/Kolkata";

const state = {
  tasks: [],
  clients: [],
  contacts: [],
  messageSchedules: [],
  dueMessages: [],
  messageTemplates: [],
  activity: [],
  briefing: null,
  conversation: [],
  resumeTaskDraft: null,
  resumeClientDraft: null,
  resumeTaskAfterClient: false,
  resumeTaskAfterMasterType: "",
  resumeClientAfterMasterType: "",
  dashboardMetric: "",
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

const dialogSnapshots = new WeakMap();

const els = {
  loginShell: document.querySelector("#loginShell"),
  appShell: document.querySelector("#appShell"),
  loginForm: document.querySelector("#loginForm"),
  loginUsername: document.querySelector("#loginUsername"),
  loginPassword: document.querySelector("#loginPassword"),
  loginError: document.querySelector("#loginError"),
  todayLabel: document.querySelector("#todayLabel"),
  viewTitle: document.querySelector("#viewTitle"),
  views: {
    dashboard: document.querySelector("#dashboardView"),
    tasks: document.querySelector("#tasksView"),
    calendar: document.querySelector("#calendarView"),
    board: document.querySelector("#boardView"),
    reports: document.querySelector("#reportsView"),
    clients: document.querySelector("#clientsView"),
    contacts: document.querySelector("#contactsView"),
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
  logoutBtn: document.querySelector("#logoutBtn"),
  quickAddClientBtn: document.querySelector("#quickAddClientBtn"),
  quickAddClientCategoryBtn: document.querySelector("#quickAddClientCategoryBtn"),
  quickAddPriorityBtn: document.querySelector("#quickAddPriorityBtn"),
  quickAddStatusBtn: document.querySelector("#quickAddStatusBtn"),
  quickAddRepeatBtn: document.querySelector("#quickAddRepeatBtn"),
  quickAddOwnerBtn: document.querySelector("#quickAddOwnerBtn"),
  dialog: document.querySelector("#taskDialog"),
  form: document.querySelector("#taskForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  deleteTaskBtn: document.querySelector("#deleteTaskBtn"),
  clientDialog: document.querySelector("#clientDialog"),
  clientForm: document.querySelector("#clientForm"),
  clientDialogTitle: document.querySelector("#clientDialogTitle"),
  deleteClientBtn: document.querySelector("#deleteClientBtn"),
  contactDialog: document.querySelector("#contactDialog"),
  contactForm: document.querySelector("#contactForm"),
  contactDialogTitle: document.querySelector("#contactDialogTitle"),
  deleteContactBtn: document.querySelector("#deleteContactBtn"),
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
    topic: document.querySelector("#taskTopic"),
    task_time: document.querySelector("#taskTime"),
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
    category: document.querySelector("#clientCategory"),
    phone: document.querySelector("#clientPhone"),
    whatsapp: document.querySelector("#clientWhatsapp"),
    email: document.querySelector("#clientEmail"),
    address: document.querySelector("#clientAddress"),
    gst_no: document.querySelector("#clientGst"),
    work_scope: document.querySelector("#clientWorkScope"),
    birth_date: document.querySelector("#clientBirthDate"),
  },
  contactFields: {
    id: document.querySelector("#contactId"),
    name: document.querySelector("#contactName"),
    phone: document.querySelector("#contactPhone"),
    whatsapp: document.querySelector("#contactWhatsapp"),
    email: document.querySelector("#contactEmail"),
    company: document.querySelector("#contactCompany"),
    address: document.querySelector("#contactAddress"),
    notes: document.querySelector("#contactNotes"),
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
  const text = String(value);
  const localMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
  if (localMatch) {
    const [, year, month, day, hour, minute] = localMatch;
    const monthName = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: LOCAL_TIME_ZONE }).format(
      new Date(Number(year), Number(month) - 1, 1)
    );
    const hourNumber = Number(hour);
    const displayHour = hourNumber % 12 || 12;
    const period = hourNumber >= 12 ? "PM" : "AM";
    return `${day} ${monthName} ${year}, ${displayHour}:${minute} ${period}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: LOCAL_TIME_ZONE,
  });
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function formSnapshot(form) {
  return JSON.stringify(
    Array.from(form.elements)
      .filter((field) => field.id || field.name)
      .map((field) => [
        field.id || field.name,
        field.type === "checkbox"
          ? field.checked
          : field.multiple
            ? Array.from(field.selectedOptions).map((option) => option.value)
            : field.value,
      ])
  );
}

function markDialogClean(dialog, form) {
  dialogSnapshots.set(dialog, formSnapshot(form));
}

function confirmDiscardDialog(dialog, form) {
  if (!dialog.open) return true;
  return window.confirm("Are you sure you want to exit without saving?");
}

function closeDialog(dialog, form, { skipConfirm = false } = {}) {
  if (!skipConfirm && !confirmDiscardDialog(dialog, form)) return false;
  markDialogClean(dialog, form);
  dialog.close();
  return true;
}

function closeDialogFromButton(button) {
  const dialog = button.closest("dialog");
  if (!dialog) return;
  const pairs = new Map([
    [els.dialog, els.form],
    [els.clientDialog, els.clientForm],
    [els.contactDialog, els.contactForm],
    [els.scheduleDialog, els.scheduleForm],
    [els.masterDialog, els.masterForm],
  ]);
  const form = pairs.get(dialog);
  if (form) closeDialog(dialog, form);
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
    uuid: task.uuid || "",
    title: task.title || "",
    description: task.description || "",
    category: task.category || "Client",
    priority: task.priority || "Normal",
    status: task.status || "Pending",
    client_id: task.client_id || "",
    task_time: task.task_time || "",
    topic: task.topic || "",
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
    telegram_sent: Boolean(task.telegram_sent),
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    if (response.status === 401) {
      showLogin();
    }
    const detail = await response.text();
    let message = detail;
    try {
      message = JSON.parse(detail).detail || detail;
    } catch {
      message = detail;
    }
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

function showLogin(message = "") {
  els.appShell.hidden = true;
  els.loginShell.hidden = false;
  els.loginError.textContent = message;
  window.setTimeout(() => els.loginUsername.focus(), 0);
}

function showApp() {
  els.loginShell.hidden = true;
  els.appShell.hidden = false;
  els.loginError.textContent = "";
}

async function authStatus() {
  try {
    const response = await api(API_AUTH_STATUS_URL);
    return Boolean(response.authenticated);
  } catch {
    return false;
  }
}

async function login(event) {
  event.preventDefault();
  els.loginError.textContent = "";
  try {
    await api(API_AUTH_LOGIN_URL, {
      method: "POST",
      body: JSON.stringify({
        username: els.loginUsername.value.trim(),
        password: els.loginPassword.value,
      }),
    });
  } catch (error) {
    showLogin(error.message || "Invalid username or password");
    return;
  }
  els.loginPassword.value = "";
  await startApp();
}

async function logout() {
  await api(API_AUTH_LOGOUT_URL, { method: "POST" });
  window.location.reload();
}

function bindAuthEvents() {
  els.loginForm.addEventListener("submit", login);
  els.logoutBtn.addEventListener("click", logout);
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
  state.clients = Array.isArray(clients) ? sortedItems(clients) : [];
}

async function loadContacts() {
  const contacts = await api(API_CONTACTS_URL);
  state.contacts = Array.isArray(contacts) ? sortedItems(contacts) : [];
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
  const activity = await api(`${API_ACTIVITY_URL}?limit=500`);
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

function taskDisplayTitle(task) {
  const client = clientName(task.client_id);
  return client ? `${task.title} - ${client}` : task.title;
}

function clientForTask(task) {
  if (!task.client_id) return null;
  return state.clients.find((client) => Number(client.id) === Number(task.client_id)) || null;
}

function phoneDigits(value = "") {
  let digits = String(value).replace(/[^\d]/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

function whatsappPhoneNumber(value = "") {
  const digits = phoneDigits(value);
  return digits ? `91${digits}` : "";
}

function normalizePhoneInput(field) {
  field.value = phoneDigits(field.value);
}

function isTenDigitPhone(value) {
  return /^\d{10}$/.test(value);
}

function emailValue(value = "") {
  return String(value).trim().toLowerCase();
}

function isValidEmail(value = "") {
  const email = emailValue(value);
  return !email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function gstNumber(value = "") {
  const chars = String(value).replace(/[^a-z0-9]/gi, "").toUpperCase().split("");
  const rules = [
    /[0-9]/,
    /[0-9]/,
    /[A-Z]/,
    /[A-Z]/,
    /[A-Z]/,
    /[A-Z]/,
    /[A-Z]/,
    /[0-9]/,
    /[0-9]/,
    /[0-9]/,
    /[0-9]/,
    /[A-Z]/,
    /[1-9A-Z]/,
    /Z/,
    /[0-9A-Z]/,
  ];
  let result = "";
  for (const char of chars) {
    const rule = rules[result.length];
    if (!rule) break;
    if (rule.test(char)) result += char;
  }
  return result;
}

function normalizeGstInput(field) {
  field.value = gstNumber(field.value);
}

function isValidGstNumber(value) {
  return !value || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value);
}

function byName(a, b) {
  return String(a.name || a).localeCompare(String(b.name || b), undefined, { sensitivity: "base" });
}

function sortedValues(values = []) {
  return [...values].sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: "base" }));
}

function sortedItems(items = []) {
  return [...items].sort(byName);
}

function selectedClient() {
  const id = els.fields.client_id?.value;
  if (!id) return null;
  return state.clients.find((client) => Number(client.id) === Number(id)) || null;
}

function selectedTaskCategory() {
  return selectedClient()?.category || "Client";
}

function populateScheduleClients(selectedIds = []) {
  const selected = new Set(selectedIds.map(Number));
  els.scheduleFields.client_ids.innerHTML = sortedItems(state.clients)
    .map((client) => `<option value="${client.id}" ${selected.has(Number(client.id)) ? "selected" : ""}>${escapeHtml(client.name)}</option>`)
    .join("");
}

function populateMasterControls() {
  state.master.categories = sortedValues(state.master.categories);
  state.master.priorities = sortedValues(state.master.priorities);
  state.master.statuses = sortedValues(state.master.statuses);
  state.master.repeat_types = sortedValues(state.master.repeat_types);
  state.master.owners = sortedValues(state.master.owners);
  els.fields.priority.innerHTML = optionTags(state.master.priorities);
  els.fields.status.innerHTML = optionTags(state.master.statuses);
  els.fields.repeat_type.innerHTML = optionTags(state.master.repeat_types);
  els.fields.owner.innerHTML = optionTags(state.master.owners);
  els.clientFields.category.innerHTML = optionTags(state.master.categories);
  els.fields.client_id.innerHTML = `<option value="">No client</option>${sortedItems(state.clients)
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

function openTasks() {
  return state.tasks.filter((task) => !taskDerived(task).isDone && !task.archived);
}

function pendingTasks() {
  return openTasks().filter((task) => {
    const derived = taskDerived(task);
    return derived.hasStarted && !derived.overdue;
  });
}

function todaysPendingTasks() {
  return pendingTasks().filter((task) => diffDays(task.start_date || todayISO()) === 0 || diffDays(task.due_date) === 0);
}

function overdueTasks() {
  return openTasks().filter((task) => taskDerived(task).overdue);
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
  if (!window.confirm(`Mark "${taskDisplayTitle(task)}" as completed?`)) return;
  const completedTask = normalizeTask(await api(`${API_TASKS_URL}/${task.id}/complete`, { method: "PUT" }));
  await loadTasks();
  await loadDueMessages();
  await loadActivity();
  render();
  sendTaskStageWhatsApp(completedTask, "completed", task);
}

async function deleteTask(task) {
  if (!window.confirm(`Delete "${taskDisplayTitle(task)}"? This cannot be undone.`)) return;
  await api(`${API_TASKS_URL}/${task.id}`, { method: "DELETE" });
  await loadTasks();
  await loadDueMessages();
  await loadActivity();
  closeDialog(els.dialog, els.form, { skipConfirm: true });
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
  const startText = d.hasStarted ? `Active ${d.age} days` : `Starts in ${diffDays(task.start_date)} days`;
  const repeatText = task.repeat_type === "None" ? "One-time" : task.repeat_type === "Custom Days" ? `Every ${task.repeat_every} days` : task.repeat_type;
  return `
    <article class="${classes.join(" ")}" data-id="${task.id}">
      <div class="task-row">
        <div>
          <button class="task-title" data-action="edit" data-id="${task.id}">${escapeHtml(taskDisplayTitle(task))}</button>
          <div class="task-meta">${escapeHtml(task.category)} - ${formatDate(task.due_date)}${task.task_time ? ` at ${escapeHtml(task.task_time)}` : ""} - ${startText}</div>
          ${task.topic ? `<div class="task-meta">Topic: ${escapeHtml(task.topic)}</div>` : ""}
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

function renderDashboardTaskPreview(tasks, emptyText, metric, limit = 5) {
  const visibleTasks = tasks.slice(0, limit);
  const moreCount = tasks.length - visibleTasks.length;
  return `
    ${renderTaskList(visibleTasks, emptyText)}
    ${
      moreCount > 0
        ? `<button class="secondary-button link-button" data-action="metric-details" data-metric="${metric}" type="button">More ${moreCount}</button>`
        : ""
    }
  `;
}

function getStats() {
  const open = openTasks();
  const pending = pendingTasks();
  const overdue = overdueTasks();
  return {
    total: state.tasks.length,
    active: pending.length,
    today: todaysPendingTasks().length,
    dueToday: open.filter((task) => diffDays(task.due_date) === 0).length,
    overdue: overdue.length,
    blocked: open.filter((task) => task.status === "Blocked" || task.issue).length,
    completed: state.tasks.filter((task) => task.status === "Completed").length,
    recurring: open.filter((task) => task.repeat_type && task.repeat_type !== "None").length,
  };
}

function dashboardMetricTasks(metric) {
  const open = openTasks();
  const pending = pendingTasks();
  const today = todaysPendingTasks();
  const groups = {
    today: ["Today's pending", today],
    dueToday: ["Due today", open.filter((task) => diffDays(task.due_date) === 0)],
    overdue: ["Overdue", overdueTasks()],
    active: ["Pending work", pending],
    next7: ["Next 7 days", pending.filter((task) => diffDays(task.due_date) > 0 && diffDays(task.due_date) <= 7 && !today.includes(task))],
    blocked: ["Blocked / issue", open.filter((task) => task.status === "Blocked" || task.issue)],
    recurring: ["Recurring work", open.filter((task) => task.repeat_type && task.repeat_type !== "None")],
  };
  return groups[metric] || ["Tasks", []];
}

function showDashboardMetric(metric) {
  state.dashboardMetric = metric;
  renderDashboard();
}

function metricCard(label, value, metric) {
  return `<button class="metric metric-button ${state.dashboardMetric === metric ? "active-metric" : ""}" data-action="metric-details" data-metric="${metric}" type="button"><span>${label}</span><strong>${value}</strong></button>`;
}

function metricDetailsPanel() {
  if (!state.dashboardMetric) return "";
  const [title, tasks] = dashboardMetricTasks(state.dashboardMetric);
  return `
    <div class="panel metric-detail-panel">
      <div class="panel-head">
        <h3>${escapeHtml(title)}</h3>
        <span class="mini">${tasks.length} item${tasks.length === 1 ? "" : "s"}</span>
      </div>
      ${
        tasks.length
          ? `<div class="task-list">${tasks
              .map(
                (task) => `
                  <div class="metric-detail-row">
                    <button class="task-title" data-action="edit" data-id="${task.id}">${escapeHtml(taskDisplayTitle(task))}</button>
                    <div class="task-meta">${escapeHtml(task.status)} - due ${formatDate(task.due_date)}</div>
                  </div>
                `
              )
              .join("")}</div>`
          : renderTaskList([], "No tasks in this group")
      }
    </div>
  `;
}

function renderDashboard() {
  const stats = getStats();
  const open = openTasks();
  const today = todaysPendingTasks();
  const pending = pendingTasks();
  const overdue = overdueTasks();
  const soon = pending.filter((task) => diffDays(task.due_date) > 0 && diffDays(task.due_date) <= 7 && !today.includes(task));
  const blocked = open.filter((task) => task.status === "Blocked" || task.issue);

  els.views.dashboard.innerHTML = `
    <div class="metric-grid">
      ${metricCard("Today's pending", stats.today, "today")}
      ${metricCard("Due today", stats.dueToday, "dueToday")}
      ${metricCard("Overdue", stats.overdue, "overdue")}
      ${metricCard("Pending work", stats.active, "active")}
      ${metricCard("Blocked / issue", stats.blocked, "blocked")}
    </div>
    ${metricDetailsPanel()}
    <div class="content-grid">
      <div class="panel">
        <div class="panel-head"><h3>Today's pending work</h3><span class="mini">${today.length} starting or due today</span></div>
        ${renderDashboardTaskPreview(today, "No pending work for today", "today")}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Overdue work</h3><span class="mini">${overdue.length} overdue</span></div>
        ${renderDashboardTaskPreview(overdue, "No overdue work", "overdue")}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>All pending work</h3><span class="mini">${pending.length} pending</span></div>
        ${renderDashboardTaskPreview(pending, "No pending work", "active")}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Next 7 days</h3><span class="mini">${soon.length} upcoming</span></div>
        ${renderDashboardTaskPreview(soon, "No upcoming work this week", "next7")}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Issues and blockers</h3><span class="mini">${blocked.length} needs attention</span></div>
        ${renderDashboardTaskPreview(blocked, "No issue notes recorded", "blocked")}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Recurring work</h3><span class="mini">${stats.recurring} scheduled</span></div>
        ${renderDashboardTaskPreview(open.filter((task) => task.repeat_type && task.repeat_type !== "None"), "No recurring work yet", "recurring")}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>AI suggestions</h3><span class="mini">From your data</span></div>
        <div class="task-list">
          ${(state.briefing?.suggestions || ["Ask: good morning, prepare me for today's meetings, or I'm going to meet Kalpesh."])
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
        ${tasks.map((task) => `<button class="day-task" data-action="edit" data-id="${task.id}" title="${escapeHtml(taskDisplayTitle(task))}">${escapeHtml(taskDisplayTitle(task))}</button>`).join("")}
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
  const byCategory = sortedValues([...new Set(state.tasks.map((task) => task.category || "Client"))]).map((category) => [category, state.tasks.filter((task) => (task.category || "Client") === category).length]);
  const aging = active.map((task) => ({ task, age: taskDerived(task).age })).sort((a, b) => b.age - a.age).slice(0, 6);

  els.views.reports.innerHTML = `
    <div class="report-grid">
      <div class="report-card"><h3>Status report</h3>${byStatus.map(([label, value]) => reportLine(label, value, stats.total)).join("")}</div>
      <div class="report-card"><h3>Priority report</h3>${byPriority.map(([label, value]) => reportLine(label, value, stats.total)).join("")}</div>
      <div class="report-card"><h3>Category report</h3>${byCategory.map(([label, value]) => reportLine(label, value, stats.total)).join("")}</div>
      <div class="report-card"><h3>Assigned to report</h3>${state.master.owners.map((owner) => reportLine(owner, state.tasks.filter((task) => task.owner === owner && !taskDerived(task).isDone).length, Math.max(stats.active, 1))).join("")}</div>
      <div class="report-card"><h3>Aging report</h3>${aging.length ? aging.map(({ task, age }) => `<p class="task-meta"><strong>${escapeHtml(taskDisplayTitle(task))}</strong><br>${age} active days - due ${formatDate(task.due_date)}</p>`).join("") : "<p class='task-meta'>No active aging yet.</p>"}</div>
      <div class="report-card"><h3>Alert report</h3>${reportLine("Today's pending", stats.today, Math.max(stats.active, 1))}${reportLine("Due today", stats.dueToday, Math.max(stats.active, 1))}${reportLine("Overdue", stats.overdue, Math.max(stats.active, 1))}${reportLine("Blocked / issue", stats.blocked, Math.max(stats.active, 1))}</div>
      <div class="report-card"><h3>Completion report</h3>${reportLine("Completed", stats.completed, Math.max(stats.total, 1))}${reportLine("Pending work", stats.active, Math.max(stats.total, 1))}${reportLine("Recurring", stats.recurring, Math.max(stats.total, 1))}</div>
    </div>
  `;
}

function clientBlockers(clientId) {
  return state.tasks.filter(
    (task) =>
      Number(task.client_id) === Number(clientId) &&
      !task.archived &&
      task.status !== "Completed" &&
      (task.status === "Blocked" || task.issue || task.notes)
  );
}

function clientTaskNotes(clientId) {
  return state.tasks.filter(
    (task) =>
      Number(task.client_id) === Number(clientId) &&
      !task.archived &&
      task.status !== "Completed" &&
      task.notes
  );
}

function clientMessage(client, type) {
  let messageContent = client.work_scope || "your pending work";

  if (type === "notes") {
    messageContent = clientTaskNotes(client.id)
      .map((task) => task.notes.trim())
      .filter(Boolean)
      .join("; ");
  }

  if (type === "block") {
    messageContent = clientBlockers(client.id)
      .map((task) => task.issue || task.notes || `${taskDisplayTitle(task)} is blocked.`)
      .filter(Boolean)
      .join("; ");
  }

  if (!messageContent) return "";
  const template =
    state.messageTemplates.find((item) => item.key === `client_${type}`)?.body ||
    "Hello {client_name}, please submit required documents for {work_scope}.";
  return renderMessageTemplate(template, {
    client_name: client.name,
    work_scope: messageContent,
    notes: messageContent,
    block: messageContent,
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
    window.open(`https://wa.me/${whatsappPhoneNumber(phone)}?text=${encoded}`, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.href = `sms:${phone}?body=${encoded}`;
}

function openPreparedMessage(channel, phone, message) {
  const digits = phoneDigits(phone);
  if (!digits || !message) return;
  const encoded = encodeURIComponent(message);
  if (channel === "whatsapp") {
    window.open(`https://wa.me/${whatsappPhoneNumber(digits)}?text=${encoded}`, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.href = `sms:${digits}?body=${encoded}`;
}

function taskClient(task) {
  if (!task?.client_id) return null;
  return state.clients.find((client) => Number(client.id) === Number(task.client_id)) || null;
}

function taskUpdateDetails(previousTask, nextTask) {
  if (!previousTask) return "";
  const details = [];
  if ((previousTask.notes || "") !== (nextTask.notes || "")) {
    details.push(`Notes updated: ${nextTask.notes || "notes cleared"}`);
  }
  if ((previousTask.issue || "") !== (nextTask.issue || "")) {
    details.push(`Block updated: ${nextTask.issue || "block cleared"}`);
  }
  if ((previousTask.status || "") !== (nextTask.status || "")) {
    details.push(`Status updated to ${nextTask.status}`);
  }
  if ((previousTask.due_date || "") !== (nextTask.due_date || "")) {
    details.push(`Due date updated to ${formatDate(nextTask.due_date)}`);
  }
  return details.join("; ") || "Your work progress has been updated.";
}

function taskStageMessage(task, stage, previousTask = null) {
  const client = taskClient(task);
  if (!client) return null;
  const templateKey = {
    created: "task_created",
    updated: "task_updated",
    completed: "task_completed",
  }[stage];
  const fallback = {
    created: "Hello {client_name}, your work of {task_title} is received and we are working on it. We will update you on the progress.",
    updated: "Hello {client_name}, update for {task_title}: {update_details}.",
    completed: "Hello {client_name}, your work of {task_title} has been completed.",
  }[stage];
  const template = state.messageTemplates.find((item) => item.key === templateKey)?.body || fallback;
  return {
    client,
    message: renderMessageTemplate(template, {
      client_name: client.name,
      task_title: task.title,
      task_status: task.status,
      update_details: taskUpdateDetails(previousTask, task),
      notes: task.notes || "",
      block: task.issue || "",
      due_date: formatDate(task.due_date),
    }),
  };
}

function sendTaskStageWhatsApp(task, stage, previousTask = null) {
  const prepared = taskStageMessage(task, stage, previousTask);
  if (!prepared) return;
  const phone = prepared.client.whatsapp || prepared.client.phone;
  if (!phone) return;
  openPreparedMessage("whatsapp", phone, prepared.message);
}

function bindDialogGuard(dialog, form) {
  form.addEventListener(
    "click",
    (event) => {
      const cancelButton = event.target.closest('button[value="cancel"]');
      if (!cancelButton) return;
      if (!confirmDiscardDialog(dialog, form)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      markDialogClean(dialog, form);
    },
    true
  );
  dialog.addEventListener("cancel", (event) => {
    if (!confirmDiscardDialog(dialog, form)) {
      event.preventDefault();
      return;
    }
    markDialogClean(dialog, form);
  });
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
            const taskNotes = clientTaskNotes(client.id);
            return `
              <article class="client-card">
                <div class="task-row">
                  <div>
                    <button class="task-title" data-action="edit-client" data-id="${client.id}">${escapeHtml(client.name)}</button>
                    <div class="task-meta">${escapeHtml(client.category || "Client")} - ${escapeHtml(client.phone || "No phone")} - ${escapeHtml(client.email || "No email")} - GST: ${escapeHtml(client.gst_no || "Not set")}</div>
                    ${client.birth_date ? `<div class="task-meta">Birth date: ${formatDate(client.birth_date)}</div>` : ""}
                  </div>
                </div>
                <div class="task-note">${escapeHtml(client.work_scope || "No work scope recorded")}</div>
                <div class="badges">
                  ${client.address ? createBadge("Address saved", "blue") : ""}
                  ${taskNotes.length ? createBadge(`${taskNotes.length} Notes`, "green") : ""}
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

function renderContacts() {
  els.views.contacts.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <h3>Contacts / telephone diary</h3>
        <div class="inline-actions">
          <button class="secondary-button" data-action="sync-icloud-contacts">Sync iCloud</button>
          <button class="secondary-button" data-action="import-contacts">Import</button>
          <button class="secondary-button" data-action="export-contacts">Export</button>
          <button class="primary-button" data-action="add-contact">Add contact</button>
        </div>
      </div>
      <div class="task-note">Sync iCloud imports iPhone contacts through iCloud Contacts. It only adds/updates GPA contacts and does not delete or edit your phone contacts.</div>
      <div class="client-grid">
        ${state.contacts
          .map(
            (contact) => `
              <article class="client-card">
                <div class="task-row">
                  <div>
                    <button class="task-title" data-action="edit-contact" data-id="${contact.id}">${escapeHtml(contact.name)}</button>
                    <div class="task-meta">${escapeHtml(contact.phone || "No phone")} - ${escapeHtml(contact.email || "No email")}</div>
                    ${contact.company ? `<div class="task-meta">${escapeHtml(contact.company)}</div>` : ""}
                  </div>
                </div>
                ${contact.address ? `<div class="task-note">${escapeHtml(contact.address)}</div>` : ""}
                ${contact.notes ? `<div class="task-note">${escapeHtml(contact.notes)}</div>` : ""}
                <div class="inline-actions">
                  <button class="secondary-button link-button" data-action="contact-whatsapp" data-id="${contact.id}" type="button">WhatsApp</button>
                  <button class="secondary-button link-button" data-action="contact-sms" data-id="${contact.id}" type="button">SMS</button>
                  <button class="secondary-button" data-action="contact-to-client" data-id="${contact.id}" type="button">Make client</button>
                </div>
              </article>
            `
          )
          .join("") || renderTaskList([], "No contacts saved yet")}
      </div>
    </div>
  `;
}

function contactPayload() {
  return {
    name: els.contactFields.name.value.trim(),
    phone: phoneDigits(els.contactFields.phone.value),
    whatsapp: phoneDigits(els.contactFields.whatsapp.value),
    email: emailValue(els.contactFields.email.value),
    company: els.contactFields.company.value.trim(),
    address: els.contactFields.address.value.trim(),
    notes: els.contactFields.notes.value.trim(),
    active: true,
  };
}

function validateContactPayload(payload) {
  if (!payload.name) return "Contact name is required.";
  if (payload.phone && !isTenDigitPhone(payload.phone)) return "Mobile must be exactly 10 digits.";
  if (payload.whatsapp && !isTenDigitPhone(payload.whatsapp)) return "WhatsApp must be exactly 10 digits.";
  if (!isValidEmail(payload.email)) return "Email must be valid.";
  if (!payload.phone && !payload.whatsapp && !payload.email) return "Add at least one phone, WhatsApp, or email.";
  return "";
}

function openContactDialog(contact = null) {
  els.contactForm.reset();
  els.deleteContactBtn.hidden = !contact;
  els.contactDialogTitle.textContent = contact ? "Edit contact" : "Add contact";
  const defaults = { id: "", name: "", phone: "", whatsapp: "", email: "", company: "", address: "", notes: "" };
  const data = { ...defaults, ...(contact || {}) };
  Object.entries(els.contactFields).forEach(([key, field]) => {
    field.value = data[key] ?? "";
  });
  els.contactDialog.showModal();
  markDialogClean(els.contactDialog, els.contactForm);
}

async function saveContactForm(event) {
  event.preventDefault();
  const payload = contactPayload();
  const error = validateContactPayload(payload);
  if (error) {
    window.alert(error);
    return;
  }
  const id = els.contactFields.id.value;
  if (!window.confirm(`${id ? "Edit" : "Add"} contact "${payload.name}"?`)) return;
  let savedContact;
  try {
    savedContact = await api(id ? `${API_CONTACTS_URL}/${id}` : API_CONTACTS_URL, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    if (savedContact?.id && (savedContact.phone || savedContact.whatsapp) && window.confirm(`Also save "${savedContact.name}" in clients?`)) {
      await api(`${API_CONTACTS_URL}/${savedContact.id}/make-client`, { method: "POST" });
    }
  } catch (error) {
    window.alert(error.message);
    return;
  }
  await loadContacts();
  await loadClients();
  await loadActivity();
  populateMasterControls();
  closeDialog(els.contactDialog, els.contactForm, { skipConfirm: true });
  render();
}

async function deleteContactFromDialog() {
  const id = els.contactFields.id.value;
  if (!id || !window.confirm("Delete this contact?")) return;
  await api(`${API_CONTACTS_URL}/${id}`, { method: "DELETE" });
  await loadContacts();
  await loadActivity();
  closeDialog(els.contactDialog, els.contactForm, { skipConfirm: true });
  render();
}

async function makeClientFromContact(contactId) {
  const contact = state.contacts.find((item) => String(item.id) === String(contactId));
  if (!contact || !window.confirm(`Create client "${contact.name}" from this contact?`)) return;
  try {
    await api(`${API_CONTACTS_URL}/${contactId}/make-client`, { method: "POST" });
  } catch (error) {
    window.alert(error.message);
    return;
  }
  await loadClients();
  await loadContacts();
  await loadActivity();
  populateMasterControls();
  render();
}

async function syncIcloudContacts() {
  if (!window.confirm("Sync contacts from iCloud into GPA now? This will not change your iPhone contacts.")) return;
  try {
    const result = await api(`${API_CONTACTS_URL}/sync/icloud`, { method: "POST" });
    await loadContacts();
    await loadActivity();
    render();
    window.alert(`iCloud sync complete. Created: ${result.created}, Updated: ${result.updated}, Skipped: ${result.skipped}`);
  } catch (error) {
    window.alert(error.message);
  }
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

function masterTypeLabel(type) {
  return {
    categories: "category",
    priorities: "priority",
    statuses: "status",
    owners: "assignee",
    "repeat-types": "repeat type",
  }[type] || "item";
}

const TEMPLATE_VARIABLES = {
  client_general: [
    ["client_name", "Client name"],
    ["work_scope", "Work scope"],
  ],
  client_notes: [
    ["client_name", "Client name"],
    ["notes", "Active task notes"],
  ],
  client_block: [
    ["client_name", "Client name"],
    ["block", "Block / issue text"],
  ],
  task_created: [
    ["client_name", "Client name"],
    ["task_title", "Task title"],
    ["due_date", "Due date"],
  ],
  task_updated: [
    ["client_name", "Client name"],
    ["task_title", "Task title"],
    ["update_details", "Changed details"],
    ["notes", "Task notes"],
    ["block", "Task block / issue"],
    ["due_date", "Due date"],
  ],
  task_completed: [
    ["client_name", "Client name"],
    ["task_title", "Task title"],
    ["due_date", "Due date"],
  ],
  client_birthday: [
    ["client_name", "Client name"],
    ["birth_date", "Birth date"],
  ],
  telegram_daily: [
    ["pending_count", "Pending tasks"],
    ["pending_tasks", "Pending task list"],
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

function templateFormatToolbar(templateKey) {
  const controls = [
    ["bold", "B", "Bold"],
    ["italic", "I", "Italic"],
    ["strike", "S", "Strikethrough"],
  ];
  return `
    <div class="template-toolbar" aria-label="Template formatting">
      ${controls
        .map(
          ([format, label, title]) => `
            <button class="icon-button format-button ${format}" data-action="format-template" data-key="${escapeHtml(templateKey)}" data-format="${format}" title="${title}" type="button">${label}</button>
          `
        )
        .join("")}
    </div>
  `;
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
                ${templateFormatToolbar(template.key)}
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
      ${masterList("Priorities", "priorities", state.master.priority_items || [])}
      ${masterList("Statuses", "statuses", state.master.status_items || [])}
      ${masterList("Assigned to / staff", "owners", state.master.owner_items || [])}
      ${masterList("Repeat types", "repeat-types", state.master.repeat_type_items || [])}
    </div>
    ${messageTemplateList()}
  `;
}

function assistantResponseText(response) {
  if (response.action === "BRIEFING" && response.briefing) {
    const priorities = (response.briefing.priorities || []).map(taskDisplayTitle).slice(0, 4).join(", ");
    return `${response.message}${priorities ? ` Priorities: ${priorities}.` : ""}`;
  }
  if (response.action === "CLIENT_CONTEXT" && response.client) {
    const pending = (response.pending_tasks || []).map(taskDisplayTitle).slice(0, 4).join(", ");
    return `${response.message}${pending ? ` Pending: ${pending}.` : ""}`;
  }
  if (response.action === "MEETING_PREP") {
    const tasks = (response.tasks || []).map(taskDisplayTitle).slice(0, 5).join(", ");
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
  renderContacts();
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
    topic: "",
    task_time: "",
    category: "Client",
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
  markDialogClean(els.dialog, els.form);
}

function readForm() {
  return {
    title: els.fields.title.value.trim(),
    description: els.fields.description.value.trim(),
    topic: els.fields.topic.value.trim(),
    task_time: els.fields.task_time.value,
    category: selectedTaskCategory(),
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

function currentTaskDraft() {
  return { id: els.fields.id.value, ...readForm() };
}

function resumeTaskDraft() {
  const draft = state.resumeTaskDraft;
  state.resumeTaskDraft = null;
  state.resumeTaskAfterClient = false;
  state.resumeTaskAfterMasterType = "";
  if (draft) openTaskDialog(draft);
}

function currentClientDraft() {
  return { id: els.clientFields.id.value, ...readClientForm() };
}

function resumeClientDraft() {
  const draft = state.resumeClientDraft;
  state.resumeClientDraft = null;
  state.resumeClientAfterMasterType = "";
  if (draft) openClientDialog(draft);
}

function quickAddClientFromTask() {
  state.resumeTaskDraft = currentTaskDraft();
  state.resumeTaskAfterClient = true;
  closeDialog(els.dialog, els.form, { skipConfirm: true });
  window.setTimeout(() => openClientDialog(), 0);
}

function quickAddMasterFromTask(type) {
  state.resumeTaskDraft = currentTaskDraft();
  state.resumeTaskAfterMasterType = type;
  closeDialog(els.dialog, els.form, { skipConfirm: true });
  window.setTimeout(() => openMasterDialog(type), 0);
}

function quickAddMasterFromClient(type) {
  state.resumeClientDraft = currentClientDraft();
  state.resumeClientAfterMasterType = type;
  closeDialog(els.clientDialog, els.clientForm, { skipConfirm: true });
  window.setTimeout(() => openMasterDialog(type), 0);
}

function openClientDialog(client = null) {
  els.clientForm.reset();
  els.deleteClientBtn.hidden = !client;
  els.clientDialogTitle.textContent = client ? "Edit client" : "Add client";
  const defaults = {
    id: "",
    name: "",
    category: state.master.categories[0] || "Client",
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    gst_no: "",
    work_scope: "",
    birth_date: "",
  };
  const data = { ...defaults, ...(client || {}) };
  Object.entries(els.clientFields).forEach(([key, field]) => {
    field.value = data[key] ?? "";
  });
  els.clientDialog.showModal();
  markDialogClean(els.clientDialog, els.clientForm);
}

function readClientForm() {
  return {
    name: els.clientFields.name.value.trim(),
    category: els.clientFields.category.value || "Client",
    phone: phoneDigits(els.clientFields.phone.value),
    whatsapp: phoneDigits(els.clientFields.whatsapp.value),
    email: emailValue(els.clientFields.email.value),
    address: els.clientFields.address.value.trim(),
    gst_no: gstNumber(els.clientFields.gst_no.value),
    work_scope: els.clientFields.work_scope.value.trim(),
    birth_date: els.clientFields.birth_date.value || null,
    active: true,
  };
}

async function saveClientForm(event) {
  event.preventDefault();
  const payload = readClientForm();
  if (!payload.name) return;
  if (!isTenDigitPhone(payload.phone)) {
    window.alert("Mobile / SMS must be exactly 10 digits.");
    els.clientFields.phone.focus();
    return;
  }
  if (payload.whatsapp && !isTenDigitPhone(payload.whatsapp)) {
    window.alert("WhatsApp must be exactly 10 digits.");
    els.clientFields.whatsapp.focus();
    return;
  }
  if (!isValidEmail(payload.email)) {
    window.alert("Email must be valid.");
    els.clientFields.email.focus();
    return;
  }
  if (!isValidGstNumber(payload.gst_no)) {
    window.alert("GST No. must be a valid 15-character GSTIN.");
    els.clientFields.gst_no.focus();
    return;
  }
  const id = els.clientFields.id.value;
  if (!window.confirm(`${id ? "Edit" : "Add"} client "${payload.name}"?`)) return;
  let savedClient;
  try {
    savedClient = await api(id ? `${API_CLIENTS_URL}/${id}` : API_CLIENTS_URL, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    if (savedClient?.id && window.confirm(`Also save "${savedClient.name}" in contacts?`)) {
      await api(`${API_CLIENTS_URL}/${savedClient.id}/make-contact`, { method: "POST" });
    }
  } catch (error) {
    window.alert(error.message);
    return;
  }
  if (state.resumeTaskAfterClient && state.resumeTaskDraft && savedClient?.id) {
    state.resumeTaskDraft.client_id = savedClient.id;
    state.resumeTaskDraft.category = savedClient.category || "Client";
  }
  await loadClients();
  await loadContacts();
  await loadDueMessages();
  await loadActivity();
  populateMasterControls();
  closeDialog(els.clientDialog, els.clientForm, { skipConfirm: true });
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
  closeDialog(els.clientDialog, els.clientForm, { skipConfirm: true });
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
  markDialogClean(els.scheduleDialog, els.scheduleForm);
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
  closeDialog(els.scheduleDialog, els.scheduleForm, { skipConfirm: true });
  render();
}

async function deleteScheduleFromDialog() {
  const id = els.scheduleFields.id.value;
  if (!id || !window.confirm("Delete this message schedule?")) return;
  await api(`${API_MESSAGE_SCHEDULES_URL}/${id}`, { method: "DELETE" });
  await loadMessageSchedules();
  await loadDueMessages();
  await loadActivity();
  closeDialog(els.scheduleDialog, els.scheduleForm, { skipConfirm: true });
  render();
}

function openMasterDialog(type, item = null) {
  els.masterForm.reset();
  els.masterFields.type.value = type;
  els.masterFields.id.value = item?.id || "";
  els.masterFields.name.value = item?.name || "";
  els.deleteMasterBtn.hidden = !item;
  els.masterDialogTitle.textContent = `${item ? "Edit" : "Add"} ${masterTypeLabel(type)}`;
  els.masterDialog.showModal();
  markDialogClean(els.masterDialog, els.masterForm);
}

async function saveMasterForm(event) {
  event.preventDefault();
  const type = els.masterFields.type.value;
  const id = els.masterFields.id.value;
  const name = els.masterFields.name.value.trim();
  if (!type || !name) return;
  if (!window.confirm(`${id ? "Edit" : "Add"} ${masterTypeLabel(type)} "${name}"?`)) return;
  let savedItem;
  try {
    savedItem = await api(id ? `${API_MASTER_DATA_URL}/${type}/${id}` : `${API_MASTER_DATA_URL}/${type}`, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(id ? { name, active: true } : { name }),
    });
  } catch (error) {
    window.alert(error.message);
    return;
  }
  if (state.resumeTaskAfterMasterType && state.resumeTaskDraft && savedItem?.name) {
    const taskFieldByMasterType = {
      categories: "category",
      priorities: "priority",
      statuses: "status",
      owners: "owner",
      "repeat-types": "repeat_type",
    };
    const taskField = taskFieldByMasterType[type];
    if (taskField) state.resumeTaskDraft[taskField] = savedItem.name;
  }
  if (state.resumeClientAfterMasterType && state.resumeClientDraft && type === "categories" && savedItem?.name) {
    state.resumeClientDraft.category = savedItem.name;
  }
  await loadMasterData();
  await loadTasks();
  await loadActivity();
  populateMasterControls();
  closeDialog(els.masterDialog, els.masterForm, { skipConfirm: true });
  render();
}

async function deleteMasterFromDialog() {
  const type = els.masterFields.type.value;
  const id = els.masterFields.id.value;
  if (!type || !id || !window.confirm("Delete this item? GPA will block deletion if it is used anywhere.")) return;
  try {
    await api(`${API_MASTER_DATA_URL}/${type}/${id}`, { method: "DELETE" });
  } catch (error) {
    window.alert(error.message);
    return;
  }
  await loadMasterData();
  await loadActivity();
  populateMasterControls();
  closeDialog(els.masterDialog, els.masterForm, { skipConfirm: true });
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
  insertIntoTemplate(templateKey, variable);
}

function insertIntoTemplate(templateKey, value) {
  const selectorKey = window.CSS?.escape ? CSS.escape(templateKey) : templateKey;
  const field = document.querySelector(`[data-template-body="${selectorKey}"]`);
  if (!field) return;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  field.value = `${field.value.slice(0, start)}${value}${field.value.slice(end)}`;
  const nextPosition = start + value.length;
  field.focus();
  field.setSelectionRange(nextPosition, nextPosition);
}

function formatTemplateSelection(templateKey, format) {
  const markers = {
    bold: ["*", "*"],
    italic: ["_", "_"],
    strike: ["~", "~"],
  };
  const marker = markers[format];
  if (!marker) return;
  const selectorKey = window.CSS?.escape ? CSS.escape(templateKey) : templateKey;
  const field = document.querySelector(`[data-template-body="${selectorKey}"]`);
  if (!field) return;
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  const selected = field.value.slice(start, end) || "text";
  const replacement = `${marker[0]}${selected}${marker[1]}`;
  field.value = `${field.value.slice(0, start)}${replacement}${field.value.slice(end)}`;
  field.focus();
  field.setSelectionRange(start + marker[0].length, start + marker[0].length + selected.length);
}

async function saveForm(event) {
  event.preventDefault();
  const payload = readForm();
  if (!payload.title) return;
  const id = els.fields.id.value;
  const previousTask = id ? state.tasks.find((task) => String(task.id) === String(id)) : null;
  if (!window.confirm(`${id ? "Edit" : "Add"} task "${payload.title}"?`)) return;
  const savedTask = normalizeTask(await api(id ? `${API_TASKS_URL}/${id}` : API_TASKS_URL, {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload),
  }));
  await loadTasks();
  await loadDueMessages();
  await loadActivity();
  closeDialog(els.dialog, els.form, { skipConfirm: true });
  render();
  sendTaskStageWhatsApp(savedTask, id ? "updated" : "created", previousTask);
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

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadTextFile(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function parseCsvContacts(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    return {
      name: row.name || row["full name"] || row.contact || "",
      phone: row.phone || row.mobile || row.telephone || "",
      whatsapp: row.whatsapp || "",
      email: row.email || row.mail || "",
      company: row.company || row.organization || "",
      address: row.address || "",
      notes: row.notes || row.note || "",
    };
  });
}

function parseVcfContacts(text) {
  return text
    .split(/BEGIN:VCARD/i)
    .slice(1)
    .map((card) => {
      const lines = card.split(/\r?\n/);
      const valueFor = (prefixes) => {
        const line = lines.find((item) => prefixes.some((prefix) => item.toUpperCase().startsWith(prefix)));
        return line ? line.slice(line.indexOf(":") + 1).replace(/\\n/g, " ").trim() : "";
      };
      const name = valueFor(["FN"]) || valueFor(["N"]);
      const phone = phoneDigits(valueFor(["TEL"]));
      const email = valueFor(["EMAIL"]).toLowerCase();
      const company = valueFor(["ORG"]);
      const address = valueFor(["ADR"]).replace(/;/g, " ").replace(/\s+/g, " ").trim();
      const notes = valueFor(["NOTE"]);
      return { name, phone, whatsapp: "", email, company, address, notes };
    })
    .filter((contact) => contact.name);
}

function exportContactsCSV() {
  const headers = ["Name", "Phone", "WhatsApp", "Email", "Company", "Address", "Notes"];
  const rows = state.contacts.map((contact) =>
    [contact.name, contact.phone, contact.whatsapp, contact.email, contact.company, contact.address, contact.notes].map(csvCell).join(",")
  );
  downloadTextFile(`gpa-v3-contacts-${todayISO()}.csv`, [headers.map(csvCell).join(","), ...rows].join("\n"), "text/csv;charset=utf-8");
}

function importContactsFromFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv,.vcf,text/csv,text/vcard";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    const contacts = file.name.toLowerCase().endsWith(".vcf") ? parseVcfContacts(text) : parseCsvContacts(text);
    if (!contacts.length) {
      window.alert("No contacts found in this file.");
      return;
    }
    if (!window.confirm(`Import ${contacts.length} contact(s)? Existing names will be updated.`)) return;
    const result = await api(`${API_CONTACTS_URL}/import`, {
      method: "POST",
      body: JSON.stringify({ contacts }),
    });
    await loadContacts();
    await loadActivity();
    render();
    window.alert(`Imported contacts. Created: ${result.created}, Updated: ${result.updated}, Skipped: ${result.skipped}`);
  });
  input.click();
}

function exportCSV() {
  const headers = [
    "Row Type",
    "ID",
    "UUID",
    "Title",
    "Description",
    "Topic",
    "Category",
    "Priority",
    "Status",
    "Task Time",
    "Client ID",
    "Client Name",
    "Client Category",
    "Client Mobile",
    "Client WhatsApp",
    "Client Email",
    "Client GST No.",
    "Client Birth Date",
    "Client Work Scope",
    "Start Date",
    "Due Date",
    "Reminder",
    "Repeat Type",
    "Repeat Every",
    "Owner / Assigned To",
    "Issue / Block",
    "Notes",
    "Archived",
    "Telegram Sent",
    "Created At",
    "Updated At",
    "Completed At",
    "Activity ID",
    "Activity Action",
    "Activity Entity",
    "Activity Summary",
    "Activity Details",
    "Activity Time",
  ];
  const rows = state.tasks.map((task) => {
    const client = clientForTask(task);
    return [
      "Task",
      task.id,
      task.uuid,
      task.title,
      task.description,
      task.topic,
      task.category,
      task.priority,
      task.status,
      task.task_time,
      task.client_id,
      client?.name,
      client?.category,
      client?.phone,
      client?.whatsapp,
      client?.email,
      client?.gst_no,
      client?.birth_date,
      client?.work_scope,
      task.start_date,
      task.due_date,
      task.reminder ? "Yes" : "No",
      task.repeat_type,
      task.repeat_every,
      task.owner,
      task.issue,
      task.notes,
      task.archived ? "Yes" : "No",
      task.telegram_sent ? "Yes" : "No",
      formatTimestamp(task.created_at),
      formatTimestamp(task.updated_at),
      formatTimestamp(task.completed_at),
      "",
      "",
      "",
      "",
      "",
      "",
    ]
      .map(csvCell)
      .join(",");
  });

  const taskByActivityKey = new Map();
  state.tasks.forEach((task) => {
    if (task.id) taskByActivityKey.set(`id:${task.id}`, task);
    if (task.uuid) taskByActivityKey.set(`uuid:${task.uuid}`, task);
  });

  const activityRows = state.activity.map((activity) => {
    const task =
      taskByActivityKey.get(`id:${activity.entity_id}`) ||
      taskByActivityKey.get(`uuid:${activity.entity_uuid}`) ||
      {};
    const client = task.client_id ? clientForTask(task) : null;
    return [
      "Activity",
      task.id || activity.entity_id,
      task.uuid || activity.entity_uuid,
      task.title || "",
      task.description || "",
      task.topic || "",
      task.category || "",
      task.priority || "",
      task.status || "",
      task.task_time || "",
      task.client_id || "",
      client?.name,
      client?.category,
      client?.phone,
      client?.whatsapp,
      client?.email,
      client?.gst_no,
      client?.birth_date,
      client?.work_scope,
      task.start_date || "",
      task.due_date || "",
      task.reminder === undefined ? "" : task.reminder ? "Yes" : "No",
      task.repeat_type || "",
      task.repeat_every || "",
      task.owner || "",
      task.issue || "",
      task.notes || "",
      task.archived === undefined ? "" : task.archived ? "Yes" : "No",
      task.telegram_sent === undefined ? "" : task.telegram_sent ? "Yes" : "No",
      task.created_at ? formatTimestamp(task.created_at) : "",
      task.updated_at ? formatTimestamp(task.updated_at) : "",
      task.completed_at ? formatTimestamp(task.completed_at) : "",
      activity.id,
      activity.action,
      activity.entity_type,
      activity.summary,
      activity.details,
      formatTimestamp(activity.created_at),
    ]
      .map(csvCell)
      .join(",");
  });

  const csv = [headers.map(csvCell).join(","), ...rows, ...activityRows].join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gpa-v3-tasks-${todayISO()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  bindDialogGuard(els.dialog, els.form);
  bindDialogGuard(els.clientDialog, els.clientForm);
  bindDialogGuard(els.contactDialog, els.contactForm);
  bindDialogGuard(els.scheduleDialog, els.scheduleForm);
  bindDialogGuard(els.masterDialog, els.masterForm);

  els.clientDialog.addEventListener("close", () => {
    if (state.resumeClientAfterMasterType) return;
    if (state.resumeTaskAfterClient) resumeTaskDraft();
  });
  els.masterDialog.addEventListener("close", () => {
    if (state.resumeTaskAfterMasterType) resumeTaskDraft();
    if (state.resumeClientAfterMasterType) resumeClientDraft();
  });

  els.navItems.forEach((item) =>
    item.addEventListener("click", () => {
      state.currentView = item.dataset.view;
      render();
    })
  );
  els.quickAddBtn.addEventListener("click", () => openTaskDialog());
  els.quickAddClientBtn.addEventListener("click", quickAddClientFromTask);
  els.quickAddClientCategoryBtn.addEventListener("click", () => quickAddMasterFromClient("categories"));
  els.quickAddPriorityBtn.addEventListener("click", () => quickAddMasterFromTask("priorities"));
  els.quickAddStatusBtn.addEventListener("click", () => quickAddMasterFromTask("statuses"));
  els.quickAddRepeatBtn.addEventListener("click", () => quickAddMasterFromTask("repeat-types"));
  els.quickAddOwnerBtn.addEventListener("click", () => quickAddMasterFromTask("owners"));
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
  els.contactForm.addEventListener("submit", saveContactForm);
  [els.clientFields.phone, els.clientFields.whatsapp].forEach((field) => {
    field.addEventListener("input", () => normalizePhoneInput(field));
  });
  [els.contactFields.phone, els.contactFields.whatsapp].forEach((field) => {
    field.addEventListener("input", () => normalizePhoneInput(field));
  });
  els.clientFields.gst_no.addEventListener("input", () => normalizeGstInput(els.clientFields.gst_no));
  els.scheduleForm.addEventListener("submit", saveScheduleForm);
  els.masterForm.addEventListener("submit", saveMasterForm);
  els.deleteTaskBtn.addEventListener("click", () => {
    const task = state.tasks.find((item) => String(item.id) === String(els.fields.id.value));
    if (task) deleteTask(task);
  });
  els.deleteClientBtn.addEventListener("click", deleteClientFromDialog);
  els.deleteContactBtn.addEventListener("click", deleteContactFromDialog);
  els.deleteScheduleBtn.addEventListener("click", deleteScheduleFromDialog);
  els.deleteMasterBtn.addEventListener("click", deleteMasterFromDialog);
  document.body.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    const closeButton = event.target.closest("[data-close-dialog]");
    if (closeButton) {
      closeDialogFromButton(closeButton);
      return;
    }
    if (!target) return;
    if (target.dataset.action === "metric-details") {
      showDashboardMetric(target.dataset.metric);
      return;
    }
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
    if (target.dataset.action === "add-contact") {
      openContactDialog();
      return;
    }
    if (target.dataset.action === "edit-contact") {
      const contact = state.contacts.find((item) => String(item.id) === String(target.dataset.id));
      if (contact) openContactDialog(contact);
      return;
    }
    if (target.dataset.action === "import-contacts") {
      importContactsFromFile();
      return;
    }
    if (target.dataset.action === "export-contacts") {
      exportContactsCSV();
      return;
    }
    if (target.dataset.action === "sync-icloud-contacts") {
      syncIcloudContacts();
      return;
    }
    if (target.dataset.action === "contact-whatsapp") {
      const contact = state.contacts.find((item) => String(item.id) === String(target.dataset.id));
      if (contact) openPreparedMessage("whatsapp", contact.whatsapp || contact.phone, `Hello ${contact.name}`);
      return;
    }
    if (target.dataset.action === "contact-sms") {
      const contact = state.contacts.find((item) => String(item.id) === String(target.dataset.id));
      if (contact) openPreparedMessage("sms", contact.phone || contact.whatsapp, `Hello ${contact.name}`);
      return;
    }
    if (target.dataset.action === "contact-to-client") {
      makeClientFromContact(target.dataset.id);
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
    if (target.dataset.action === "format-template") {
      formatTemplateSelection(target.dataset.key, target.dataset.format);
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

async function startApp() {
  try {
    showApp();
    await loadMasterData();
    await loadMessageTemplates();
    await loadClients();
    await loadContacts();
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

async function init() {
  bindAuthEvents();
  if (!(await authStatus())) {
    showLogin();
    return;
  }
  await startApp();
}

init();
