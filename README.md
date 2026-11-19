# TAK_ARCH_TEST

A small, independent architecture lab for Google Sheets + Google Apps Script.
There is no production TAK code, dependency, configuration, or remote here.
Plain JavaScript keeps the examples readable: no compiler, bundler, runtime npm
dependencies, or test framework. Node's built-in test runner handles local checks.
Google executes the actual Apps Script; Node only checks and tests it with mocks.

## File guide

Every runnable JavaScript file begins with a comment describing its purpose.
The files below use formats where inline comments are unsupported or undesirable,
so this guide provides their descriptions instead.

| File or folder | What it does |
|---|---|
| `package.json` | Defines the Node version and local setup, check, test, and provisioning commands. |
| `package-lock.json` | Locks the exact packages used by the local npm installation. |
| `.nvmrc` | Selects Node 24 for Node version managers. |
| `.gitattributes` | Normalizes tracked text to LF line endings. |
| `.gitignore` | Excludes dependencies, credentials, local clasp targets, and generated files from Git. |
| `.github/workflows/ci.yml` | Runs verification on pushes and pull requests. |
| `.github/workflows/deploy.yml` | Manually verifies and uploads one configured sandbox project. |
| `examples/*/appsscript.json` | Declares the Apps Script V8 runtime and the minimum OAuth scopes for that example. |
| `examples/*/.claspignore` | Limits clasp uploads to the example's source and manifest. |
| `docs/architecture-and-updates.md` | Explains script architectures, safe updates, rollout, and rollback. |
| `docs/copy-registration.md` | Explains invitation-protected copy registration. |
| `.obsidian/*.json` | Stores local Obsidian workspace preferences; it does not affect the lab. |

## Command words used in this guide

All command examples are for **Windows PowerShell**. Copy one line at a time and
replace only values written in `ALL_CAPITALS`. Never paste a real Google ID or
token into a public issue, chat, or repository.

| Command or flag | Plain-English meaning |
|---|---|
| `Set-Location folder` | Move into `folder`; it stays your working folder. |
| `Push-Location folder` / `Pop-Location` | Temporarily move into `folder`, then return to where you started. |
| `npm.cmd run NAME` | Run a named project task. The `.cmd` form avoids a common Windows PowerShell restriction. |
| `npx.cmd --yes PACKAGE command` | Temporarily download and run the named tool; `--yes` accepts that temporary download. |
| `show-file-status` | Preview the files clasp would upload. It does not change Google data. |
| `push --force` | Replace the configured Apps Script project's source files. It does not change spreadsheet cells, but it can replace remote script edits. |
| `try { ... } finally { ... }` | Run the cleanup step even when a command in the middle fails. |

## Architecture diagrams and updating users

Read [Architecture and remote updates](docs/architecture-and-updates.md) for four
Mermaid diagrams, a two-user bound-script update example, permissions, rollout,
and rollback. It explains how one Git codebase can update many separate scripts
without using a central runtime. View the Markdown in GitHub or a Markdown
preview that supports Mermaid to see the diagrams rendered.

The existing upload workflow updates one configured script per run. Updating a
whole group of users is described as a future extension, not implemented here.

## Start locally (no Google account needed)

Use Node 24 LTS (see `.nvmrc`) and Git. In Windows PowerShell:

```powershell
# Move PowerShell into this downloaded project folder.
Set-Location 'C:\Users\martin\Documents\GitHub\TAK_ARCH_TEST'
# Download the exact local packages without running package install scripts.
npm.cmd ci --ignore-scripts
# Check source syntax and manifests, then run the automated tests.
npm.cmd run verify
# Preview creation of a central example; this is a dry run and contacts no Google service.
npm.cmd run provision -- central
```

The last command is a dry run: it makes no network calls. `npm.cmd` avoids
PowerShell's script execution-policy issues with `npm.ps1`.

## Compare the architectures

