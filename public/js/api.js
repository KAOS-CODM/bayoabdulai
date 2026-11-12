// =========================================================
// PUBLIC API UTILITY
// Bayo Abdulai Badmus Portfolio
// Uses same-origin relative URLs; no server secrets exposed.
// =========================================================

/**
 * Fetches from the server with consistent error handling.
 * Validates the expected {ok, data, pagination} response structure from the backend.
 * Returns an object { data: Array, pagination: Object } on success, or null on any failure.
 */
async function apiFetch(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    // The backend always wraps responses: { ok: true, data: [...], pagination: {...} }
    // or error responses: { ok: false, error: { code, message } }
    if (!data || typeof data !== "object") {
      throw new Error("Invalid response structure");
    }
    if (data.ok === false) {
      throw new Error(data.error?.message || "API request failed");
    }
    // Return both the data array and the pagination metadata
    return { data: data.data || [], pagination: data.pagination || {} };
  } catch (error) {
    console.error("API fetch error:", error.message);
    return null;
  }
}

/**
 * Fetch featured published projects.
 * Returns { data: Array, pagination: Object } or null on failure.
 */
export async function fetchFeaturedProjects() {
  return apiFetch("/api/v1/projects/featured");
}

/**
 * Fetch a single page of published projects, optionally filtered by category.
 * @param {number} [page=1] - Page number (1-indexed)
 * @param {string} [category] - Optional category filter (URL-encoded)
 * @returns {Promise<{data: Array, pagination: Object}|null} The page data and pagination info, or null on failure.
 */
export async function fetchPublishedProjects(page, category) {
  const params = new URLSearchParams();
  params.append("page", page);
  if (category) {
    params.append("category", category);
  }
  return apiFetch(`/api/v1/projects?${params.toString()}`);
}

/**
 * Fetch all published projects across all pages, combining results without duplicates.
 * Respects the API's maximum page size (50).
 * Stops when the API indicates there are no more results.
 * @param {string} [category] - Optional category filter (URL-encoded).
 * @returns {Promise<Array>} The combined unique data array, or empty array on failure/no results.
 */
export async function fetchAllPublishedProjects(category) {
  const allResults = [];
  const seenIds = new Set();
  let page = 1;
  const limit = 50; // API max page size

  // We'll loop until we've fetched totalPages, but we need to fetch the first page
  // to discover totalPages. We'll use a max of 100 pages as a safety limit.
  const maxPages = 100;

  while (page <= maxPages) {
    const result = await fetchPublishedProjects(page, category);
    if (!result) {
      // API failure - return what we have so far, or null if we have nothing
      // Per the spec: "Handle a failure on any page without silently presenting an incomplete project list as complete"
      // So we return null to trigger an error state
      return null;
    }

    const pageData = result.data || [];
    const pagination = result.pagination || {};

    // Add unique items from this page
    let pageHasNew = false;
    for (const item of pageData) {
      // Use project id or slug as the uniqueness key
      const id = item.id || item.slug;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        allResults.push(item);
        pageHasNew = true;
      }
    }

    // Check if we've reached the last page
    const totalPages = pagination.totalPages || 1;
    if (page >= totalPages || !pageHasNew && allResults.length > 0) {
      // We've fetched all available pages or no new items were added
      break;
    }

    // Also stop if this page returned fewer items than the limit (indicating end of results)
    if (pageData.length < limit) {
      // Last page reached
      break;
    }

    page++;
  }

  // Deduplicate by id (in case the API doesn't provide consistent ids)
  const deduped = [];
  const dedupedIds = new Set();
  for (const item of allResults) {
    const id = item.id || item.slug;
    if (id && !dedupedIds.has(id)) {
      dedupedIds.add(id);
      deduped.push(item);
    } else if (!id) {
      // Items without ids - just add if not already present
      if (!deduped.includes(item)) {
        deduped.push(item);
      }
    }
  }

  return deduped;
}

/**
 * Fetch all available categories from published projects.
 * Returns an array of { name, count } or null on failure.
 */
export async function fetchCategories() {
  return apiFetch("/api/v1/categories");
}

/**
 * Builds a safe slug from a project title for detail-page links.
 * Slugs must match the schema: lowercase words separated by single hyphens.
 * @param {string} title
 * @returns {string}
 */
export function buildSlug(title) {
  return (
    title
      .toLowerCase()
      // Remove all non-alphanumeric except spaces and hyphens
      .replace(/[^a-z0-9\s-]/g, "")
      // Replace runs of spaces/hyphens with single hyphen
      .replace(/[\s-]+/g, "-")
      // Trim leading/trailing hyphens
      .replace(/^-+|-+$/g, "")
  );
}

