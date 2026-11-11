# MYKIOO

Private, invitation-only entertainment membership portal. React + Vite on Cloudflare Pages, with the existing Supabase Adult DB project.

## Deployment

Cloudflare Pages: framework **Vite**, build command **npm run build**, output **dist**, root directory **/**.

Set Cloudflare build environment variables:
- `VITE_SUPABASE_URL` = `https://porpqvphytecuidomcgy.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = the project's **publishable** public client key (NOT a service-role or secret key).

Do not commit keys or secrets. The site builds without environment variables but displays a controlled setup message when someone tries to sign in.

## Security & scope

- No public sign-up route or registration action.
- Login checks `mykioo_members.status` before showing member content; database Row Level Security is the final enforcement layer.
- New Supabase authentication accounts do not automatically become MYKIOO members. An invitation-only account creation endpoint must be implemented server-side before issuing invitations.
- Admin approval, invitation generation, payment activation, reseller credentials, and email notifications are intentionally **not implemented** in this initial deployment.
- Existing Supabase Auth is shared with other apps; do **not** disable global signups without assessing impact on those apps.
- Frontend privacy is not the same as preventing public access to the login page. Add a Cloudflare Access gate if you require the entire site to be inaccessible to uninvited visitors.

## Development

```sh
npm install
npm run dev
npm run build
```
