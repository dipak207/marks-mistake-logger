# Production Launch Guide

This document describes the future public release process for MARKS Mistake Logger.

Links and platform behavior can change; verify the current Google and Chrome documentation before submitting a public release.

---

## 1. Separate production from testing

Google recommends separate Cloud projects for development/testing and production/publishing.

Create a production project:

https://console.cloud.google.com/projectcreate

Recommended name:

```text
MARKS Mistake Logger Production
```

Do not delete the testing project; keep it for development builds.

---

## 2. Enable Google Sheets API

Select the production project and enable:

https://console.cloud.google.com/apis/library/sheets.googleapis.com

---

## 3. Configure Google Auth Platform

### Branding

https://console.cloud.google.com/auth/branding

Provide:

- App name
- User support email
- Developer contact email
- Production homepage URL
- Privacy policy URL
- Logo if desired

### Audience

https://console.cloud.google.com/auth/audience

Configure the intended external production audience.

### Data Access

https://console.cloud.google.com/auth/scopes

Use only:

```text
https://www.googleapis.com/auth/drive.file
```

Google currently classifies `drive.file` as the recommended non-sensitive per-file scope for Sheets integrations.

Official scope documentation:

https://developers.google.com/workspace/sheets/api/scopes

Do not switch to broad `spreadsheets` or `drive` scopes unless the product genuinely requires them.

---

## 4. Prepare public legal/support pages

Before production OAuth / Web Store release, host at minimum:

- Product homepage
- Privacy policy
- Support/contact information

Use a domain you control, especially for Google OAuth verification.

Google verification guidance:

https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification

Policy compliance:

https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance

The privacy policy should accurately explain:

- the extension operates on MARKS Web;
- what question/attempt data is processed;
- Google Sheets access is used only to create/update the user's mistake sheet;
- whether any data is sent to developer servers (MVP: no backend);
- how users can revoke Google access and delete their spreadsheet;
- that unrelated browsing data is not collected.

---

## 5. Production hardening before upload

Before publishing:

- Confirm only `singleCorrect` and `numerical` are intentionally supported.
- Test wrong → save flow.
- Test repeated wrong → same row updates.
- Test wrong → later correct → `Resolved`.
- Test resolved → wrong again → `Wrong`.
- Test `Other` mistake reason requires custom text.
- Test question/options with LaTeX.
- Test numerical questions.
- Test new student Sheet creation.
- Test reinstall/reconnect behavior.
- Verify no cookies/tokens/session IDs are logged.
- Verify extension host permissions are limited to required domains.
- Verify no remote executable code is loaded.
- Add production icons.
- Increase extension version.

---

## 6. Register for Chrome Web Store

Developer dashboard:

https://chrome.google.com/webstore/devconsole

Official registration guide:

https://developer.chrome.com/docs/webstore/register/

Google requires Chrome Web Store developer registration and a one-time registration fee before publishing.

---

## 7. Prepare Web Store package

Official preparation guide:

https://developer.chrome.com/docs/webstore/prepare

Run:

```bash
npm install
npm run build
```

Create a ZIP whose root directly contains:

```text
manifest.json
background/
content/
popup/
...
```

Do not create a ZIP with an extra outer `dist/` directory.

Do not include:

- `.pem`
- source maps you do not intend to distribute
- local test data
- tokens/cookies

---

## 8. Create the Chrome Web Store item

Official publishing guide:

https://developer.chrome.com/docs/webstore/publish/

Dashboard:

https://chrome.google.com/webstore/devconsole

1. Click **Add new item**.
2. Upload the ZIP.
3. Keep it as a draft while production OAuth is finalized.
4. Copy the Chrome Web Store Item ID.

---

## 9. Create production Chrome Extension OAuth client

Google Auth Platform → Clients:

https://console.cloud.google.com/auth/clients

Create a client with:

```text
Application type: Chrome Extension
Item ID: <exact production Chrome Web Store Item ID>
```

Official Chrome OAuth instructions:

https://developer.chrome.com/docs/extensions/how-to/integrate/oauth

Copy the generated production OAuth Client ID.

---

## 10. Update production manifest

Set:

```json
"oauth2": {
  "client_id": "PRODUCTION_CLIENT_ID.apps.googleusercontent.com",
  "scopes": [
    "https://www.googleapis.com/auth/drive.file"
  ]
}
```

The OAuth Client ID is public configuration; do not add a client secret.

Increase the extension version, rebuild and upload the new package to the same Web Store item.

---

## 11. Complete Chrome Web Store listing

Store listing guidance:

https://developer.chrome.com/docs/webstore/cws-dashboard-listing

Prepare:

- Name
- Concise description
- Detailed description
- Category: Education
- Extension icon(s)
- Required screenshots/promotional assets
- Support URL
- Homepage URL
- Privacy policy URL

Do not imply official affiliation with MARKS unless permission/partnership exists.

---

## 12. Complete Chrome Web Store privacy declarations

Privacy practices:

https://developer.chrome.com/docs/webstore/cws-dashboard-privacy

Program policies:

https://developer.chrome.com/docs/webstore/program-policies/policies

Declare the extension's single purpose accurately.

Explain each permission, for example:

- `storage`: lightweight local state/statistics/configuration
- `identity`: Google authorization
- `https://web.getmarks.app/*`: read the MARKS question/attempt information necessary for the mistake logger
- `https://sheets.googleapis.com/*`: create/update the student's mistake spreadsheet

Chrome requires accurate user-data disclosures and a privacy policy for extensions handling user data.

---

## 13. Complete Google OAuth production verification

Google Auth Platform:

https://console.cloud.google.com/auth/overview

Verification guidance:

https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification

Because the extension currently uses the recommended non-sensitive `drive.file` scope, the verification path is lighter than using broad sensitive/restricted Drive scopes, but Google still requires production apps to satisfy its OAuth app verification / branding requirements.

Verify domains and provide the information requested by the Verification Center.

---

## 14. Final release

After OAuth configuration and the Web Store listing/privacy fields are complete:

1. Test the exact production package locally.
2. Submit the Chrome Web Store item for review.
3. Wait for approval.
4. Install the approved Web Store version on a clean Chrome profile.
5. Confirm Google OAuth, Sheet creation and MARKS logging work end to end.
6. Only then direct general users to the Web Store listing.

---

## Updating production later

Every new Web Store package must use a higher extension version.

Official update guide:

https://developer.chrome.com/docs/webstore/update/

Recommended workflow:

```text
feature branch
→ local testing
→ testing OAuth project
→ merge to main
→ bump manifest version
→ npm run build
→ production smoke test
→ upload new ZIP
→ submit update for review
```
