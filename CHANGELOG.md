# Changelog

All notable changes to `kempo-smtp` are documented in this file.

## [Unreleased]

### Added

- **Reply-To.** An email that has a reply-to (kempo releases after 4.9.12 have `sendEmail({ replyTo })`, which kempo-forms sets to the visitor's address) is sent with that Reply-To header. Older kempo gives no reply-to, so nothing changes there.
- **The mailbox is the sender until the site sets its own.** When the Email from setting is still the placeholder, mail goes out as the mailbox kempo-smtp signs in with, which is what SMTP servers accept. A sender the site chose is used as it is.
- **A refused sender is explained:** the log says which sender address the server refused and to set Email from on the System tab to the mailbox address or an alias.
- **With no host saved it answers that it was skipped,** so kempo does not count it as a try or let its "not set up" hide the real reason another sender failed.

- **Sends kempo's emails through any SMTP server,** as an `email:send` handler: a Hostinger or Google Workspace mailbox, Amazon SES, Mailgun, a mail server of your own. Uses nodemailer. The answer (sent with the message id, or the reason it was not) is recorded in kempo's email log.
- **An SMTP tab on the Settings page:** host, port, secure from the start, user, and the password as an encrypted `secret` setting.
- **Plain-text version** of every email, made from its HTML, sent beside it.
- **Failures in plain words** (server not found, nothing listening, wrong username or password, address refused with the server's reason, could not connect), and a 20 second connection timeout.
