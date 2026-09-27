const root = document.documentElement;
const themeToggle = document.getElementById("theme-toggle");
const themeColorMeta = document.getElementById("theme-color-meta");
const siteHeader = document.getElementById("site-header");
const filterToggle = document.getElementById("filter-toggle");
const filterMenu = document.getElementById("filter-menu");
const projectTableBody = document.getElementById("project-table-body");
const emptyState = document.getElementById("empty-state");
const loadingState = document.getElementById("projects-loading");
const errorState = document.getElementById("projects-error");

const applyTheme = (theme) => {
  root.dataset.theme = theme;
  localStorage.setItem("theme", theme);

  const isLight = theme === "light";
  themeToggle.setAttribute(
    "aria-label",
    isLight ? "Switch to dark mode" : "Switch to light mode"
  );

  themeColorMeta.setAttribute(
    "content",
    isLight ? "#ffffff" : "#0b0f14"
  );
};

applyTheme(root.dataset.theme || "dark");

themeToggle.addEventListener("click", () => {
  applyTheme(root.dataset.theme === "dark" ? "light" : "dark");
});

/* Hide on scroll down, return immediately on scroll up. */
let lastScrollY = window.scrollY;
let scrollTicking = false;

const updateHeaderVisibility = () => {
  const currentScrollY = window.scrollY;
  const delta = currentScrollY - lastScrollY;

  if (currentScrollY <= 16) {
    siteHeader.classList.remove("header-hidden");
  } else if (delta > 6 && currentScrollY > 80) {
    siteHeader.classList.add("header-hidden");
  } else if (delta < -6) {
    siteHeader.classList.remove("header-hidden");
  }

  lastScrollY = currentScrollY;
  scrollTicking = false;
};

window.addEventListener("scroll", () => {
  if (!scrollTicking) {
    window.requestAnimationFrame(updateHeaderVisibility);
    scrollTicking = true;
  }
}, { passive: true });

siteHeader.addEventListener("focusin", () => {
  siteHeader.classList.remove("header-hidden");
});

/* Filters and sorting */
let sortMode = "earliest";
const activeStatuses = new Set(["in-development", "paused", "abandoned"]);
let projectRows = [];
let projectsLoaded = false;

const setMenuOpen = (open) => {
  filterMenu.classList.toggle("open", open);
  filterToggle.setAttribute("aria-expanded", String(open));
};

const applyProjectView = () => {
  const rows = [...projectRows];

  rows.sort((a, b) => {
    if (sortMode === "alphabetical") {
      return a.dataset.name.localeCompare(b.dataset.name);
    }

    const direction = sortMode === "latest" ? -1 : 1;
    const aHasEditorialOrder = a.dataset.sortOrder !== "";
    const bHasEditorialOrder = b.dataset.sortOrder !== "";
    if (aHasEditorialOrder !== bHasEditorialOrder) return aHasEditorialOrder ? -1 : 1;

    if (aHasEditorialOrder) {
      const editorialOrder = Number(a.dataset.sortOrder) - Number(b.dataset.sortOrder);
      if (editorialOrder !== 0) return direction * editorialOrder;
    }

    const aDate = Date.parse(a.dataset.createdAt) || Number.MAX_SAFE_INTEGER;
    const bDate = Date.parse(b.dataset.createdAt) || Number.MAX_SAFE_INTEGER;
    return direction * (aDate - bDate) || a.dataset.name.localeCompare(b.dataset.name);
  });

  rows.forEach((row) => projectTableBody.appendChild(row));

  let visibleCount = 0;
  rows.forEach((row) => {
    const visible = activeStatuses.has(row.dataset.status);
    row.hidden = !visible;
    if (visible) visibleCount += 1;
  });

  emptyState.hidden = !projectsLoaded || visibleCount !== 0;
};

