# Adding Test Users

This file exists so the test-user process is difficult to miss.

## Google Auth Platform link

https://console.cloud.google.com/auth/audience

## Exact process

1. Ask the student for the exact Google account they will use.
2. Open the Google Auth Platform **Audience** page.
3. Select the correct Google Cloud project.
4. Under **Test users**, click **Add users**.
5. Add the student's exact email address.
6. Save.
7. Run `npm run build`.
8. Send the student a ZIP of the compiled extension folder.
9. Do **not** send any `.pem` file.
10. Student extracts the ZIP.
11. Student opens `chrome://extensions`.
12. Student enables Developer mode.
13. Student clicks **Load unpacked**.
14. Student selects the extracted folder containing `manifest.json`.
15. Student opens the extension and clicks **Connect Google Sheets**.
16. Student selects the Google account you added as a test user.
17. Student opens `https://web.getmarks.app/`.
18. Test one wrong question and verify the Google Sheet is updated.

## Important testing limitation

Google currently documents that Testing-mode OAuth projects are limited to up to 100 listed test users, and test-user authorizations expire after seven days.

Reference:
https://support.google.com/cloud/answer/15549945
