# Birthday Reminder web app

This is a static GitHub Pages app. It reads open GitHub Issues labeled `birthday` from the repository in `config.js`. Each issue title is the person's name, and its body contains one line such as `Birthday: 02-29`. Names and dates are public because the repository is public.

## One-time GitHub connection

The owner opens **Connect GitHub** in the app and creates a fine-grained personal access token. On GitHub, choose **Only select repositories**, select **birthday-reminder**, and grant **Issues: Read and write**. Paste the token into the app once. The token stays in that browser's local storage; it is never placed in the site's source, a URL, this repository, or chat. The app can remove it with **Manage GitHub → Remove saved token**.

After connection, the owner can add, edit, and remove birthdays directly in the app. Removing one closes its GitHub Issue. The app still shows public birthdays without a token. `github.js` contains the GitHub data adapter, so authenticated writes can be moved to a hosted API later without rebuilding the interface.

## Email delivery

The UI shows the confirmed reminder times on the birthday's date: **12:01 AM** and **12:00 PM**, both Pakistan time (`Asia/Karachi`). The recipient is `developerabdulnafa@gmail.com`. Keep `emailEnabled` in `config.js` set to `false` until the Gmail scheduler has been configured and a live email send has been verified.

February 29 birthdays are observed on February 28 in non-leap years. The list uses Pakistan's calendar date for sorting and countdowns.

## Check the browser code

With Node.js installed, run `node --test birthday.test.js github.test.js` from this directory. The app has no build step or runtime package dependencies.
