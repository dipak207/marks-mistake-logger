# MARKS Mistake Logger

A minimal Chrome extension for students using the MARKS web platform (`https://web.getmarks.app/`).

The extension records **only questions that have been answered incorrectly** and saves them to a Google Sheet owned by the student. If the same question is later answered correctly, the existing row is updated to `Resolved` instead of creating a duplicate.

> **Status:** MVP / testing build. Supports `singleCorrect` and `numerical` question types.
>
> **Important:** This is an independent project and is not an official MARKS / MathonGo product unless explicitly adopted by them.

---

## What the extension does

When a student submits a MARKS question:

- If the answer is **correct** and the question has never been wrong before, nothing is written to Google Sheets.
- If the answer is **wrong**, the extension shows a compact reflection popup asking why the answer was incorrect.
- The student chooses one reason: `Concept`, `Calculation`, `Formula`, `Misread`, `Wrong approach`, `Guess`, or `Other`.
- Choosing `Other` opens a text box and requires a custom explanation before saving.
- The question is created or updated in the student's Google Sheet.
- If a previously wrong question is later answered correctly, its status changes from `Wrong` to `Resolved`.
- If a resolved question becomes wrong again, the same row is updated back to `Wrong`.

The extension uses the MARKS question ID to avoid duplicate rows.

---

## Google Sheet columns

The spreadsheet must use these columns in this exact order:

1. Date
2. Question Link
3. Question
4. Options
5. Why Was It Incorrect
6. Question Status
7. Subject
8. Chapter
9. No. of Times Attempted
10. No. of Times Wrong
11. Accuracy
12. Avg Time
13. Option Marked
14. Correct Answer
15. Explanation
16. Question ID

For `numerical` questions, `Options` remains blank.

---

## Supported question types

Current MVP support:

- `singleCorrect`
- `numerical`

Other MARKS question types should not be assumed or invented. Add support only after confirming the exact type returned by MARKS.

---

## Tech stack

- Chrome Extension Manifest V3
- TypeScript
- Native HTML/CSS for extension UI
- Shadow DOM for the injected mistake popup
- `chrome.storage.local` for lightweight local state
- `chrome.identity` for Google OAuth
- Google Sheets API v4
- OAuth scope: `https://www.googleapis.com/auth/drive.file`
- No backend in the MVP
- No `.env` file required in the MVP

---

## Privacy model

The extension is intended to operate only on `https://web.getmarks.app/*`.

It processes the minimum data needed for the mistake-log feature, including question content, answer options, submitted answer, correct answer, solution, subject/chapter data when MARKS exposes it, attempt statistics, and the student's mistake reason.

The mistake spreadsheet is created in the student's own Google Drive. The MVP does not require a developer-operated backend.

Do **not** add screen recording, unrelated browsing monitoring, password collection, cookies, MARKS session tokens, Google access tokens, or other unrelated personal data to this project.

---

# Local development

## Requirements

- Google Chrome
- Node.js + npm
- A Google Cloud project configured for OAuth testing

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

The compiled extension should be written to:

```text
dist/
```

## Load into Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `dist` folder.
5. Open MARKS Web and test the extension.

---

# Stable extension ID for testing

OAuth for a Chrome extension is tied to the Chrome extension ID. The repository therefore includes a public `"key"` value in `manifest.json` so that unpacked builds use the same development extension ID on different tester laptops.

The manifest `key` is public and can be committed.

The private `.pem` file used to derive that key must **never** be committed or shared.

Recommended `.gitignore` rules are included in this repository.

---

# Google OAuth testing setup

The MVP uses Google OAuth so each student can create/update a spreadsheet in their own Google Drive.

Useful links:

- Create/select Google Cloud project: https://console.cloud.google.com/projectcreate
- Enable Google Sheets API: https://console.cloud.google.com/apis/library/sheets.googleapis.com
- Google Auth Platform overview: https://console.cloud.google.com/auth/overview
- Branding: https://console.cloud.google.com/auth/branding
- Audience / test users: https://console.cloud.google.com/auth/audience
- OAuth scopes / Data Access: https://console.cloud.google.com/auth/scopes
- OAuth clients: https://console.cloud.google.com/auth/clients

Use this scope:

```text
https://www.googleapis.com/auth/drive.file
```

Do not use a client secret in the Chrome extension.

The OAuth Client ID is public configuration and is expected to be present in `manifest.json`.

---

# ADDING A NEW TEST USER — STRICT PROCESS

This is the process to follow every time a new student/tester is added while the Google OAuth app is in **Testing** mode.

## Developer steps

### 1. Ask for the tester's exact Google account

Ask the student which Gmail / Google account they will use when pressing **Connect Google Sheets**.

