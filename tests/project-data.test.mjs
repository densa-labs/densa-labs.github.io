import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectData = await import("../scripts/project-data.mjs").catch(() => ({}));

const requireFunction = (name) => {
  assert.equal(typeof projectData[name], "function", `${name} should be exported`);
  return projectData[name];
};

const repository = (overrides = {}) => ({
  name: "new-tool",
  full_name: "densa-labs/new-tool",
  html_url: "https://github.com/densa-labs/new-tool",
  description: "A new public Densa Labs project.",
  homepage: "",
  language: "JavaScript",
  topics: ["developer-tools"],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  archived: false,
  fork: false,
  private: false,
  visibility: "public",
  is_template: false,
  languages_url: "https://api.github.com/repos/densa-labs/new-tool/languages",
  owner: { login: "densa-labs" },
  default_branch: "main",
  ...overrides,
});

test("a new public organization repository becomes a project with GitHub defaults", () => {
  const buildProjects = requireFunction("buildProjects");
  const [project] = buildProjects([repository({ languages: ["JavaScript", "CSS"] })], new Map());

  assert.equal(project.slug, "new-tool");
  assert.equal(project.metadata.displayName, undefined);
  assert.equal(project.repository.name, "new-tool");
  assert.equal(project.repository.description, "A new public Densa Labs project.");
  assert.equal(project.metadata.status, "in-development");
  assert.equal(project.metadata.featured, false);
  assert.equal(project.repository.url, "https://github.com/densa-labs/new-tool");
  assert.equal(project.repository.primaryLanguage, "JavaScript");
  assert.deepEqual(project.repository.languages, ["JavaScript", "CSS"]);
  assert.deepEqual(project.repository.topics, ["developer-tools"]);
});

test("repository discovery excludes infrastructure, forks, templates, and private repositories but retains archived repositories", () => {
  const isEligibleRepository = requireFunction("isEligibleRepository");

  assert.equal(isEligibleRepository(repository({ name: ".github", full_name: "densa-labs/.github" })), false);
  assert.equal(isEligibleRepository(repository({ name: "densa-labs.github.io" })), false);
  assert.equal(isEligibleRepository(repository({ fork: true })), false);
  assert.equal(isEligibleRepository(repository({ is_template: true })), false);
  assert.equal(isEligibleRepository(repository({ private: true, visibility: "private" })), false);
  assert.equal(isEligibleRepository(repository({ topics: ["densa-exclude"] })), false);
  assert.equal(isEligibleRepository(repository({ archived: true })), true);
});

test("optional metadata overrides editorial fields and keeps GitHub archived state separate from status", () => {
  const parseProjectMetadata = requireFunction("parseProjectMetadata");
  const buildProjects = requireFunction("buildProjects");
  const metadata = parseProjectMetadata(JSON.stringify({
    schemaVersion: 1,
    description: "Editorial description.",
    status: "abandoned",
    sortOrder: 2,
    category: "Research",
    tags: ["eta", "research"],
    links: [{ type: "docs", label: "Research notes", url: "https://example.org/notes" }],
    featured: true,
    featuredTitle: "Adaptive ETA",
    icon: { dark: "assets/logo-white.png", light: "assets/logo-dark.png" },
  }), "densa-labs/new-tool");
  const [project] = buildProjects([repository({ archived: true })], new Map([
    ["densa-labs/new-tool", metadata],
  ]));

  assert.equal(project.metadata.description, "Editorial description.");
  assert.equal(project.metadata.status, "abandoned");
  assert.equal(project.metadata.sortOrder, 2);
  assert.equal(project.metadata.category, "Research");
  assert.deepEqual(project.metadata.tags, ["eta", "research"]);
  assert.deepEqual(project.metadata.links, [{ type: "docs", label: "Research notes", url: "https://example.org/notes" }]);
  assert.equal(project.metadata.featured, true);
  assert.equal(project.metadata.featuredTitle, "Adaptive ETA");
  assert.equal(project.metadata.icon.darkUrl, "https://raw.githubusercontent.com/densa-labs/new-tool/main/assets/logo-white.png");
  assert.equal(project.repository.archived, true);
});

test("missing description and manifest fields fall back to GitHub facts without inventing editorial status", () => {
  const parseProjectMetadata = requireFunction("parseProjectMetadata");
  const buildProjects = requireFunction("buildProjects");
  const metadata = parseProjectMetadata('{"schemaVersion":1}', "densa-labs/new-tool");
  const [project] = buildProjects([repository({ description: null, homepage: "https://example.org" })], new Map([
    ["densa-labs/new-tool", metadata],
  ]));

  assert.equal(project.repository.description, null);
  assert.equal(project.metadata.description, undefined);
  assert.equal(project.metadata.status, "in-development");
  assert.equal(project.repository.homepageUrl, "https://example.org/");
  assert.equal(project.metadata.icon.darkUrl, null);
});

