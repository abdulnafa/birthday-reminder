# Birthday Reminder web app

This is a static web app for GitHub Pages. The page reads birthday entries from the [reminder API](https://birthday-reminder-api-nafa.kypsamar.chatgpt.site). Viewing the list needs no login. Each entry contains a name, month, and day.

## Editing

The owner enters the editing password in **Unlock editing** once per browser tab. The app checks it with `POST /api/unlock` and keeps it in `sessionStorage` for that tab. Unlocking and protected changes send the password only in the `X-Edit-Password` request header. It is never included in a URL or this repository. **Lock editing** clears the tab's saved password.

After unlocking, the owner can add, edit, and remove birthdays directly on the page. No GitHub account or token is needed for daily use. The app does not store a sample birthday as real data.

## Email delivery

The two reminder times are on the birthday's date: **12:01 AM** and **12:00 PM**, both Pakistan time (`Asia/Karachi`). The recipient is `developerabdulnafa@gmail.com`. Keep `emailEnabled` in `config.js` set to `false` until the Gmail scheduler is configured and a live email send is verified.

February 29 birthdays are observed on February 28 in non-leap years. The list uses Pakistan's calendar date for sorting and countdowns.

## Check the browser code

With Node.js installed, run `node --test birthday.test.js api.test.js` from this directory. The app has no build step or runtime package dependencies.