The account must match the address you add below.

### 2. Open Google Auth Platform → Audience

Direct link:

https://console.cloud.google.com/auth/audience

Make sure the correct Google Cloud project is selected.

### 3. Add the student under Test users

Under **Test users**:

1. Click **Add users**.
2. Enter the student's exact Google account email.
3. Save.

Do not give the student access to the Google Cloud project. Only add them as an OAuth test user.

### 4. Send the tester build

Run:

```bash
npm run build
```

Zip the compiled `dist` folder for the tester.

**Never include:**

- `*.pem`
- Google access tokens
- cookies
- MARKS session IDs
- service-account credentials
- client secrets

### 5. Student installation instructions

Send these exact instructions to the student:

1. Download and extract the extension ZIP.
2. Open Chrome.
3. Go to `chrome://extensions`.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted extension folder containing `manifest.json`.
7. Open the extension popup.
8. Click **Connect Google Sheets**.
9. Select the same Google account that the developer added as a test user.
10. Approve the requested permission.
11. Open `https://web.getmarks.app/` and use MARKS normally.

The extension should create the student's own MARKS mistake spreadsheet in that student's Google Drive.

### 6. Verify

Have the student deliberately test one wrong question and confirm:

```text
Wrong answer
→ mistake-reason popup
→ Save mistake
→ Google Sheet row created/updated
```

Then answer a previously wrong question correctly and confirm:

```text
Question Status: Wrong → Resolved
```

## Testing-mode limitations

Google OAuth projects in Testing mode support up to 100 listed test users. Google currently states that authorizations by test users expire after seven days, so a tester may periodically need to click **Connect Google Sheets** and authorize again.

For more details, see Google's Audience documentation:

https://support.google.com/cloud/answer/15549945

---

# Tester troubleshooting

## `bad client id`

Check all three values:

1. Extension ID shown in `chrome://extensions`.
2. Item ID configured on the Google **Chrome Extension** OAuth client.
3. `oauth2.client_id` in the built `dist/manifest.json`.

The OAuth client must have been created for the exact current extension ID.

Official Chrome OAuth guide:

https://developer.chrome.com/docs/extensions/how-to/integrate/oauth

## Google account cannot authorize

Check:

- OAuth app is still in Testing mode.
- Student email is present under Google Auth Platform → Audience → Test users.
- Student selected exactly that Google account.

Direct link:

https://console.cloud.google.com/auth/audience

## Sheet not updating

Check:

- Google Sheets API is enabled.
- The extension is connected to Google.
- `dist/manifest.json` contains the correct OAuth Client ID.
- The extension is active on `https://web.getmarks.app/*`.
- Reload the extension from `chrome://extensions` after rebuilding.

---

# Future production launch

Do not use the testing setup as the final public distribution setup. The production launch should be done intentionally and separately.

Detailed production instructions are in:

[`docs/PRODUCTION.md`](docs/PRODUCTION.md)

Summary:

1. Create/configure a production Google Cloud project.
2. Enable Google Sheets API.
3. Configure production OAuth branding, audience and `drive.file` scope.
4. Prepare a public homepage and privacy policy on a domain you control.
5. Register as a Chrome Web Store developer.
6. Prepare icons, screenshots and store listing content.
7. Upload a ZIP with `manifest.json` at the ZIP root.
8. Obtain the production Chrome Web Store Item ID.
9. Create a production **Chrome Extension** OAuth client for that exact Item ID.
10. Put the production OAuth Client ID in the production manifest.
11. Rebuild and upload the updated version.
12. Complete Chrome Web Store privacy declarations.
13. Complete Google's OAuth verification requirements.
14. Submit the Chrome Web Store item for review.

---

# Repository safety

Safe to commit:

- Source code
- `package.json`
- `package-lock.json`
- OAuth Client ID
- Manifest public `key`
- Documentation

Never commit:

- `*.pem` private keys
- access tokens
- refresh tokens
- cookies
- captured Authorization headers
- MARKS session tokens / session IDs
- service-account files
- local dumps containing student data

---

# GitHub push

Create a repository at:

https://github.com/new

Recommended repository name:

```text
marks-mistake-logger
```

For the current experimental stage, using a **private repository** is recommended until you are comfortable publishing the source.

From the project folder:

```bash
git init
git add .
git commit -m "Initial MARKS Mistake Logger MVP"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/marks-mistake-logger.git
git push -u origin main
```

Before `git add .`, always confirm that `.gitignore` contains `*.pem`.

You can check what will be committed with:

```bash
git status
```

---

## License

Choose and add a license before making the repository public. Until then, do not assume third parties have permission to reuse the source.