/**
 * Creates a safe URL for a project detail page.
 * @param {string} slug
 * @returns {string}
 */
export function detailPageUrl(slug) {
  return `/projects/${slug}`;
}

/**
 * Checks whether a project status is draft or archived (excluded from public API).
 * @param {string} status
 * @returns {boolean}
 */
export function isPublicStatus(status) {
  return status === "published";
}

/**
 * Provides a fallback image URL.
 * Permits root-relative local asset paths and valid HTTPS URLs.
 * @param {string} url
 * @returns {string}
 */
export function fallbackImageUrl(url) {
  if (!url) return "/assets/images/placeholder.png";
  if (url.startsWith("/")) return url; // root-relative local asset
  if (url.startsWith("https://")) return url; // safe external
  return "/assets/images/placeholder.png"; // default fallback
}

/**
 * Creates a project card DOM element from API data.
 * Uses DOM creation and textContent for safety.
 * @param {Object} proj
 * @returns {HTMLAnchorElement}
 */
export function createProjectCard(proj) {
  const a = document.createElement("a");
  a.target = "_blank";
  a.rel = "noopener";

  // Safely construct the detail-page slug
  const slug = proj.slug || "";
  // Validate slug: must be lowercase words separated by hyphens
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const safeSlug = slugRegex.test(slug) ? slug : buildSlug(proj.title || "");

  a.href = `/projects/${safeSlug}`;
  a.className = "group block rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:border-purple-200 hover:shadow-md dark:border-slate-800 dark:bg-[#1b1824]";

  // Image container
  const imgDiv = document.createElement("div");
  imgDiv.className = "aspect-[1.15/1] overflow-hidden bg-slate-100 dark:bg-slate-800";

  const img = document.createElement("img");
  img.className = "h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]";
  img.src = fallbackImageUrl(proj.media?.[0]?.url);
  img.alt = proj.alt || proj.title || "";
  // Safe: img.alt is set from trusted data or title; no innerHTML used
  img.loading = "lazy";

  imgDiv.appendChild(img);

  // Text content
  const textDiv = document.createElement("div");
  textDiv.className = "p-4";

  // Category tag
  const categoryP = document.createElement("p");
  categoryP.className = "text-[9px] text-purple-600";
  categoryP.textContent = proj.category || "";

  // Title
  const titleH2 = document.createElement("h2");
  titleH2.className = "mt-1 text-sm font-bold";
  titleH2.textContent = proj.title || "";

  // Description
  const descP = document.createElement("p");
  descP.className = "mt-1 text-[9px] text-slate-500";
  descP.textContent = proj.shortDescription || "";

  // Tag metadata
  const tagDiv = document.createElement("div");
  tagDiv.className = "mt-2 text-[9px] text-slate-500";
  // Show primary category and any available tags
  const parts = [];
  if (proj.category) parts.push(proj.category);
  if (proj.tags && proj.tags.length > 0) parts.push(proj.tags.join(", "));
  tagDiv.textContent = parts.join(" | ");

  // Assemble text content
  textDiv.appendChild(categoryP);
  textDiv.appendChild(titleH2);
  textDiv.appendChild(descP);
  textDiv.appendChild(tagDiv);

  // Assemble the anchor
  a.appendChild(imgDiv);
  a.appendChild(textDiv);

  return a;
}

// ==========================================================
// HOMEPAGE: Featured Projects Initialization
// ==========================================================

/**
 * Renders the featured projects state into the container element.
 * @param {HTMLElement} container
 * @param {Array|null} projects
 */
function renderFeaturedState(container, projects) {
  if (!container) return;

  // Clear any previous content
  container.innerHTML = "";

  // Show loading state while fetching (only on first load)
  if (!projects && !(container.dataset && container.dataset.loaded === "true")) {
    container.innerHTML = `
      <p class="col-span-full text-center py-8 text-slate-500 dark:text-slate-400">
        Loading featured projects…
      </p>
    `;
    container.dataset.loaded = "true";
    return;
  }

  // Empty state: no featured published projects
  if (!projects || projects.length === 0) {
    container.innerHTML = `
      <p class="col-span-full text-center py-8 text-slate-500 dark:text-slate-400">
        No featured projects at this time.
      </p>
    `;
    return;
  }

  // Render project cards
  const fragment = document.createDocumentFragment();
  projects.forEach((proj) => {
    const card = createProjectCard(proj);
    fragment.appendChild(card);
  });
  container.appendChild(fragment);
  container.dataset.loaded = "true";
}

