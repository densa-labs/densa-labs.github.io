# GitHub Project Discovery Implementation Plan

**Goal:** Make public Densa Labs repositories the source of project discovery while keeping project-specific editorial metadata with each project repository.

**Architecture:** Keep the current static GitHub Pages site. A dependency-free Node build script fetches public organization repositories and optional root `densa.project.json` files, merges GitHub and Densa metadata into a generated static JSON file, then the existing home and All Projects pages render that file. A checked-in generated snapshot preserves the current project experience when GitHub is temporarily unavailable and bridges the local metadata migration until those repository files are published.

**Tech Stack:** HTML, CSS, browser JavaScript, Node.js 24 built-ins, GitHub REST API and raw public repository files.

**Spec:** User request in this task; this plan records its implementation decisions and acceptance checks.

## Current architecture

- The site is plain HTML, CSS, and JavaScript. `.github/workflows/deploy.yml` uploads the repository root to GitHub Pages without a build step.
- `projects/index.html` manually contains four project rows. `scripts/js-projects.js` sorts and filters those existing DOM rows by hand-authored order and status.
- `index.html` separately hardcodes the Benchmark Registry featured card, description, repository link, website link, and two theme-specific logo files.
- The four rows map to `app-densa-ade`, `research-ets2-adaptive-eta`, `ets2-better-eta`, and `benchmark-registry`. No individual project pages or separate project schema exist.

## Problems

- GitHub is already the source of each row's repository link, but project existence and repository facts are copied into website HTML.
- Editorial descriptions, three statuses, ordering, and the featured card live in separate markup. Adding a project requires editing the website by hand.
- There is no build-time validation or failure fallback for project data.

## Proposed architecture and data flow

1. On each website `main` push, manual run, and six-hour scheduled scan, Node requests every page of `GET /orgs/densa-labs/repos?type=public&per_page=100` and reads repository metadata from that response. It optionally reads each included repo's language breakdown from its GitHub `languages_url`.
2. Every qualifying repository is included by default. Exclude only `.github`, `densa-labs.github.io`, forks, templates, and repositories with the explicit `densa-exclude` topic. Private repositories are excluded by requesting `type=public`.
3. For each included repository, request `densa.project.json` from its default branch on `raw.githubusercontent.com`. A 404 means no Densa override; other fetch failures use the checked-in snapshot. Invalid present metadata fails validation with the repository and field identified.
4. Merge GitHub repository facts with optional Densa metadata. Derived facts include repository name/URL, GitHub description and homepage, primary language and optional language breakdown, topics, dates, visibility, fork/template flags, and archived state. Editorial overrides include display name, description, status, sort order, category, tags, additional links, featured behavior, featured title, and optional theme-specific image paths. No source URL or language is required in the manifest.
5. Write the merged `Project[]` to `/data/projects.json` in the deployment workspace. The browser fetches only this same-origin static file; no visitor calls GitHub and no token is shipped to the browser.
6. If GitHub cannot be reached, write the checked-in `data/projects.fallback.json` snapshot instead. The website still deploys and continues to show the migrated projects. A normal successful build uses live GitHub repository discovery.

## Project model and status rules

- JSDoc types distinguish `GitHubRepositoryData`, optional `DensaProjectMetadata`, and the merged `Project` consumed by both pages. `Project` keeps discovered repository facts under `repository` and editorial fields under `metadata`; display defaults are derived by the page. The build script validates metadata without an extra dependency.
- Status remains editorial: `in-development`, `paused`, or `abandoned`. Missing status defaults to `in-development`; commit age is never used to infer it.
- GitHub `archived` remains an independent boolean and may show an “Archived on GitHub” marker. It never changes editorial status.
- GitHub dates and primary language/topics are discovered automatically. Optional Densa fields stay absent/null when not provided.
- Existing explicit order values keep the current row order. Unordered new repositories sort by GitHub creation date, with repository name as a deterministic tie-breaker.
- Project slugs and repository links derive from the GitHub repository name and URL. The research repo receives a `displayName` override to preserve its existing `ets2-adaptive-eta` row title. There are no internal project routes to migrate.

## Migration inventory

