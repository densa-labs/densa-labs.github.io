import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ORGANIZATION = "densa-labs";
const GITHUB_API = "https://api.github.com";
const RAW_GITHUB = "https://raw.githubusercontent.com";
const FETCH_TIMEOUT_MS = 15_000;
const METADATA_FILE = "densa.project.json";
const FALLBACK_FILE = new URL("../data/projects.fallback.json", import.meta.url);
const OUTPUT_FILE = new URL("../data/projects.json", import.meta.url);
const EXCLUDED_REPOSITORIES = new Set([".github", "densa-labs.github.io"]);
const EXCLUDED_TOPIC = "densa-exclude";
const VALID_STATUSES = new Set(["in-development", "paused", "abandoned"]);
const VALID_LINK_TYPES = new Set(["website", "demo", "docs", "download", "other"]);
const METADATA_FIELDS = new Set([
  "schemaVersion",
  "displayName",
  "description",
  "status",
  "sortOrder",
  "category",
  "tags",
  "links",
  "featured",
  "featuredTitle",
  "icon",
]);

/** @typedef {"in-development" | "paused" | "abandoned"} ProjectStatus */

/**
 * Repository facts returned by GitHub's public organization repository endpoint.
 * @typedef {object} GitHubRepositoryData
 * @property {string} name
 * @property {string} fullName
 * @property {string} url
 * @property {string | null} description
 * @property {string | null} homepageUrl
 * @property {string | null} primaryLanguage
 * @property {string[] | null} languages
 * @property {string[]} topics
 * @property {string | null} createdAt
 * @property {string | null} updatedAt
 * @property {boolean | null} archived
 * @property {boolean | null} fork
 * @property {boolean | null} isTemplate
 * @property {string | null} visibility
 * @property {string | null} defaultBranch
 */

/**
 * Optional editorial fields stored in a repository's root densa.project.json.
 * @typedef {object} DensaProjectMetadata
 * @property {1} schemaVersion
 * @property {string=} displayName
 * @property {string=} description
 * @property {ProjectStatus=} status
 * @property {number=} sortOrder
 * @property {string=} category
 * @property {string[]=} tags
 * @property {{type: string, label: string, url: string}[]=} links
 * @property {boolean=} featured
 * @property {string=} featuredTitle
 * @property {{dark?: string, light?: string}=} icon
 */

/**
 * @typedef {DensaProjectMetadata & {
 *   status: ProjectStatus,
 *   featured: boolean,
 *   icon: {darkUrl: string | null, lightUrl: string | null}
 * }} ResolvedDensaProjectMetadata
 */

/**
 * A repository record plus its optional Densa Labs metadata. Display values are derived
 * by the pages from these two distinct sources instead of duplicated into another registry.
 * @typedef {object} Project
 * @property {string} slug
 * @property {GitHubRepositoryData} repository
 * @property {ResolvedDensaProjectMetadata} metadata
 */

export class ProjectMetadataValidationError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "ProjectMetadataValidationError";
  }
}

/** @param {unknown} value */
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/** @param {unknown} value */
const optionalNonEmptyString = (value) => (
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null
);

/** @param {unknown} value */
const safeWebUrl = (value) => {
  if (typeof value !== "string" || value.trim() === "") return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
};

/**
 * Parse and validate a public repository's optional project manifest.
 * Unknown keys are rejected so misspelled editorial fields cannot silently disappear.
 * @param {string} source
 * @param {string} repositoryFullName
 * @returns {DensaProjectMetadata}
 */
