const root = document.documentElement;
const themeToggle = document.getElementById("theme-toggle");
const themeColorMeta = document.getElementById("theme-color-meta");
const siteHeader = document.getElementById("site-header");
const filterToggle = document.getElementById("filter-toggle");
const filterMenu = document.getElementById("filter-menu");
const projectTableBody = document.getElementById("project-table-body");
const emptyState = document.getElementById("empty-state");

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

const setMenuOpen = (open) => {
  filterMenu.classList.toggle("open", open);
  filterToggle.setAttribute("aria-expanded", String(open));
};

const applyProjectView = () => {
  const rows = Array.from(projectTableBody.querySelectorAll(".project-row"));

  rows.sort((a, b) => {
    if (sortMode === "latest") {
      return Number(b.dataset.order) - Number(a.dataset.order);
    }

    if (sortMode === "alphabetical") {
      return a.dataset.name.localeCompare(b.dataset.name);
    }

    return Number(a.dataset.order) - Number(b.dataset.order);
  });

  rows.forEach((row) => projectTableBody.appendChild(row));

  let visibleCount = 0;
  rows.forEach((row) => {
    const visible = activeStatuses.has(row.dataset.status);
    row.hidden = !visible;
    if (visible) visibleCount += 1;
  });

  emptyState.hidden = visibleCount !== 0;
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

applyProjectView();
