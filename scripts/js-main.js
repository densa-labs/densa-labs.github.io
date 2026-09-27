const root = document.documentElement;
const themeToggle = document.getElementById("theme-toggle");
const themeColorMeta = document.getElementById("theme-color-meta");
const siteHeader = document.getElementById("site-header");

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

const featuredProject = document.getElementById("featured-project");

const safeWebHref = (value) => {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

const makeExternalLink = (className, label, href, ariaLabel) => {
  const safeHref = safeWebHref(href);
  if (!safeHref) return null;

  const link = document.createElement("a");
  link.className = className;
  link.href = safeHref;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  if (ariaLabel) link.setAttribute("aria-label", ariaLabel);
  return link;
};

const renderFeaturedProject = (project) => {
  if (!featuredProject || !project) return;

  const metadata = project.metadata ?? {};
  const repository = project.repository ?? {};
  const title = metadata.featuredTitle || metadata.displayName || repository.name || project.slug;
  const logo = document.createElement("div");
  logo.className = "themed-project-logo";
  logo.setAttribute("aria-label", title);

  const darkLogoUrl = safeWebHref(metadata.icon?.darkUrl);
  const lightLogoUrl = safeWebHref(metadata.icon?.lightUrl);
  if (darkLogoUrl) {
    const darkLogo = document.createElement("img");
    darkLogo.className = "logo-dark";
    darkLogo.src = darkLogoUrl;
    darkLogo.alt = title;
    logo.appendChild(darkLogo);
  }
  if (lightLogoUrl) {
    const lightLogo = document.createElement("img");
    lightLogo.className = "logo-light";
    lightLogo.src = lightLogoUrl;
    lightLogo.alt = "";
    lightLogo.setAttribute("aria-hidden", "true");
    logo.appendChild(lightLogo);
  }
  logo.hidden = !darkLogoUrl && !lightLogoUrl;

  const content = document.createElement("div");
  content.className = "project-content";

  const titleLink = makeExternalLink(
    "project-title-link",
    "",
    repository.url,
    `Open ${title} repository on GitHub`,
  );
  if (titleLink) {
    const heading = document.createElement("h2");
    heading.textContent = title;
    titleLink.appendChild(heading);
    content.appendChild(titleLink);
  }

  const description = document.createElement("p");
  description.textContent = metadata.description
    || repository.description
    || "No description provided yet.";
  content.appendChild(description);

  const repositoryLink = makeExternalLink(
    "project-link",
    "View repository",
    repository.url,
  );
  if (repositoryLink) {
    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";
    repositoryLink.appendChild(arrow);
    content.appendChild(repositoryLink);
  }

  const website = metadata.links?.find((link) => link.type === "website");
  const websiteUrl = website?.url || repository.homepageUrl;
  const safeWebsiteUrl = safeWebHref(websiteUrl);
  const websiteLabel = safeWebsiteUrl ? new URL(safeWebsiteUrl).hostname : null;
  const websiteLink = websiteLabel
    ? makeExternalLink("project-url", websiteLabel, safeWebsiteUrl)
    : null;

  featuredProject.replaceChildren(logo, content);
  if (websiteLink) featuredProject.appendChild(websiteLink);
  featuredProject.hidden = false;
};

fetch("/data/projects.json", { cache: "no-cache" })
  .then((response) => {
    if (!response.ok) throw new Error(`Project data returned HTTP ${response.status}`);
    return response.json();
  })
  .then((data) => {
    if (data.version !== 1 || !Array.isArray(data.projects)) {
      throw new Error("Project data has an unsupported format");
    }
    renderFeaturedProject(data.projects.find((project) => project.metadata?.featured));
  })
  .catch((error) => {
    console.error("Could not load the featured project.", error);
  });
