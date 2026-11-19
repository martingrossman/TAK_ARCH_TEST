# TAK_ARCH_TEST

A small, independent architecture lab for Google Sheets + Google Apps Script.
There is no production TAK code, dependency, configuration, or remote here.
Plain JavaScript keeps the examples readable: no compiler, bundler, runtime npm
dependencies, or test framework. Node's built-in test runner handles local checks.
Google executes the actual Apps Script; Node only checks and tests it with mocks.

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
Set-Location 'C:\Users\martin\Documents\GitHub\TAK_ARCH_TEST'
npm.cmd ci --ignore-scripts
npm.cmd run verify
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
npm.cmd run setup -- bound YOUR_NEW_SCRIPT_ID
Push-Location examples/bound
npx.cmd --yes @google/clasp@3.4.1 show-file-status
npx.cmd --yes @google/clasp@3.4.1 push --force
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
npm.cmd run setup -- central YOUR_NEW_SCRIPT_ID
Push-Location examples/central
npx.cmd --yes @google/clasp@3.4.1 show-file-status
npx.cmd --yes @google/clasp@3.4.1 push --force
Pop-Location
```

4. In the central project's **Project Settings > Script Properties**, add:
   - Property: `TARGET_SPREADSHEET_ID`
   - Value: the ID between `/d/` and `/edit` in your new spreadsheet's URL.
5. Refresh the script editor, select `helloWorld`, click **Run**, and authorize it.
   The executing Google user must have edit access to that sheet.

Script Properties are remote settings; clasp does not upload them with source.
First-run runtime consent is separate from clasp login. There is no web app,
public endpoint, installable trigger, or API executable in this lab. Running the
editor/menu uses the current uploaded source (HEAD), so a versioned deployment is
unnecessary. `clasp run-function` needs additional API-executable setup and is not
part of this quick start.

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
npm.cmd run provision -- bound YOUR_NEW_SPREADSHEET_ID
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
$env:GOOGLE_ACCESS_TOKEN = Read-Host 'Paste short-lived access token' -MaskInput
try {
  npm.cmd run provision -- bound YOUR_NEW_SPREADSHEET_ID --apply
  # Or: npm.cmd run provision -- central --apply
} finally {
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

The local repo starts on `main` with an initial commit. No GitHub repository or
remote is created automatically. When ready, create an **empty private** repository
on GitHub (without generated README/license/gitignore), then:

```powershell
git remote add origin https://github.com/YOUR_ACCOUNT/TAK_ARCH_TEST.git
git push -u origin main
```

GitHub authentication is needed for that push. `.github/workflows/ci.yml` checks
syntax, manifests and mock-based tests on Windows and Linux for pushes and pull
requests. It uses Node 24 and needs no Google secrets.

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
