// =========================================================
// MOBILE HAMBURGER MENU
// Bayo Abdulai Portfolio
// =========================================================

const menuToggle = document.getElementById("menuToggle");
const mobileMenu = document.getElementById("mobileMenu");


// ---------------------------------------------------------
// Open / close helper
// ---------------------------------------------------------

function setMenu(open) {
  if (!menuToggle || !mobileMenu) return;

  mobileMenu.classList.toggle("hidden", !open);
  menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
  menuToggle.setAttribute(
    "aria-label",
    open ? "Close menu" : "Open menu"
  );
}


// ---------------------------------------------------------
// Toggle on hamburger click
// ---------------------------------------------------------

menuToggle?.addEventListener("click", () => {
  const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
  setMenu(!isOpen);
});


// ---------------------------------------------------------
// Close after choosing a link
// ---------------------------------------------------------

mobileMenu?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => setMenu(false));
});


// ---------------------------------------------------------
// Close on Escape
// ---------------------------------------------------------

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMenu(false);
});


// ---------------------------------------------------------
// Close when clicking outside the menu
// ---------------------------------------------------------

document.addEventListener("click", (event) => {
  if (menuToggle?.getAttribute("aria-expanded") !== "true") return;
  if (!mobileMenu?.contains(event.target) &&
      !menuToggle?.contains(event.target)) {
    setMenu(false);
  }
});


// ---------------------------------------------------------
// Close when switching to desktop width (md+)
// ---------------------------------------------------------

window.matchMedia("(min-width: 768px)").addEventListener("change", (event) => {
  if (event.matches) setMenu(false);
});
