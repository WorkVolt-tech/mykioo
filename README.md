# MYKIOO

A private, invitation-only, bilingual (English/French) entertainment-membership portal. The site is built with React + Vite, published on Cloudflare Pages, and backed by Supabase.

Production site: https://mykioo.pages.dev/

## Hosting and configuration

- **Frontend:** Cloudflare Pages, Vite; build command `npm run build`, output directory `dist`, root `/`.
- **Database and authentication:** Supabase project `porpqvphytecuidomcgy`.
- **Transactional email:** Supabase Auth uses Gmail custom SMTP; MYKIOO Edge Functions call the private `mykioo-email-dispatch` Gmail SMTP service for invitations, membership notices, orders, credentials, declines and reminders. Outlook fallback is not yet configured.
- **Owner alerts:** `mykioo-telegram-owner` Edge Function; protected owner-only chat destination and scheduled checks.
- **Provider integration:** MYKIOO's reseller-panel API is used for supported automated trial creation. Keep panel API tokens server-side.

The only frontend build variables are `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never put `service_role`, Gmail SMTP app passwords, Telegram bot tokens, panel API credentials or account passwords into a `VITE_` variable or commit them to GitHub.

## Accounts and permissions

1. The owner sends an invitation, or an approved member requests an invitation for someone else.
2. A recipient uses their private link to set up an account. The owner then approves membership before the member dashboard is available.
3. Owners and approved members sign in through the same login page, but have separate dashboards and separate database permissions.
4. Client reads are restricted using Supabase Row Level Security (RLS). Owner-only financial, support and administrative records must never be authorized solely by hiding frontend controls.
5. Service credentials are encrypted server-side and are not readable directly through the browser API. Sensitive operations use authenticated Edge Functions.
6. Frontend login and invitation-renewal forms include a honeypot. Honeypots are only a supplementary anti-spam measure; rate limits and optional Supabase Auth CAPTCHA/Cloudflare Turnstile should also be configured.

**Shared database caution:** Supabase Auth is also used by other applications. Do not globally disable sign-ups, change unrelated users, alter shared public RPCs, or modify shared Auth configuration without assessing those applications.

## Password recovery and account security

- Select **Forgot password** on the login page and request a reset for the account's email address.
- Recovery emails use Supabase Auth and redirect to `https://mykioo.pages.dev/?reset_password=1`. The link must be allowlisted in the Supabase Auth redirect URL configuration.
- A valid recovery session opens the bilingual **Create a new password** form. After saving, the user is signed out and can sign in with the new password.
- A signed-in owner or member can select **Change password** under account security. The current password is reauthenticated before `updateUser({password})` is called.
- For a complete real-world test, check inbox/spam delivery, the exact reset URL, one-time link consumption, and sign-in with the new password on **one controlled member test account and the owner account**. Do not reset other members' credentials as part of QA.
- In Supabase **Authentication → Settings**, enable leaked-password protection, consider MFA for owner accounts, check OTP/link expiry, SMTP settings and rate limits, and configure Cloudflare Turnstile for auth abuse protection if desired. Turning on Auth CAPTCHA also requires passing the CAPTCHA token from the frontend; do not enable it without implementing and testing that UI.

## Subscription, payment and email flows

- A member requests a trial, a new paid subscription, or a renewal.
- The owner reviews the request and verifies payment before completing or activating a paid service.
- Successful completed subscriptions and renewals are queued in `mykioo_completion_email_log`; `mykioo-completion-emails` processes that queue on the existing schedule.
- Credential-delivery emails are handled in `mykioo-subscriptions`, using the member's preferred language and the internal Gmail dispatcher. Their credentials must not appear in logs or Telegram alerts.
- Expiry reminders are handled by `mykioo-expiry-reminders`; payment reminders use `mykioo-payment-reminders`.
- A successful Gmail SMTP response means Gmail accepted a send request; it **does not prove inbox delivery**. Check inbox and spam with a controlled test recipient. Do not trigger real member emails during QA.

## Gmail transactional email configuration

- In **Supabase → Authentication → Emails → SMTP Settings**, Gmail custom SMTP is configured for Auth emails (e.g., password recovery) using `mykiootv@gmail.com`. These credentials are **not** shared with Edge Functions.
- In **Supabase → Edge Functions → Secrets**, add secret **`MYKIOO_SMTP_APP_PASSWORD`** containing a Gmail app password for `mykiootv@gmail.com`. Paste the value only in Supabase's private dashboard, not into chat, GitHub or Cloudflare Pages.
- The private `mykioo-email-dispatch` Edge Function authenticates **server-to-server** requests with the built-in `SUPABASE_SERVICE_ROLE_KEY`, uses Gmail TLS on port 465, validates recipients and messages, and never exposes its SMTP secret in client code.
- It supports MYKIOO's previous transactional payload format, including bilingual membership status templates, so backend functions no longer call Brevo.
- If Gmail is unavailable or this secret is missing, normal notifications fail safely; **invitation approval and resends fall back to a private 48-hour link** that the owner may copy and deliver manually. Do not mistake generated links for emails actually delivered.
- Keep the bilingual website email-outage banner visible until Gmail delivery is tested and inbox placement is considered satisfactory. Outlook is not yet an automatic backup.
- Verify a controlled membership-invitation test, membership status email, subscription completion email, expiring subscription reminder and password reset. Do not test by sending credentials to unrelated recipients.
- Gmail personal accounts have daily sending limits and may place messages in spam; this integration does not guarantee deliverability.

## Cancellation and refunds

Voluntary cancellation requests are reviewed by the owner and must be approved before the service has been completed or activated. MYKIOO does not offer voluntary cancellation or refunds after activation, **except where required by applicable law**. Statutory cancellation, consumer-protection and refund rights are not waived by the application's normal order workflow. Customers who believe such rights apply should contact support for individual review.

This policy should be reviewed for the customer's jurisdiction and the applicable service category before public launch; in Quebec, consumer distance-contract and civil-law rights may apply. The website policy wording is not legal advice.

## Owner and mobile review checklist

- **Owner:** Overview, members, invitations, subscription queue, new/renewal request, billing, support tickets, FAQs, guides, notifications, security.
- **Mobile:** Menu label is visible; drawer can be closed; header icons don't overlap the page title; tables scroll horizontally without making the entire page unusable; forms show labels, validation feedback and clear submit confirmation.
- **Email:** Review English and French copies separately and confirm sender, subject, activation/renewal dates, secure links, reminders and support-ticket outcomes.
- **Permissions:** Test with an approved member account that other members' orders/invoices and all owner-only records remain inaccessible.
- **Recovery:** Test owner and member emails, single-use reset links, current-password verification and new-password sign-in in a controlled session.

Visual confirmation requires a real mobile browser and owner session; static code review cannot establish that all controls are reachable on every device.

## Local development

```sh
npm install
npm run dev
npm run build
```

No terminal is needed to manage MYKIOO in GitHub's browser interface or Cloudflare Pages. Always review the latest branch before changing files and avoid unrelated changes.