test("malformed metadata reports the repository and invalid field", () => {
  const parseProjectMetadata = requireFunction("parseProjectMetadata");

  assert.throws(
    () => parseProjectMetadata(JSON.stringify({ schemaVersion: 1, status: "stale" }), "densa-labs/new-tool"),
    /densa-labs\/new-tool.*status/i,
  );
});

test("duplicate repositories are rejected instead of rendering duplicate projects", () => {
  const buildProjects = requireFunction("buildProjects");

  assert.throws(
    () => buildProjects([repository(), repository()], new Map()),
    /duplicate.*densa-labs\/new-tool/i,
  );
});

test("GitHub API failure returns the checked-in project snapshot", async () => {
  const generateProjectData = requireFunction("generateProjectData");
  const fallback = {
    version: 1,
    projects: [{ slug: "old-project", repository: { fullName: "densa-labs/old-project" } }],
  };
  const result = await generateProjectData({
    fetchImpl: async () => { throw new Error("temporary network failure"); },
    fallback,
  });

  assert.equal(result.source, "fallback");
  assert.deepEqual(result.projects, fallback.projects);
});

test("GitHub data without a published manifest retains matching migration metadata", () => {
  const buildProjects = requireFunction("buildProjects");
  const fallbackProject = {
    repository: { fullName: "densa-labs/new-tool" },
    metadata: {
      schemaVersion: 1,
      description: "Existing editorial copy.",
      status: "paused",
      sortOrder: 4,
      featured: true,
      featuredTitle: "Existing Title",
      icon: { darkUrl: "/assets/existing-logo.png", lightUrl: null },
    },
  };
  const [project] = buildProjects([repository()], new Map(), [fallbackProject]);

  assert.equal(project.metadata.description, "Existing editorial copy.");
  assert.equal(project.metadata.status, "paused");
  assert.equal(project.metadata.sortOrder, 4);
  assert.equal(project.metadata.featuredTitle, "Existing Title");
  assert.equal(project.metadata.icon.darkUrl, "/assets/existing-logo.png");
});

test("migration snapshot preserves every existing project detail and excludes infrastructure", async () => {
  const fallback = JSON.parse(await readFile(new URL("../data/projects.fallback.json", import.meta.url), "utf8"));
  const byRepository = new Map(fallback.projects.map((project) => [project.repository.fullName, project]));

  assert.equal(fallback.projects.length, 4);
  assert.equal(byRepository.has("densa-labs/.github"), false);
  assert.equal(byRepository.has("densa-labs/densa-labs.github.io"), false);
  assert.equal(byRepository.get("densa-labs/app-densa-ade").metadata.status, "paused");
  assert.equal(byRepository.get("densa-labs/app-densa-ade").metadata.sortOrder, 1);
  assert.equal(byRepository.get("densa-labs/app-densa-ade").metadata.description, "Agentic development environment for planning, executing, and validating AI-assisted software projects.");
  assert.equal(byRepository.get("densa-labs/research-ets2-adaptive-eta").metadata.displayName, "ets2-adaptive-eta");
  assert.equal(byRepository.get("densa-labs/research-ets2-adaptive-eta").slug, "research-ets2-adaptive-eta");
  assert.equal(byRepository.get("densa-labs/research-ets2-adaptive-eta").metadata.status, "abandoned");
  assert.equal(byRepository.get("densa-labs/research-ets2-adaptive-eta").metadata.sortOrder, 2);
  assert.equal(byRepository.get("densa-labs/research-ets2-adaptive-eta").metadata.description, "This repository was an older, complex version of Better ETA. It now serves as a research repository for development purposes.");
  assert.equal(byRepository.get("densa-labs/ets2-better-eta").metadata.status, "paused");
  assert.equal(byRepository.get("densa-labs/ets2-better-eta").metadata.sortOrder, 3);
  assert.equal(byRepository.get("densa-labs/ets2-better-eta").metadata.description, "Better ETA is an unreleased mod for Euro Truck Simulator 2 that improves the Route Advisor's ETA by tuning the assumptions the game uses to calculate travel time.");
  assert.equal(byRepository.get("densa-labs/benchmark-registry").metadata.status, "in-development");
  assert.equal(byRepository.get("densa-labs/benchmark-registry").metadata.sortOrder, 4);
  assert.equal(byRepository.get("densa-labs/benchmark-registry").metadata.description, "Benchmark Registry puts your favorite models and their benchmark results in one place.");
  assert.equal(byRepository.get("densa-labs/benchmark-registry").metadata.featured, true);
  assert.equal(byRepository.get("densa-labs/benchmark-registry").metadata.featuredTitle, "Benchmark Registry");
  assert.deepEqual(byRepository.get("densa-labs/benchmark-registry").metadata.links, [{
    type: "website",
    label: "Live website",
    url: "https://www.benchmarkregistry.org/",
  }]);
  assert.equal(byRepository.get("densa-labs/benchmark-registry").metadata.icon.darkUrl, "/assets/Benchmark-Registry-Logo-Full-White.png");
  assert.equal(byRepository.get("densa-labs/benchmark-registry").metadata.icon.lightUrl, "/assets/Benchmark-Registry-Logo-Full-Dark.png");
});