| Repository | Existing title | Status | Description | Order / special presentation |
| --- | --- | --- | --- | --- |
| `app-densa-ade` | `app-densa-ade` | Paused | Agentic development environment for planning, executing, and validating AI-assisted software projects. | 1 |
| `research-ets2-adaptive-eta` | `ets2-adaptive-eta` | Abandoned | This repository was an older, complex version of Better ETA. It now serves as a research repository for development purposes. | 2 |
| `ets2-better-eta` | `ets2-better-eta` | Paused | Better ETA is an unreleased mod for Euro Truck Simulator 2 that improves the Route Advisor's ETA by tuning the assumptions the game uses to calculate travel time. | 3 |
| `benchmark-registry` | `benchmark-registry` | In development | Benchmark Registry puts your favorite models and their benchmark results in one place. | 4; featured on home as “Benchmark Registry”; preserve `https://www.benchmarkregistry.org/` and both existing theme logos |

The local metadata files will be added to those four project checkouts. The Benchmark Registry logo paths will point to the identical assets already present in that repository. Since the task prohibits pushes, the checked-in fallback snapshot also carries the existing editorial values until the local project metadata is published and visible to the Pages build.

## Status of other repository kinds

- Archived repositories remain eligible and display GitHub archive state separately.
- Research and tooling repositories remain eligible by default; their editorial status/category is supplied by `densa.project.json` when needed.
- Forks and template repositories are excluded by repository facts, not name parsing.
- An intentional `densa-exclude` topic provides a small opt-out for public non-project infrastructure without requiring an include registry.

## Files and repositories to change

Website repository:

- Add `scripts/project-data.mjs` for repository discovery, manifest validation/merge, duplicate detection, and fallback generation.
- Add `tests/project-data.test.mjs` using Node's built-in test runner.
- Add `package.json` with dependency-free build/test scripts and `data/.gitignore` for the generated output.
- Add `data/projects.fallback.json` as a generated last-resort migration snapshot; never use it as the repository discovery source.
- Update `index.html` and `scripts/js-main.js` to render the featured project from generated data.
- Update `projects/index.html`, `scripts/js-projects.js`, and `css/styles-projects.css` to render discovered projects while preserving current sorting, filters, badges, and responsive table design.
- Update `.github/workflows/deploy.yml` to test and build before upload, and scan the organization every six hours so a new repo does not need to trigger a website edit.
- Add `docs/project-discovery.md` documenting the manifest contract, inclusion rules, statuses, local build, and outage behavior.

Project repositories (metadata-only additions):

- `app-densa-ade/densa.project.json`
- `research-ets2-adaptive-eta/densa.project.json`
- `ets2-better-eta/densa.project.json`
- `benchmark-registry/densa.project.json`

No project source files, unrelated user changes, commits, or pushes are part of this migration.

## API, build, and deployment implications

- Node 24 runs only in GitHub Actions/build time; there is no runtime server or new npm dependency.
- GitHub Pages still serves static files. The workflow generates `data/projects.json` before its existing artifact upload.
- Repository discovery uses the public GitHub API without authentication. One paginated organization request reads repository metadata; raw public manifest requests do not expose credentials. No deployment secret or environment variable is required.
- A failed API/raw fetch selects the checked-in snapshot and leaves deployment usable. A malformed repository manifest reports an actionable validation error instead of being silently ignored.

## Validation plan

1. Add unit tests first for inclusion/exclusion, automatic defaults, rich metadata merge, archived/status separation, duplicate detection, invalid manifests, and API-failure snapshot fallback; verify those tests fail before implementation and pass after.
2. Run the build in offline mode to validate the snapshot and produce `data/projects.json`.
3. Run a mocked build-fetch test to verify discovery of a new ordinary repository with no website registration and graceful absence of its manifest.
4. Inspect generated records for all four existing projects, unchanged descriptions/status/order/links/images, and exclusions for `.github` and `densa-labs.github.io`.
5. Run the production build, all Node tests, and JavaScript syntax checks; inspect the final diff and search for client-visible credentials or duplicate projects.

## Implementation tasks

1. Implement and test the typed project-data builder, metadata validation, discovery filters, and fallback snapshot handling.
2. Add the four repository-local metadata files while preserving any pre-existing dirty files in the Benchmark Registry checkout.
3. Replace hardcoded project records on both pages with generated-data rendering and keep current presentation and filtering behavior.
4. Add the build/deploy integration and operator documentation; run all listed validation and inspect the diff.

## Plan review

- Every requested discovery, migration, status, fallback, security, and verification requirement maps to an implementation task above.
- The merged model field names will be `slug`, `repository`, and `metadata`; the metadata object keeps optional editorial overrides and a default editorial status. Description/name display falls back to GitHub values without copying them into the manifest.
- The snapshot is only a resilient migration fallback; repository discovery remains the organization API response, and repo-local metadata takes precedence whenever published.
- New repositories without a manifest use their GitHub description or a neutral “No description provided yet.” fallback, status `in-development`, their GitHub facts, and no featured/icon metadata.