const safeWebHref = (value) => {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

const createExternalLink = (className, label, href) => {
  const safeHref = safeWebHref(href);
  if (!safeHref) return null;

  const link = document.createElement("a");
  link.className = className;
  link.href = safeHref;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  return link;
};

const statusPresentation = {
  "in-development": { label: "In development", className: "status-development" },
  paused: { label: "Paused", className: "status-paused" },
  abandoned: { label: "Abandoned", className: "status-abandoned" },
};

const createProjectRow = (project) => {
  const metadata = project.metadata ?? {};
  const repository = project.repository ?? {};
  const displayName = metadata.displayName || repository.name || project.slug;
  const row = document.createElement("tr");
  row.className = "project-row";
  row.dataset.name = displayName;
  row.dataset.status = metadata.status || "in-development";
  row.dataset.sortOrder = metadata.sortOrder ?? "";
  row.dataset.createdAt = repository.createdAt ?? "";

  const nameCell = document.createElement("td");
  nameCell.dataset.label = "Project";
  const nameLink = createExternalLink(
    "project-name",
    displayName,
    repository.url,
  );
  if (nameLink) nameCell.appendChild(nameLink);
  else nameCell.textContent = project.displayName;
  row.appendChild(nameCell);

  const statusCell = document.createElement("td");
  statusCell.dataset.label = "Status";
  const status = statusPresentation[metadata.status] ?? statusPresentation["in-development"];
  const statusBadge = document.createElement("span");
  statusBadge.className = `status ${status.className}`;
  statusBadge.textContent = status.label;
  statusCell.appendChild(statusBadge);

  if (repository.archived === true) {
    const archivedBadge = document.createElement("span");
    archivedBadge.className = "status status-archived";
    archivedBadge.textContent = "Archived on GitHub";
    archivedBadge.setAttribute("aria-label", "Repository is archived on GitHub");
    statusCell.appendChild(archivedBadge);
  }
  row.appendChild(statusCell);

  const repositoryCell = document.createElement("td");
  repositoryCell.dataset.label = "Repository";
  const repositoryLink = createExternalLink(
    "repo-link",
    repository.fullName ?? project.slug,
    repository.url,
  );
  if (repositoryLink) repositoryCell.appendChild(repositoryLink);
  else repositoryCell.textContent = repository.fullName ?? project.slug;
  row.appendChild(repositoryCell);

  const descriptionCell = document.createElement("td");
  descriptionCell.dataset.label = "Description";
  const description = document.createElement("p");
  description.className = "description";
  description.textContent = metadata.description
    || repository.description
    || "No description provided yet.";
  descriptionCell.appendChild(description);
  row.appendChild(descriptionCell);

  return row;
};

const loadProjects = async () => {
  try {
    const response = await fetch("/data/projects.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Project data returned HTTP ${response.status}`);

    const data = await response.json();
    if (data.version !== 1 || !Array.isArray(data.projects)) {
      throw new Error("Project data has an unsupported format");
    }

    const names = new Set();
    projectRows = data.projects.map((project) => {
      const key = project.repository?.fullName?.toLowerCase() ?? project.slug.toLowerCase();
      if (names.has(key)) throw new Error(`Duplicate project in generated data: ${key}`);
      names.add(key);
      return createProjectRow(project);
    });

    projectTableBody.replaceChildren(...projectRows);
    projectsLoaded = true;
    loadingState.hidden = true;
    errorState.hidden = true;
    applyProjectView();
  } catch (error) {
    loadingState.hidden = true;
    errorState.hidden = false;
    console.error("Could not load project data.", error);
  }
};

filterToggle.addEventListener("click", () => {
  setMenuOpen(filterToggle.getAttribute("aria-expanded") !== "true");
});

filterMenu.querySelectorAll("[data-sort]").forEach((option) => {
  option.addEventListener("click", () => {
    sortMode = option.dataset.sort;

    filterMenu.querySelectorAll("[data-sort]").forEach((item) => {
      item.setAttribute("aria-checked", String(item === option));
    });

    applyProjectView();
    setMenuOpen(false);
    filterToggle.focus();
  });
});

filterMenu.querySelectorAll("[data-status]").forEach((option) => {
  option.addEventListener("click", () => {
    const status = option.dataset.status;
    const enabled = option.getAttribute("aria-checked") === "true";

    if (enabled) {
      activeStatuses.delete(status);
    } else {
      activeStatuses.add(status);
    }

    option.setAttribute("aria-checked", String(!enabled));
    applyProjectView();
  });
});

document.addEventListener("click", (event) => {
  if (!filterMenu.contains(event.target) && !filterToggle.contains(event.target)) {
    setMenuOpen(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && filterToggle.getAttribute("aria-expanded") === "true") {
    setMenuOpen(false);
    filterToggle.focus();
  }
});

loadProjects();
