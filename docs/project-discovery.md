# Project discovery

Densa Labs project existence comes from the public `densa-labs` GitHub organization. The Pages workflow scans the organization on pushes to this website's `main` branch, on manual workflow dispatch, and every six hours. It builds a same-origin static file at `data/projects.json`; browsers read that file and do not call the GitHub API.

The scan includes every public organization repository by default. It skips the `.github` and `densa-labs.github.io` infrastructure repositories, forks, template repositories, and any public repository tagged with the GitHub topic `densa-exclude`. Private repositories are not requested. Archived repositories, research, experiments, and tools remain eligible.

## Optional repository metadata

A project can add a `densa.project.json` file at its repository root. The file is optional. Without it, the site uses GitHub's repository name, URL, description, homepage, primary language, topics, creation/update dates, visibility, and archive state. The language breakdown is read from GitHub's repository languages endpoint; if that optional endpoint is unavailable, the primary language is still retained. Missing GitHub descriptions display “No description provided yet.” A project without editorial metadata defaults to “In development,” is not featured, and has no icon.

The current schema is version 1. Every file must have `schemaVersion: 1`. All fields except `schemaVersion` are optional:

| Field | Purpose |
| --- | --- |
| `displayName` | Optional title; defaults to the exact GitHub repository name. |
| `description` | Editorial description; overrides the GitHub description. |
| `status` | One of `in-development`, `paused`, or `abandoned`; defaults to `in-development`. |
| `sortOrder` | Optional positive integer for intentional ordering. Repositories without an order follow in creation-date order. |
| `category` | Optional Densa Labs category. |
| `tags` | Optional editorial tags; when omitted, GitHub topics are used. |
| `links` | Optional array of `{ "type", "label", "url" }` entries. Types are `website`, `demo`, `docs`, `download`, or `other`; URLs must use HTTPS. |
| `featured` | Whether the project appears in the home page feature; defaults to `false`. At most one project can be featured. |
| `featuredTitle` | Optional title shown in the home page feature; defaults to `displayName`. |
| `icon` | Optional `dark` and `light` paths relative to the repository root. |

Example:

```json
{
  "schemaVersion": 1,
  "status": "paused",
  "description": "A short project description written for the Densa Labs site.",
  "category": "Developer tools",
  "tags": ["automation", "agents"],
  "links": [
    {
      "type": "website",
      "label": "Live website",
      "url": "https://example.org/"
    }
  ]
}
```

The builder rejects unknown fields, invalid statuses, unsafe icon paths, and malformed links with the repository and field in the error. No repository URL, homepage URL, language, date, or topic needs to be copied into this file.

## Status and GitHub archive state

Status is an editorial decision. The site never infers “Paused” or “Abandoned” from age or commit frequency. GitHub's archived flag is shown separately as “Archived on GitHub” and does not change the editorial status. For example, to mark a project Paused, add or update this in its repository-local file:

```json
"status": "paused"
```

Use `"status": "abandoned"` for an editorial Abandoned decision. Commit and push that file in the project repository. The next website scan reads it automatically.

## Build and outage behavior

This website has no runtime service, database, GitHub browser token, or extra dependency. GitHub Actions runs Node.js 24 and creates `data/projects.json` before uploading the static Pages artifact. Public API discovery is unauthenticated, so no new secret or environment variable is required.

If GitHub cannot be reached, the build uses `data/projects.fallback.json`, a generated migration snapshot of the existing four project records. The Pages workflow can still deploy and render the known projects. On a successful scan, GitHub determines which projects exist, and a published repository manifest takes precedence over the migration snapshot. An invalid present manifest fails with a useful build error instead of silently losing its editorial fields.

To build locally, use Node.js 20 or newer:

```sh
npm test
npm run build
```

Use `npm run build:offline` to create the generated file from the checked-in snapshot without network access. `data/projects.json` is generated output and is ignored by Git.

## Existing metadata migration

The four existing project records now have matching root manifests in their local project checkouts. The Benchmark Registry manifest preserves the live website, home feature, featured title, and both theme-specific logos by referring to the identical logo assets in that repository. The checked-in fallback snapshot preserves the existing display, statuses, descriptions, links, and ordering while those local manifests remain unpublished. No local repository was committed or pushed as part of this migration.