/**
 * Shows an error state with a Retry button for the featured projects container.
 * @param {HTMLElement} container
 * @param {string} errorMessage
 */
function renderErrorState(container, errorMessage) {
  if (!container) return;
  container.innerHTML = `
    <p class="col-span-full text-center py-8 text-slate-500 dark:text-slate-400">
      Error loading featured projects: ${errorMessage}
    </p>
    <button
      id="retry-featured"
      class="rounded-full bg-purple-600 px-4 py-2 text-[9px] font-semibold text-white margin-auto"
    >
      Retry
    </button>
  `;

  // Attach retry handler
  const retryBtn = container.querySelector("#retry-featured");
  if (retryBtn) {
    retryBtn.addEventListener("click", async () => {
      // Clear the data-loaded flag so renderFeaturedState will show loading again
      container.dataset.loaded = "";
      // Re-fetch and re-render
      const result = await fetchFeaturedProjects();
      if (result && result.data) {
        renderFeaturedState(container, result.data);
      } else {
        renderErrorState(container, "Failed to load featured projects. Please try again.");
      }
    });
  }
}

// Initialize featured projects on DOMContentLoaded
document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("featured-projects");
  if (!container) return;

  // Fetch featured projects
  const result = await fetchFeaturedProjects();

  // Render the appropriate state
  if (result && result.data) {
    renderFeaturedState(container, result.data);
  } else {
    renderErrorState(container, "Failed to load featured projects. Please try again.");
  }
});

// ==========================================================
// WORK PAGE: Category Filters + Project Grid Initialization
// ==========================================================

/**
 * Renders category filter buttons from API data.
 * @param {HTMLElement} container
 * @param {Array} categories
 */
function renderCategoryFilters(container, categories) {
  if (!container) return;

  container.innerHTML = "";

  // All Projects button
  const allBtn = document.createElement("button");
  allBtn.className = 'rounded-full bg-purple-600 px-4 py-2 text-[9px] font-semibold text-white data-filter="all"';
  allBtn.textContent = "All Projects";
  allBtn.setAttribute("data-filter", "all");
  container.appendChild(allBtn);

  // Category buttons from API
  categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = `rounded-full border border-slate-200 px-4 py-2 text-[9px] font-medium text-slate-500 dark:border-slate-700`;
    btn.textContent = cat.name;
    btn.setAttribute("data-filter", cat.name);
    container.appendChild(btn);
  });
}

/**
 * Renders project cards into the grid container.
 * @param {HTMLElement} container
 * @param {Array|null} projects
 */
function renderProjectGrid(container, projects) {
  if (!container) return;

  container.innerHTML = "";

  // Loading state
  if (!projects && !(container.dataset && container.dataset.loaded === "true")) {
    container.innerHTML = `
      <p class="col-span-2 text-center py-8 text-slate-500 dark:text-slate-400">
        Loading projects…
      </p>
    `;
    container.dataset.loaded = "true";
    return;
  }

  // Empty state: no projects
  if (!projects || projects.length === 0) {
    container.innerHTML = `
      <p class="col-span-2 text-center py-8 text-slate-500 dark:text-slate-400">
        No projects found.
      </p>
    `;
    return;
  }

  // Render project cards
  const fragment = document.createDocumentFragment();
  projects.forEach((proj) => {
    const card = createProjectCard(proj);
    fragment.appendChild(card);
  });
  container.appendChild(fragment);
  container.dataset.loaded = "true";
}

/**
 * Applies category filtering to the project grid.
 * @param {HTMLElement} gridContainer
 * @param {Array} allProjects
 * @param {string} selectedFilter
 */
function applyCategoryFilter(gridContainer, allProjects, selectedFilter) {
  // Hide all project cards initially
  const cards = gridContainer.querySelectorAll("a");
  cards.forEach((card) => card.classList.add("hidden"));

  if (selectedFilter === "all") {
    // Show all cards
    cards.forEach((card) => card.classList.remove("hidden"));
    return;
  }

  // Show only cards matching the selected category filter
  cards.forEach((card) => {
    const categoryTag = card.querySelector("p.text-purple-600");
    const categoryText = categoryTag ? categoryTag.textContent.trim() : "";
    if (categoryText === selectedFilter) {
      card.classList.remove("hidden");
    }
  });
}

/**
 * Shows an error state with a Retry button for the project grid.
 * @param {HTMLElement} container
 * @param {string} errorMessage
 */
