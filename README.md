# kempo-smtp

Sends the emails kempo logs through any SMTP server, using [nodemailer](https://nodemailer.com): the mailbox that comes with your domain (Hostinger), Google Workspace, Amazon SES, Mailgun, Postmark, Brevo, or a mail server of your own. Kempo does not send email itself: it saves every email in its log (**Admin > Emails**) and hands it to an email extension through the `email:send` hook. This is that extension for SMTP.

## Setup

1. Install it from Admin > Extensions.
2. On **Admin > Emails**, open the **SMTP** tab and fill in the server (see below), then **Save settings**. The password is stored encrypted and never shown again.
3. On the **System** tab, set **Email from** to the mailbox address, such as `Your Shop <orders@yourdomain.com>`, if you want a display name. SMTP servers only let you send as the mailbox you sign in with (or its aliases). While Email from is not set (still `noreply@example.com`), kempo-smtp sends as the mailbox you sign in with, so a plain setup works without it.
4. On **Admin > Emails**, press **Send a test email** to check it.

`SETTINGS_ENCRYPTION_KEY` must be set on the server (kempo makes one for you the first time it starts), because the password is stored encrypted.

### Hostinger (the email that comes with a domain)

Create the mailbox in Hostinger's panel (Emails), then use its **SMTP** settings from the mailbox's configuration page. They are normally:

| Setting | Value |
|---|---|
| Host | `smtp.hostinger.com` |
| Port | `465` with **Secure from the start** on (or `587` with it off) |
| User | the full mailbox address, `orders@yourdomain.com` |
| Password | the mailbox password |

The domain's mail (MX) records must point at Hostinger's mail servers, and the SPF and DKIM records Hostinger shows for the mailbox must be in the domain's DNS: if the domain's DNS is at Hostinger this is automatic, otherwise add them where the DNS is. Your website's own A record (to a VPS) does not affect mail. Check the sending limits of your plan: a free mailbox allows only so many emails an hour.

### Other providers

| Provider | Host | Port | User |
|---|---|---|---|
| Google Workspace | `smtp.gmail.com` | 465 | the mailbox, with an app password |
| Amazon SES | `email-smtp.<region>.amazonaws.com` | 465 | the SES SMTP user |
| Mailgun | `smtp.mailgun.org` | 465 | `postmaster@yourdomain` |
| A Postfix on the same server | `localhost` | 25 | none (you manage deliverability yourself) |

## What it does

For each email kempo asks to send, the handler connects to the server, signs in, sends the message with the HTML and a plain-text version made from it (and a Reply-To header, when the email has a reply-to, as kempo-forms sets for a notification), and answers kempo with `{ sent: true, provider: 'smtp', messageId }` or `{ sent: false, error }`. Kempo records the result in the log, tries a failed email again (the **Email max retries** setting, 1 by default), and keeps the log for the retention settings.

Failures are reported in plain words: the server was not found, nothing is listening at host:port, the username or password was refused, the server refused the address (with its own reason), or the connection could not be made (with a hint to check whether it is meant to be secure). Connecting times out after 20 seconds, so a wrong host cannot hold up a request.

**Secure from the start** is for port 465, where the connection is encrypted before anything is said. With it off (port 587) the connection starts plain and upgrades to an encrypted one when the server offers it (nodemailer's default). It does not insist on that, so a server that offers no encryption at all, such as a Postfix on the same machine, still works; for anything across the internet use 465 or a server that offers STARTTLS.

With no host saved the handler answers that it did not send, so if another email extension is installed (kempo-resend), it gets the email instead. The first one to send it ends the chain.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `smtp_host` | — | The address of the SMTP server |
| `smtp_port` | `465` | The port |
| `smtp_secure` | `true` | Secure from the start (465); off for 587 |
| `smtp_user` | — | The username, usually the mailbox address. Empty for a server that needs none |
| `smtp_password` | — | Secret. The password |

## Tests

`npm test` starts a real SMTP server of its own on a free port and sends to it: a delivered message (headers, HTML and text parts, sender and recipient), a wrong password, a refused address, a server that is not there, a server that needs no sign-in, and the plain-text conversion. Nothing leaves the machine.
