// =========================================================
// GLOBAL THEME TOGGLE
// Bayo Abdulai Portfolio
// =========================================================

const themeToggle = document.getElementById("themeToggle");
const themeKnob = document.getElementById("themeKnob");


// ---------------------------------------------------------
// Apply saved theme immediately
// ---------------------------------------------------------

const savedTheme = localStorage.getItem("theme");

if (
  savedTheme === "dark" ||
  (
    savedTheme === null &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  )
) {
  document.documentElement.classList.add("dark");
}


// ---------------------------------------------------------
// Update toggle appearance
// ---------------------------------------------------------

function updateThemeToggle() {
  const isDark = document.documentElement.classList.contains("dark");

  if (themeKnob) {
    themeKnob.textContent = isDark ? "☾" : "☼";
  }

  if (themeToggle) {
    themeToggle.setAttribute(
      "aria-label",
      isDark ? "Switch to light mode" : "Switch to dark mode"
    );

    themeToggle.setAttribute(
      "aria-pressed",
      isDark ? "true" : "false"
    );
  }
}


// ---------------------------------------------------------
// Toggle theme
// ---------------------------------------------------------

themeToggle?.addEventListener("click", () => {
  const isDark = document.documentElement.classList.toggle("dark");

  localStorage.setItem(
    "theme",
    isDark ? "dark" : "light"
  );

  updateThemeToggle();
});


// ---------------------------------------------------------
// Set initial toggle state
// ---------------------------------------------------------

updateThemeToggle();