# MYKIOO Agent system — staged implementation

**Status:** Development branch only. Not deployed to MYKIOO. Do not merge before the Supabase migration, server-function deployment, access-control audit, and controlled end-to-end tests.

## Existing behavior preserved

- Owner is still identified by approved `mykioo_members.role = 'owner'`.
- Existing `member` role and regular invitations remain unchanged. Agent/customer access is modeled through separate tables, not by loosening global Auth controls.
- Existing owner order completion, payment verification, cancellation, subscription management, and credential-delivery logic have not been replaced.
- The catalog `mykioo_package_prices` is the only authoritative price source. No browser-supplied wholesale rate or discount is trusted.

## Roles and behavior in this branch

**Owner:** The Agents tab enrolls an existing approved member as an agent (free or paid membership, manual fee configuration); activates/suspends them; assigns existing approved members to active agents; inspects incoming invitation, service selection, renewal and order records; confirms personally verified wholesale payments. The final subscription activation still uses the established owner workflow and must be completed separately.

**Agent:** Can request customer invitations, see only assigned customers, view requests, set their own customer-facing price in CAD, and submit an order intent for the owner. The server calculates the **fixed CAD $5 discount** against `mykioo_package_prices.price_cad`, with **no promotion/coupon stacking**. Agents cannot verify their own payments or activate services. Access for agents with a paid access plan is owner-controlled; automated collection/suspension for unpaid agent fees is **not implemented**.

**Assigned customer:** A separate dashboard reveals service/status/expiration, price-free service selection, renewal request and support-ticket form. Their agent is notified by existing MYKIOO email dispatcher when the dispatcher accepts a renewal/service-selection email; otherwise the request still remains in the agent's queue. No email-delivery guarantee is made.

**Invitations:** Agents can submit an invitation request; owner must send it through the existing invitation workflow. Automatic linkage of invited users back to the originating agent upon acceptance is **not yet implemented**. Until linked by the owner, an invitee is a regular member. Use the established account setup/password-change flow; never use one shared default password.

## Security and unfinished integration

1. **Connect the actual MYKIOO Supabase account** (project `porpqvphytecuidomcgy`) for inspection and approved deployment. The currently connected Supabase accounts do not expose this project, so no live DB changes were made.
2. Check live schema for PKs, existing constraints, function-name collisions, auth ownership, billing policies, cancellation paths and RLS; review migration before applying. Carefully inspect whether existing `mykioo_subscription_requests`, `mykioo_package_prices`, `mykioo_subscriptions`, `mykioo_members`, `mykioo_invitations`, and notification tables allow direct agent-customer access to pricing or unauthorized mutations. **Browser UI hiding alone is never sufficient**.
3. Apply staged SQL and deploy `mykioo-agents` function; deploy the modified `mykioo-subscription-requests` function at the same time, **before** switching the frontend to agent-aware routing.
4. Complete owner approval/send for agent invitations with verified agent association on acceptance. Complete the canonical order handoff after wholesale payment verification so the existing paid subscription/order and completion email pipelines are used, with no duplicate fulfillment.
5. If charging agents for access, add payment collection, receipts, due dates, renewal grace periods and suspension enforcement. Current free/paid metadata does not collect or validate payment.
6. Decide how agent-supplied e-transfer/cash payment references are recorded and reconciled with the existing MYKIOO billing and audit logs.
7. Implement a genuine automatically generated **unique** temporary password / single-use setup flow only if required; the existing customer invitation flow instead lets the invitee set a password securely.
8. Verify email delivery with controlled addresses, French/English wording, absence of credentials in email/logs, and escalation when mail is unavailable. Agent renewal emails currently have English copy only; internationalization is still needed.
9. Review country/bouquet picker and provider activation; this branch records country preferences in a free-text note, not automated bouquet selection.
10. Check service pricing against current live catalog, not old screenshots, including fees and tax requirements.
11. Test the app with owner/agent/customer/unassigned member accounts. Attempt direct REST requests and authenticated Edge Function calls to prove agent/customer cannot fetch pricing, use discounts, inspect other agents, change agent status, fabricate payment confirmation, read service credentials, or activate subscriptions.

## Manual QA checklist

- Owner can enroll a free agent and a paid agent, suspend one, and assign a customer; customer cannot assign themselves.
- Owner preserves full permissions; unassigned existing member experience is unchanged.
- Agent can list only assigned customers and never gains owner powers.
- Agent submits a 365-day 1-device order; verify the server uses current database price minus exactly CAD $5, regardless of chosen retail price.
- Agent promotion codes cannot alter wholesale prices, and direct retail endpoint returns 403 for agent and agent-managed customer.
- Customer sees only service expiration, support, renewal, price-free options; test REST endpoints independently to catch disclosure.
- Customer renewal appears exactly once in agent queue; email status reflects dispatcher acceptance, not guaranteed inbox delivery.
- Owner only marks payment verified after checking the transfer; no order becomes active from this flag.
- Owner completes subscription through existing queue; test expiry date and bilingual completion email.
- Invite sending, acceptance, password setup, assignment, and suspension require end-to-end tests.
- Use only controlled test accounts. Do not email real customers, create real orders, or alter provider panel during QA.

**Deployment gate:** No production merge until the missing steps have been implemented and verified.