test("a custom website link is not duplicated when GitHub already supplies the same homepage", () => {
  const parseProjectMetadata = requireFunction("parseProjectMetadata");
  const buildProjects = requireFunction("buildProjects");
  const metadata = parseProjectMetadata(JSON.stringify({
    schemaVersion: 1,
    links: [{ type: "website", label: "Live website", url: "https://example.org/" }],
  }), "densa-labs/new-tool");
  const [project] = buildProjects([repository({ homepage: "https://example.org" })], new Map([
    ["densa-labs/new-tool", metadata],
  ]));

  assert.equal(project.repository.homepageUrl, "https://example.org/");
  assert.equal(project.metadata.links, undefined);
});

test("invalid repository metadata fails the build instead of silently using the snapshot", async () => {
  const generateProjectData = requireFunction("generateProjectData");

  await assert.rejects(
    generateProjectData({
      fallback: { version: 1, projects: [] },
      fetchImpl: async (url) => (
        String(url).startsWith("https://api.github.com/")
          ? new Response(JSON.stringify([repository()]), { status: 200 })
          : new Response('{"schemaVersion":1,"status":"stale"}', { status: 200 })
      ),
    }),
    /densa-labs\/new-tool.*status/i,
  );
});

test("a repository without densa.project.json still appears in generated data", async () => {
  const generateProjectData = requireFunction("generateProjectData");
  const calls = [];
  const result = await generateProjectData({
    fallback: { version: 1, projects: [] },
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).startsWith("https://api.github.com/")) {
        return new Response(JSON.stringify([repository()]), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    },
  });

  assert.equal(result.source, "github");
  assert.equal(result.projects.length, 1);
  assert.equal(result.projects[0].slug, "new-tool");
  assert.ok(calls.some((url) => url.includes("densa.project.json")));
});

test("repository discovery follows GitHub pagination links", async () => {
  const generateProjectData = requireFunction("generateProjectData");
  const secondRepository = repository({
    name: "another-tool",
    full_name: "densa-labs/another-tool",
    html_url: "https://github.com/densa-labs/another-tool",
    created_at: "2026-02-01T00:00:00Z",
  });
  const result = await generateProjectData({
    fallback: { version: 1, projects: [] },
    fetchImpl: async (url) => {
      const requestUrl = String(url);
      const page = new URL(requestUrl).searchParams.get("page");
      if (requestUrl.startsWith("https://api.github.com/") && page === "1") {
        return new Response(JSON.stringify([repository()]), {
          status: 200,
          headers: { Link: '<https://api.github.com/orgs/densa-labs/repos?type=public&per_page=100&page=2>; rel="next"' },
        });
      }
      if (requestUrl.startsWith("https://api.github.com/") && page === "2") {
        return new Response(JSON.stringify([secondRepository]), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    },
  });

  assert.equal(result.source, "github");
  assert.deepEqual(result.projects.map((project) => project.slug), ["new-tool", "another-tool"]);
});

test("language endpoint data is included when available and sorted by byte count", async () => {
  const generateProjectData = requireFunction("generateProjectData");
  const result = await generateProjectData({
    fallback: { version: 1, projects: [] },
    fetchImpl: async (url) => {
      const requestUrl = String(url);
      if (requestUrl.startsWith("https://api.github.com/orgs/")) {
        return new Response(JSON.stringify([repository()]), { status: 200 });
      }
      if (requestUrl.endsWith("/languages")) {
        return new Response(JSON.stringify({ JavaScript: 1000, CSS: 500, HTML: 100 }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    },
  });

  assert.deepEqual(result.projects[0].repository.languages, ["JavaScript", "CSS", "HTML"]);
});
