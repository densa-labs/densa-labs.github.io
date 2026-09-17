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