function renderErrorGrid(container, errorMessage) {
  if (!container) return;
  container.innerHTML = `
    <p class="col-span-2 text-center py-8 text-slate-500 dark:text-slate-400">
      Error loading projects: ${errorMessage}
    </p>
    <button
      id="retry-projects"
      class="rounded-full bg-purple-600 px-4 py-2 text-[9px] font-semibold text-white margin-auto"
    >
      Retry
    </button>
  `;

  // Attach retry handler
  const retryBtn = container.querySelector("#retry-projects");
  if (retryBtn) {
    retryBtn.addEventListener("click", async () => {
      // Clear the data-loaded flag so renderProjectGrid will show loading again
      container.dataset.loaded = "";
      // Re-fetch all projects
      const projects = await fetchAllPublishedProjects();
      if (projects && projects.length > 0) {
        renderProjectGrid(container, projects);
        // Re-apply the current filter state
        const filterButtons = container.parentElement.querySelectorAll("#category-filters button");
        let currentFilter = "all";
        filterButtons.forEach((btn) => btn.classList.remove("bg-purple-600", "text-white"));
        if (filterButtons.length > 0) {
          filterButtons[0].classList.add("bg-purple-600", "text-white");
        }
      } else {
        renderErrorGrid(container, "Failed to load projects. Please try again.");
      }
    });
  }
}

/**
 * Initializes the Work page: fetches all published projects with pagination,
 * sets up category filters, and handles retry behavior.
 */
async function initWorkPage() {
  // --- Category Filters ---
  const filtersContainer = document.getElementById("category-filters");
  if (filtersContainer) {
    const categories = await fetchCategories();
    // Handle both wrapped and direct array responses
    const catData = categories && categories.data ? categories.data : (categories || []);
    renderCategoryFilters(filtersContainer, catData);
  }

  // --- Project Grid ---
  const gridContainer = document.getElementById("project-grid");
  if (!gridContainer) return;

  // Fetch ALL published projects across all pages
  const projects = await fetchAllPublishedProjects();

  // Handle both wrapped and direct array responses
  const projectData = projects && Array.isArray(projects) ? projects : (projects || []);

  // Render project grid
  renderProjectGrid(gridContainer, projectData);

  // Set up filter button click handlers
  if (filtersContainer) {
    const filterButtons = filtersContainer.querySelectorAll("button");
    let currentFilter = "all";

    // Set initial active state - All Projects button starts active
    filterButtons.forEach((btn) => btn.classList.remove("bg-purple-600", "text-white"));
    if (filterButtons.length > 0) {
      filterButtons[0].classList.add("bg-purple-600", "text-white");
    }

    filterButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        // Update visual state - remove active class from all buttons first
        filterButtons.forEach((b) => b.classList.remove("bg-purple-600", "text-white"));
        // Add to the clicked button
        btn.classList.add("bg-purple-600", "text-white");
        currentFilter = btn.getAttribute("data-filter");
        // Apply filtering
        applyCategoryFilter(gridContainer, projectData, currentFilter);
      });
    });
  }
}

// Initialize Work page on DOMContentLoaded
document.addEventListener("DOMContentLoaded", async () => {
  // --- Category Filters ---
  const filtersContainer = document.getElementById("category-filters");
  if (filtersContainer) {
    const categories = await fetchCategories();
    // Handle both wrapped and direct array responses
    const catData = categories && categories.data ? categories.data : (categories || []);
    renderCategoryFilters(filtersContainer, catData);
  }

  // --- Project Grid ---
  const gridContainer = document.getElementById("project-grid");
  if (!gridContainer) return;

  // Fetch ALL published projects across all pages
  const projects = await fetchAllPublishedProjects();
  const projectData = projects && Array.isArray(projects) ? projects : (projects || []);

  // Render project grid with actual data
  renderProjectGrid(gridContainer, projectData);

  // Set up filter button click handlers
  if (filtersContainer) {
    const filterButtons = filtersContainer.querySelectorAll("button");
    let currentFilter = "all";

    // Set initial active state - All Projects button starts active
    filterButtons.forEach((btn) => btn.classList.remove("bg-purple-600", "text-white"));
    if (filterButtons.length > 0) {
      filterButtons[0].classList.add("bg-purple-600", "text-white");
    }

    filterButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        // Update visual state - remove active class from all buttons first
        filterButtons.forEach((b) => b.classList.remove("bg-purple-600", "text-white"));
        // Add to the clicked button
        btn.classList.add("bg-purple-600", "text-white");
        currentFilter = btn.getAttribute("data-filter");
        // Apply filtering
        applyCategoryFilter(gridContainer, projectData, currentFilter);
      });
    });
  }
});

// --- End of api.js ---