export function parseProjectMetadata(source, repositoryFullName) {
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new ProjectMetadataValidationError(
      `Invalid ${METADATA_FILE} for ${repositoryFullName}: JSON could not be parsed (${error.message})`,
    );
  }

  const fail = (field, expectation) => {
    throw new ProjectMetadataValidationError(
      `Invalid ${METADATA_FILE} for ${repositoryFullName}: ${field} ${expectation}`,
    );
  };

  if (!isObject(value)) fail("document", "must be a JSON object");

  for (const key of Object.keys(value)) {
    if (!METADATA_FIELDS.has(key)) fail(key, "is not a supported field");
  }

  if (value.schemaVersion !== 1) fail("schemaVersion", "must equal 1");

  for (const field of ["displayName", "description", "category", "featuredTitle"]) {
    if (field in value && optionalNonEmptyString(value[field]) === null) {
      fail(field, "must be a non-empty string");
    }
  }

  if ("status" in value && !VALID_STATUSES.has(value.status)) {
    fail("status", `must be one of ${Array.from(VALID_STATUSES).join(", ")}`);
  }

  if ("sortOrder" in value && (!Number.isInteger(value.sortOrder) || value.sortOrder < 1)) {
    fail("sortOrder", "must be a positive integer");
  }

  if ("featured" in value && typeof value.featured !== "boolean") {
    fail("featured", "must be a boolean");
  }

  if ("tags" in value && (!Array.isArray(value.tags)
    || value.tags.some((tag) => optionalNonEmptyString(tag) === null))) {
    fail("tags", "must be an array of non-empty strings");
  }

  if ("links" in value && (!Array.isArray(value.links) || value.links.some((link) => (
    !isObject(link)
    || Object.keys(link).some((key) => !["type", "label", "url"].includes(key))
    || !VALID_LINK_TYPES.has(link.type)
    || optionalNonEmptyString(link.label) === null
    || safeWebUrl(link.url) === null
    || new URL(link.url).protocol !== "https:"
  )))) {
    fail("links", "must contain typed links with a non-empty label and an HTTPS URL");
  }

  if ("icon" in value) {
    if (!isObject(value.icon)) fail("icon", "must be an object with repository-relative paths");
    for (const key of Object.keys(value.icon)) {
      if (!["dark", "light"].includes(key)) fail(`icon.${key}`, "is not a supported variant");
      const path = value.icon[key];
      if (typeof path !== "string" || path.trim() === "" || path.startsWith("/")
        || path.includes("\\") || path.includes("\u0000")
        || path.split("/").some((part) => part === ".." || part === "." || part === "")) {
        fail(`icon.${key}`, "must be a safe repository-relative file path");
      }
    }
  }

  return {
    schemaVersion: 1,
    ...(value.displayName ? { displayName: value.displayName.trim() } : {}),
    ...(value.description ? { description: value.description.trim() } : {}),
    ...(value.status ? { status: value.status } : {}),
    ...(value.sortOrder !== undefined ? { sortOrder: value.sortOrder } : {}),
    ...(value.category ? { category: value.category.trim() } : {}),
    ...(value.tags ? { tags: value.tags.map((tag) => tag.trim()) } : {}),
    ...(value.links ? {
      links: value.links.map((link) => ({
        type: link.type,
        label: link.label.trim(),
        url: new URL(link.url).href,
      })),
    } : {}),
    ...(value.featured !== undefined ? { featured: value.featured } : {}),
    ...(value.featuredTitle ? { featuredTitle: value.featuredTitle.trim() } : {}),
    ...(value.icon ? { icon: { ...value.icon } } : {}),
  };
}

/**
 * Return whether a repository belongs in the automatically discovered project set.
 * Archived, research, and tooling repositories remain eligible by default.
 * @param {Record<string, any>} repository
 */
export function isEligibleRepository(repository) {
  const owner = optionalNonEmptyString(repository.owner?.login)?.toLowerCase();
  const name = optionalNonEmptyString(repository.name);
  const visibility = optionalNonEmptyString(repository.visibility)?.toLowerCase();
  const isPublic = repository.private === false || visibility === "public";

  return owner === ORGANIZATION
    && Boolean(name)
    && isPublic
    && repository.fork !== true
    && repository.is_template !== true
    && !EXCLUDED_REPOSITORIES.has(name.toLowerCase())
    && !(Array.isArray(repository.topics)
      && repository.topics.some((topic) => String(topic).toLowerCase() === EXCLUDED_TOPIC));
}

/** @param {unknown} value */
const cleanDate = (value) => (
  typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null
);

/**
 * @param {Record<string, any>} repository
 * @returns {GitHubRepositoryData}
 */