| | A: bound script per sheet | B: central standalone script |
|---|---|---|
| Source | `examples/bound/Code.js` | `examples/central/Code.js` |
| Sheet selection | `getActiveSpreadsheet()` | `openById()` |
| Relationship | Google stores the sheet's ID as the project's `parentId` | No parent; target ID lives in Script Properties |
| UI | Adds a **TAK lab** menu in the parent sheet | Run from the script editor; no sheet menu |
| Update | Upload separately to each script project | Upload once to the central script |
| Scope | Current spreadsheet only | Spreadsheet access, subject to the executing user's permissions |
| Tradeoff | Convenient UI and independent copies; more deployments | One code deployment; explicit target and access management |

Both write a message, architecture name and UTC timestamp to **A1:C2 of a tab
named TAK_ARCH_TEST**. They create the tab if missing and overwrite those six
cells on subsequent runs. Use new, disposable spreadsheets. Do not use production
sheet IDs or production script IDs.

The central example deliberately targets one sheet per invocation. Change its
property to try another sheet. A multi-sheet loop is a later experiment; it would
also need error isolation, access checks, and quota handling.

Binding is Google project metadata, not a setting in `Code.js`. Creating a bound
project creates a new script; it does not rebind an existing standalone script.
`openById()` grants no access by itself and does not bind the script to the sheet.

## First real run: simplest route

### 1. Enable and authenticate clasp

