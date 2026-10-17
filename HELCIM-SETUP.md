# Green Grin Helcim setup

The portal uses HelcimPay.js for the card form. Full card numbers and security codes go directly to Helcim. Green Grin stores only Helcim's reusable card token, customer reference, card brand, and last four digits.

## 1. Install the payment tables

Run the newest `property-billing.sql` in the Supabase SQL editor. It adds the payment-method vault references, checkout sessions, payment attempts, webhook event log, receipt tracking, and customer consent snapshot.

## 2. Finish the Helcim API access configuration

- Keep **This token will be used for a checkout integration** enabled.
- Add `https://portal.greengrinlawns.com` as an allowed checkout URL.
- Give **Transaction Processing** permission to process positive transactions. This is required for charging an authorized saved card.
- Never place the API token in browser code.

## 3. Add Netlify environment variables

- `HELCIM_API_TOKEN`: the API token from the Helcim access configuration. The portal also recognizes the existing `Green_Grin_Portal_Payments` variable so the first deployment does not require renaming it.
- `HELCIM_WEBHOOK_VERIFIER_TOKEN`: the Base64 verifier token shown by Helcim after webhooks are enabled. This is different from the API token.
- Keep the existing `RESEND_API_KEY` and `GREEN_GRIN_INVOICE_FROM` values for receipts.

## 4. Enable the webhook

In Helcim, open **All Tools > Integrations > Webhooks**, turn webhooks on, select **Card Transaction**, and use this delivery URL:

`https://portal.greengrinlawns.com/.netlify/functions/payment-webhook`

The URL intentionally does not contain the provider's name. Copy the webhook verifier token into Netlify as `HELCIM_WEBHOOK_VERIFIER_TOKEN`.

## 5. Deploy and verify

1. Sign into a test customer account and open **Billing**.
2. Choose review-first or automatic billing, set limits, check the authorization, and select **Connect Card Securely**.
3. Complete Helcim's secure verification form.
4. In Admin, send a small test invoice for that property and select **Charge Saved Card**.
5. Confirm the invoice moves to Paid once, a receipt is emailed once, and the payment appears in Helcim.

Use a low-value real invoice only after Helcim's own test mode has passed. The portal rejects services and amounts outside the customer's recorded authorization.

For **Review each invoice first**, use **Charge Saved Card** after reviewing the itemized invoice. For **Charge automatically**, the daily billing job charges only sent invoices that are due, have completed the customer's advance-notice period, and remain inside the recorded service and dollar limits. Declines leave the invoice open, record the failed attempt, and email both the customer and Green Grin. Helcim and the portal both use duplicate-payment protection.