function mapRepository(repository) {
  const fullName = optionalNonEmptyString(repository.full_name);
  const name = optionalNonEmptyString(repository.name);
  if (!fullName || !name) throw new Error("GitHub returned a repository without name/full_name");

  const url = safeWebUrl(repository.html_url) ?? `https://github.com/${fullName}`;
  return {
    name,
    fullName,
    url,
    description: optionalNonEmptyString(repository.description),
    homepageUrl: safeWebUrl(repository.homepage),
    primaryLanguage: optionalNonEmptyString(repository.language),
    languages: Array.isArray(repository.languages)
      ? [...new Set(repository.languages.filter((language) => typeof language === "string" && language.trim()))]
      : null,
    topics: Array.isArray(repository.topics)
      ? [...new Set(repository.topics.filter((topic) => typeof topic === "string" && topic.trim()))].sort()
      : [],
    createdAt: cleanDate(repository.created_at),
    updatedAt: cleanDate(repository.updated_at),
    archived: typeof repository.archived === "boolean" ? repository.archived : null,
    fork: typeof repository.fork === "boolean" ? repository.fork : null,
    isTemplate: typeof repository.is_template === "boolean" ? repository.is_template : null,
    visibility: optionalNonEmptyString(repository.visibility)
      ?? (repository.private === false ? "public" : repository.private === true ? "private" : null),
    defaultBranch: optionalNonEmptyString(repository.default_branch),
  };
}

/** @param {string} branch */
const encodeBranch = (branch) => branch.split("/").map(encodeURIComponent).join("/");

/**
 * @param {GitHubRepositoryData} repository
 * @param {Record<string, any>} rawRepository
 * @param {DensaProjectMetadata} metadata
 * @returns {Project}
 */
function mergeProject(repository, rawRepository, metadata) {
  const iconUrl = (path) => {
    if (!path) return null;
    if (path.startsWith("/")) return path;
    const branch = rawRepository.default_branch;
    if (typeof branch !== "string" || !branch.trim()) return null;
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    return `${RAW_GITHUB}/${repository.fullName}/${encodeBranch(branch)}/${encodedPath}`;
  };

  const links = (metadata.links ?? []).filter((link) => (
    !(link.type === "website" && link.url === repository.homepageUrl)
  ));
  const mergedMetadata = {
    schemaVersion: 1,
    ...(metadata.displayName ? { displayName: metadata.displayName } : {}),
    ...(metadata.description ? { description: metadata.description } : {}),
    status: metadata.status ?? "in-development",
    ...(metadata.sortOrder !== undefined ? { sortOrder: metadata.sortOrder } : {}),
    ...(metadata.category ? { category: metadata.category } : {}),
    ...(metadata.tags ? { tags: metadata.tags } : {}),
    ...(links.length ? { links } : {}),
    featured: metadata.featured ?? false,
    ...(metadata.featuredTitle ? { featuredTitle: metadata.featuredTitle } : {}),
    icon: {
      darkUrl: iconUrl(metadata.icon?.dark ?? metadata.icon?.darkUrl),
      lightUrl: iconUrl(metadata.icon?.light ?? metadata.icon?.lightUrl),
    },
  };

  return {
    slug: repository.name,
    repository,
    metadata: mergedMetadata,
  };
}

/**
 * Order explicit editorial positions first, then date-sort unpositioned repositories.
 * @param {Project[]} projects
 */
function sortProjects(projects) {
  return projects.sort((left, right) => {
    const leftOrdered = left.metadata.sortOrder !== undefined;
    const rightOrdered = right.metadata.sortOrder !== undefined;
    if (leftOrdered !== rightOrdered) return leftOrdered ? -1 : 1;
    if (leftOrdered && rightOrdered && left.metadata.sortOrder !== right.metadata.sortOrder) {
      return left.metadata.sortOrder - right.metadata.sortOrder;
    }

    const leftDate = left.repository.createdAt ? Date.parse(left.repository.createdAt) : Number.MAX_SAFE_INTEGER;
    const rightDate = right.repository.createdAt ? Date.parse(right.repository.createdAt) : Number.MAX_SAFE_INTEGER;
    return leftDate - rightDate || left.slug.localeCompare(right.slug);
  });
}

