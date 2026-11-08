# Birthday Reminder web app

This is a static web app for GitHub Pages. Birthday entries live in the private
scheduler repository as `data/birthdays.json`. After the owner unlocks with a
GitHub token that can read and write that file, the page can view, add, edit,
and remove birthdays. Each entry contains a name, month, and day.

## Editing

The owner enters a GitHub token in **Unlock editing** once per browser tab. A
fine-grained personal access token with **Contents: Read and write** on
`abdulnafa/birthday-reminder-scheduler` is enough. The app checks it by reading
`data/birthdays.json` through the GitHub Contents API and keeps the token in
`sessionStorage` for that tab only. It makes no birthday list request before
unlocking. **Lock editing** clears the token and visible list. A rejected token
also clears the list and asks the owner to unlock again.

After unlocking, the owner can add, edit, and remove birthdays directly on the
page. Each change commits an update to `data/birthdays.json` in the private
repo. Each birthday stays saved until the owner removes it, and its two
reminders repeat automatically every year. The app does not store a sample
birthday as real data.

## Email delivery

The two reminder times are on the birthday's date: **12:01 AM** and **12:00 PM**,
both Pakistan time (`Asia/Karachi`). The recipient is
`developerabdulnafa@gmail.com`. The GitHub Actions Gmail SMTP test email was
accepted, so `emailEnabled` in `config.js` is set to `true` and the page shows
email delivery as active.

February 29 birthdays are observed on February 28 in non-leap years. The list
uses Pakistan's calendar date for sorting and countdowns.

## Check the browser code

With Node.js installed, run `node --test birthday.test.js api.test.js` from this
directory. The app has no build step or runtime package dependencies.