Enable **Google Apps Script API** in [Apps Script user settings](https://script.google.com/home/usersettings).
Then run from the repo root:

```powershell
# Open Google's sign-in flow so clasp can upload to projects you own.
npx.cmd --yes @google/clasp@3.4.1 login
```

This opens Google's sign-in/consent flow and writes credentials to your user
profile's `.clasprc.json`. This repo never reads or copies existing credentials
automatically. clasp is downloaded only when you use it; it is not a project
dependency or required for CI tests. All commands pin the same release, 3.4.1.

### 2. Architecture A: bound to a new Sheet

1. Create a blank Google Sheet named **TAK_ARCH_TEST Bound**.
2. In that sheet choose **Extensions > Apps Script**. Rename the new script
   **TAK_ARCH_TEST bound**.
3. In Apps Script **Project Settings**, copy the **Script ID** (not Spreadsheet ID).
4. Replace the placeholder below with that ID, then run:

```powershell
# Save this particular Apps Script ID locally; the generated file is ignored by Git.
npm.cmd run setup -- bound YOUR_NEW_SCRIPT_ID
# Temporarily enter the folder whose Code.js and manifest will be uploaded.
Push-Location examples/bound
# List the files clasp would upload. This changes nothing remotely.
npx.cmd --yes @google/clasp@3.4.1 show-file-status
# Upload the listed source files. --force permits the sample manifest to replace the default one.
npx.cmd --yes @google/clasp@3.4.1 push --force
# Return to the folder used before Push-Location.
Pop-Location
```

5. Refresh the script editor, select `helloWorld`, click **Run**, and approve the
   requested spreadsheet permission. The tab now shows the greeting.
6. Reload the spreadsheet to see **TAK lab > Write Hello World**.

`--force` permits the sample manifest to replace the default manifest. Uploads
replace remote project source, so point this only at the newly created lab project.
The allowlist in `.claspignore` uploads only `Code.js` and `appsscript.json`.

### 3. Architecture B: central project

1. Create another blank Google Sheet named **TAK_ARCH_TEST Central target**.
2. Create a new standalone project at [Apps Script](https://script.google.com/)
   named **TAK_ARCH_TEST central** and copy its Script ID from Project Settings.
3. From the repo root:

```powershell
# Save this standalone Apps Script ID locally; the generated file is ignored by Git.
npm.cmd run setup -- central YOUR_NEW_SCRIPT_ID
# Temporarily enter the central-example source folder.
Push-Location examples/central
# Confirm the exact files that would be uploaded; this is a read-only check.
npx.cmd --yes @google/clasp@3.4.1 show-file-status
# Upload the central example and allow its manifest to replace the default manifest.
npx.cmd --yes @google/clasp@3.4.1 push --force
# Return to the folder used before Push-Location.
Pop-Location
```

4. In the central project's **Project Settings > Script Properties**, add:
   - Property: `TARGET_SPREADSHEET_ID`
   - Value: the ID between `/d/` and `/edit` in your new spreadsheet's URL.
5. Refresh the script editor, select `helloWorld`, click **Run**, and authorize it.
   The executing Google user must have edit access to that sheet.

Script Properties are remote settings; clasp does not upload them with source.
First-run runtime consent is separate from clasp login. In examples A and B there is no web app,
public endpoint, installable trigger, or API executable in this lab. Running the
editor/menu uses the current uploaded source (HEAD), so a versioned deployment is
unnecessary. `clasp run-function` needs additional API-executable setup and is not
part of this quick start.

## Experiment C: discover copies through registration

[Copy registration](docs/copy-registration.md) adds **TAK lab > Activate this
copy** to a separate bound template. It submits the live Script ID, Spreadsheet
ID and code version to a registry you control. A private registry sheet records
each copy as **Pending review**; 24-hour invitation codes limit enrollment.

The guide includes setup, a Mermaid diagram, a two-copy exercise, and the separate
edit-access check required before updates. The source and mock tests are ready;
Google authorization and manual web app deployment are still required. This
experiment does not automatically share files, grant update access, or upload
releases to users. The existing A/B examples and deployment workflow stay separate.

## Optional API provisioning: automate creating the project

This demonstrates the two operations discussed earlier:

1. `POST https://script.googleapis.com/v1/projects` with `title` and optional
   `parentId` (an existing disposable spreadsheet ID).
2. `PUT https://script.googleapis.com/v1/projects/NEW_SCRIPT_ID/content` with
   `Code` and the `appsscript` manifest.

The helper creates a **new** project and uploads only to the ID returned by Google.
It does not create spreadsheets or change an existing project's binding.
For a bound project, start with a fresh sheet on which you have not already opened
Extensions > Apps Script. Do not combine the manual creation route and API creation
route for the same target.

Preview first (replace the placeholder with a real lab spreadsheet ID):

```powershell
# Show what a new bound project would look like; this does not create it.
npm.cmd run provision -- bound YOUR_NEW_SPREADSHEET_ID
# Show what a new standalone project would look like; this also makes no Google changes.
npm.cmd run provision -- central
```

To apply, supply a short-lived **user OAuth access token** with scope
`https://www.googleapis.com/auth/script.projects`. An API key is insufficient.
Enable the Apps Script API in the OAuth client's Google Cloud project, configure
its consent screen/test users if needed, and enable Apps Script API access in your
user settings. For a one-off token, Google's [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
can request the scope using your own OAuth client; its redirect URI is
`https://developers.google.com/oauthplayground`. Authorize with the same Google
user that can edit the disposable sheet, exchange the code, and use the access
token. Never commit tokens or paste them into a chat.

PowerShell 7 can read it without displaying it or putting it in command history:

```powershell
# Keep the temporary token hidden while you type it; it exists only in this PowerShell window.
$env:GOOGLE_ACCESS_TOKEN = Read-Host 'Paste short-lived access token' -MaskInput
try {
  # Create and upload a new bound project. --apply is the step that changes Google data.
  npm.cmd run provision -- bound YOUR_NEW_SPREADSHEET_ID --apply
  # Alternatively, create and upload a new standalone project instead.
  # npm.cmd run provision -- central --apply
} finally {
  # Remove the temporary token from this PowerShell window when finished.
  Remove-Item Env:GOOGLE_ACCESS_TOKEN -ErrorAction SilentlyContinue
}
```

Provisioning saves an ignored `examples/<architecture>/.clasp.json` before uploading.
It refuses to run if that local target already exists. If the upload fails, use
`clasp push` on the saved target; do not create another project. If creation times
out, inspect the Apps Script dashboard or the sheet before retrying: Google may
have created it despite the lost response. Provisioning is not a transaction and
has no automatic retry or rollback. If saving the local target fails, the error
reports the created Script ID for recovery with `npm run setup`.

Only one local target per architecture is configured at a time. To use another
bound sheet, record the previous Script ID, remove just its local `.clasp.json`,
and configure the new ID. This does not delete any remote script. Separate Git
worktrees/checkouts are another way to keep several experiments configured.

## Git and GitHub Actions

This lab is public at
[martingrossman/TAK_ARCH_TEST](https://github.com/martingrossman/TAK_ARCH_TEST).
Clone it directly to work with the original repository:

```powershell
# Download the public project into a new TAK_ARCH_TEST folder.
git clone https://github.com/martingrossman/TAK_ARCH_TEST.git
# Enter the downloaded folder before running project commands.
Set-Location TAK_ARCH_TEST
```

To contribute changes, use GitHub's **Fork** button to create a fork under your
account, then clone your fork and add the public project as `upstream`:

```powershell
# Download your personal GitHub copy, where you can push changes.
git clone https://github.com/YOUR_ACCOUNT/TAK_ARCH_TEST.git
# Enter the downloaded folder.
Set-Location TAK_ARCH_TEST
# Name the original public repository "upstream" so you can fetch its updates later.
git remote add upstream https://github.com/martingrossman/TAK_ARCH_TEST.git
```

Push branches to your fork and open a pull request against the public project.
GitHub authentication is needed to push to your fork. `.github/workflows/ci.yml`
checks syntax, manifests and mock-based tests on Windows and Linux for pushes and
pull requests. It uses Node 24 and needs no Google secrets.

### Optional manual upload workflow

After publishing the repo, create GitHub environments **bound-lab** and
**central-lab**. In each environment set:

| Setting | Value |
|---|---|
| Environment variable `SCRIPT_ID` | That architecture's new sandbox Script ID |
| Environment secret `CLASPRC_JSON` | Complete clasp login JSON from a dedicated lab Google account |

Use an account with access only to disposable lab data; the login secret grants
that account's authorized clasp access, not just access to one script. Restrict
environment deployment branches to `main` and add required reviewers where your
GitHub plan supports them. Do not put credentials in repository files, variables,
logs, artifacts, or pull requests.

Go to **Actions > Upload to Google sandbox (manual) > Run workflow**, choose
`main`, choose the architecture, and enter **UPLOAD SANDBOX**. The workflow:

1. Runs the same checks/tests.
2. Configures the sandbox Script ID from the chosen environment.
3. Restores credentials temporarily, uploads the source with clasp, then removes
   the temporary credential file even on failure.

This updates HEAD source only. It does not execute `helloWorld`, create targets,
configure Script Properties, grant runtime consent, or publish a web app. An
invalid confirmation or non-main branch skips the upload job. Credentials can
expire or be revoked; reauthenticate and update the environment secret then.

## Small experiments to try

1. Run each version and compare the two greetings and timestamps.
2. Copy the bound spreadsheet. Its script is an independent copy: change the
   original greeting and upload; observe that the copy keeps its old code.
3. Point the central script's property at a third disposable sheet. Run again to
   see the same script serve a different file without another code deployment.
4. Create a bound project through the API and confirm **Extensions > Apps Script**
   opens the project that was created using its spreadsheet `parentId`.
5. Change the greeting, run tests, commit, and use the manual upload workflow.

## Checks and boundaries

`npm run verify` tests real source in a VM with fake Google services: sheet lookup,
tab creation/reuse, written values, menu wiring, missing configuration, permission
errors, target-file protection, and API request/recovery ordering. It also checks
JavaScript syntax and the expected manifest scopes. It cannot validate real Google
consent, API enablement, account permissions, quotas, or the GitHub runner.

The ignore rules cover local target settings, tokens, OAuth client files, common
credential filenames, and dependency directories. They are protection against
accidents, not a secret scanner; review `git diff --cached` before committing.

## Official references

- [Apps Script project creation and parentId](https://developers.google.com/apps-script/api/reference/rest/v1/projects/create)
- [Updating project content replaces the project's files](https://developers.google.com/apps-script/api/how-tos/manage-projects)
- [Bound script context and its limitations](https://developers.google.com/apps-script/guides/bound)
- [Enabling API authorization and access](https://developers.google.com/apps-script/api/how-tos/enable)
- [clasp commands and credentials](https://github.com/google/clasp)

The bound-script guide and clasp documentation differ on creating bound projects
through clasp. This lab uses the unambiguous Sheets UI or documented REST
`projects.create(parentId)` route, and clasp only for login/status/upload.