/**
 * Turn normalized fallback metadata back into optional source overrides for a fresh GitHub record.
 * @param {ResolvedDensaProjectMetadata | undefined} metadata
 * @returns {DensaProjectMetadata | null}
 */
function fallbackMetadata(metadata) {
  if (!metadata) return null;
  return {
    schemaVersion: 1,
    ...(metadata.displayName ? { displayName: metadata.displayName } : {}),
    ...(metadata.description ? { description: metadata.description } : {}),
    status: metadata.status,
    ...(metadata.sortOrder !== undefined ? { sortOrder: metadata.sortOrder } : {}),
    ...(metadata.category ? { category: metadata.category } : {}),
    ...(metadata.tags ? { tags: metadata.tags } : {}),
    ...(metadata.links ? { links: metadata.links } : {}),
    featured: metadata.featured,
    ...(metadata.featuredTitle ? { featuredTitle: metadata.featuredTitle } : {}),
    ...(metadata.icon ? {
      icon: {
        ...(metadata.icon.darkUrl ? { dark: metadata.icon.darkUrl } : {}),
        ...(metadata.icon.lightUrl ? { light: metadata.icon.lightUrl } : {}),
      },
    } : {}),
  };
}

/**
 * @param {Record<string, any>[]} repositories
 * @param {Map<string, DensaProjectMetadata>=} metadataByRepository
 * @param {Project[]=} fallbackProjects
 * @returns {Project[]}
 */
export function buildProjects(repositories, metadataByRepository = new Map(), fallbackProjects = []) {
  const legacyByName = new Map(fallbackProjects.map((project) => [
    String(project.repository?.fullName ?? "").toLowerCase(), project,
  ]));
  const seen = new Set();
  const projects = [];

  for (const rawRepository of repositories) {
    if (!isEligibleRepository(rawRepository)) continue;

    const repository = mapRepository(rawRepository);
    const identity = repository.fullName.toLowerCase();
    if (seen.has(identity)) throw new Error(`Duplicate repository discovered: ${repository.fullName}`);
    seen.add(identity);

    const legacyMetadata = fallbackMetadata(legacyByName.get(identity)?.metadata);
    const metadata = metadataByRepository.get(repository.fullName)
      ?? metadataByRepository.get(identity)
      ?? legacyMetadata
      ?? { schemaVersion: 1 };
    projects.push(mergeProject(repository, rawRepository, metadata));
  }

  const featuredCount = projects.filter((project) => project.metadata.featured).length;
  if (featuredCount > 1) {
    throw new Error(`Only one project may be featured on the home page; found ${featuredCount}`);
  }

  return sortProjects(projects);
}

/** @param {string | null} header */
function nextPageFromLinkHeader(header) {
  if (!header) return null;
  const link = header.split(",").find((part) => /rel="next"/.test(part));
  return link?.match(/<([^>]+)>/)?.[1] ?? null;
}

/**
 * Fetch all pages of public repositories. GitHub's organization endpoint supplies the
 * repository description, homepage, primary language, topics, dates, and archive state.
 * @param {(input: string, init?: RequestInit) => Promise<Response>} fetchImpl
 */
async function fetchPublicRepositories(fetchImpl) {
  let url = `${GITHUB_API}/orgs/${ORGANIZATION}/repos?type=public&per_page=100&page=1`;
  const repositories = [];

  while (url) {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`GitHub repository discovery returned HTTP ${response.status}`);

    const page = await response.json();
    if (!Array.isArray(page)) throw new Error("GitHub repository discovery returned an invalid response");
    repositories.push(...page);

    const next = nextPageFromLinkHeader(response.headers.get("Link"));
    if (next) {
      url = next;
    } else if (page.length === 100) {
      const nextPage = new URL(url);
      nextPage.searchParams.set("page", String(Number(nextPage.searchParams.get("page") ?? "1") + 1));
      url = nextPage.href;
    } else {
      url = null;
    }
  }

  return repositories;
}

/**
 * Read one optional manifest. A public raw-file 404 means the project uses GitHub defaults.
 * @param {Record<string, any>} repository
 * @param {(input: string, init?: RequestInit) => Promise<Response>} fetchImpl
 */
async function fetchProjectMetadata(repository, fetchImpl) {
  const branch = typeof repository.default_branch === "string" ? repository.default_branch : "main";
  const name = repository.full_name;
  const url = `${RAW_GITHUB}/${name}/${encodeBranch(branch)}/${METADATA_FILE}`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Fetching ${METADATA_FILE} for ${name} returned HTTP ${response.status}`);
  return parseProjectMetadata(await response.text(), name);
}

/**
 * Fetch the optional language breakdown. The repository list's primary language remains
 * available even when this endpoint is rate-limited or temporarily unavailable.
 * @param {Record<string, any>} repository
 * @param {(input: string, init?: RequestInit) => Promise<Response>} fetchImpl
 * @returns {Promise<string[] | null>}
 */
async function fetchRepositoryLanguages(repository, fetchImpl) {
  const url = repository.languages_url
    ?? `${GITHUB_API}/repos/${repository.full_name}/languages`;

  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const byteCounts = await response.json();
    if (!isObject(byteCounts)) return null;

    return Object.entries(byteCounts)
      .filter(([language, bytes]) => language.trim() && Number.isFinite(bytes) && bytes >= 0)
      .sort(([languageA, bytesA], [languageB, bytesB]) => bytesB - bytesA || languageA.localeCompare(languageB))
      .map(([language]) => language);
  } catch {
    return null;
  }
}

/**
 * @param {object} options
 * @param {(input: string, init?: RequestInit) => Promise<Response>} [options.fetchImpl]
 * @param {{version: number, projects: Project[]}} options.fallback
 * @returns {Promise<{source: "github" | "fallback", projects: Project[], warning?: string}>}
 */
export async function generateProjectData({ fetchImpl = fetch, fallback }) {
  if (!fallback || fallback.version !== 1 || !Array.isArray(fallback.projects)) {
    throw new Error("Project fallback must contain version 1 and a projects array");
  }

  try {
    const repositories = await fetchPublicRepositories(fetchImpl);
    const eligibleRepositories = repositories.filter(isEligibleRepository);
    const metadataByRepository = new Map();

    const enrichedRepositories = await Promise.all(eligibleRepositories.map(async (repository) => {
      const [metadata, languages] = await Promise.all([
        fetchProjectMetadata(repository, fetchImpl),
        fetchRepositoryLanguages(repository, fetchImpl),
      ]);
      if (metadata) metadataByRepository.set(repository.full_name, metadata);
      return { ...repository, languages };
    }));

    return {
      source: "github",
      projects: buildProjects(enrichedRepositories, metadataByRepository, fallback.projects),
    };
  } catch (error) {
    if (error instanceof ProjectMetadataValidationError) throw error;
    return {
      source: "fallback",
      projects: fallback.projects,
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

async function loadFallback() {
  const fallbackText = await readFile(FALLBACK_FILE, "utf8");
  let fallback;
  try {
    fallback = JSON.parse(fallbackText);
  } catch (error) {
    throw new Error(`Could not parse ${FALLBACK_FILE.pathname}: ${error.message}`);
  }

  if (fallback.version !== 1 || !Array.isArray(fallback.projects)) {
    throw new Error("data/projects.fallback.json must contain version 1 and a projects array");
  }
  return fallback;
}

/** Run the dependency-free data build when invoked from the command line. */
async function runBuild() {
  const fallback = await loadFallback();
  const offline = process.argv.includes("--offline");
  const result = offline
    ? { source: "fallback", projects: fallback.projects }
    : await generateProjectData({ fallback });
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: result.source,
    projects: result.projects,
  };

  await writeFile(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  const warning = result.warning ? `; using fallback (${result.warning})` : "";
  process.stdout.write(`Generated ${result.projects.length} projects from ${result.source}${warning}.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBuild().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
