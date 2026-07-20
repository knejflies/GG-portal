GREEN GRIN PORTAL SETUP

This portal is built for Netlify + Supabase + app notifications.
There is no SMS setup in this version.
Customer invoices include manual Zelle and Venmo payment instructions with owner verification.

LIVE URLS
- Main site: /
- Customer portal: /portal/
- Admin portal: /admin/
- Employee portal: /employee/

WHAT WORKS AFTER SETUP
- Customers can create an account and sign in with email/password.
- New customer accounts show in Admin -> Customers.
- Customers can compare Fresh Grin, Sharp Grin, and Full Grin Season, then request the plan they want.
- Starting monthly plan prices use the current Lawn Bidder pricing settings; customer requests appear in Admin -> Customers without changing confirmed billing.
- Admin can create jobs tied to customers.
- Admin creates recurring jobs with a price per service week and season dates.
- Monthly invoices count the actual scheduled service weeks, so a five-week month bills five weekly services.
- Admin can create, save, send, edit, and delete invoices.
- Admin can mark invoices paid, search paid invoices, and keep paid invoices collapsed below open invoices.
- Admin -> Bidders groups the single-price Mowing Bidder and five-application Fertilizer Bidder as subsections.
- Mowing Bidder calculates one straightforward quote from the minimum per mow, price per 1,000 square feet, property complexity, visit count, discount, and payment split.
- Fertilizer Bidder prices each application from the minimum or saved price per 1,000 square feet, whichever is higher, while product, labor, and overhead remain visible as a profit check.
- Fert Bidder shows product pounds, fractional bags used, whole bags to purchase, cash product purchase, application charges, annual quote, operating profit, gross margin, and first-job cash profit.
- Admin can adjust the simple mowing and fertilizer price drivers, with detailed operating-cost settings kept in advanced subsections.
- Bidder pricing saves in Supabase and can be copied directly into a job or invoice.
- Admin can scan receipt photos with AI, review the result, and save expenses.
- Admin can log start/end mileage and have the calculated miles added as a vehicle expense at $0.76 per mile.
- Sent invoices show in the customer's Billing tab.
- Customers can send invoice payments by Zelle or Venmo to Green Grin Lawns, then report the payment as pending.
- Admin receives an app notification, verifies the payment, and marks the invoice paid.
- Admin can send a monthly invoice calculated from that month's scheduled service weeks.
- Employees can request access.
- Admin can approve/deactivate/delete employees, set PINs, and set hourly rates.
- Admin can mark an employee as a subcontractor and select Aeration, Shrubs, and Snow categories.
- Admin can build a dated daily route without changing a customer's recurring weekly schedule.
- Saving a daily route sends an app notification to that employee or subcontractor.
- Admin can grant Marketer access and assign an entire subdivision to a marketer.
- Admin can edit subdivision routes, click houses onto a satellite planning map, switch between current street and satellite views, open the planning map full screen on a computer, save contact names and phone numbers, and delete individual houses.
- Employees with notifications enabled receive an app alert when a new marketing route is assigned or an existing route is reassigned to them.
- Marketers can save each house from their phone location and record card left, interested, or not interested.
- Employee location taps match the nearest unvisited house planned by the owner.
- Marking a house Interested immediately sends an app notification to registered admin devices.
- Interested marketing leads require a name and phone number and appear in Admin -> Marketing.
- Employees can see assigned jobs grouped by daily route and click Arrived or Done.
- Arrived and Done send app notifications to the customer and are recorded in the activity log.
- Employees can clock in/out.
- Subcontractors do not see or use the employee time clock.
- Admin can view time clock totals and pay totals by day/week/month.
- Customers, admin, and employees can enable app notifications on their device.
- iPhone and Android visitors receive an in-site prompt to install the current portal as an app.
- Morning cleanup reminders send through app notifications only.
- Done notices send through app notifications only.
- Sent invoices send through app notifications only.
- Admin can send a broadcast app notification to all customers who enabled notifications.
- Notifications can arrive while the portal app is closed after that device has enabled notifications.

SUPABASE SETUP
1. Open Supabase.
2. Go to SQL Editor.
3. Paste and run portal-setup.sql.
4. If you already ran setup before, run portal-setup.sql again. It safely adds the latest portal tables and columns.
5. Go to Project Settings -> API.
6. Copy:
   - Project URL
   - anon public key
   - service_role key
7. Go to Authentication -> Providers.
8. Make sure Email is enabled.
9. Go to Authentication -> URL Configuration.
10. Add your Netlify site URL as an allowed redirect URL.

NETLIFY ENVIRONMENT VARIABLES
In Netlify, go to:
Site configuration -> Environment variables

Add these:
SUPABASE_URL=your Supabase project URL
SUPABASE_ANON_KEY=your Supabase anon public key
SUPABASE_SERVICE_ROLE_KEY=your Supabase service_role key
GREEN_GRIN_ADMIN_PIN=make up a private admin PIN
GREEN_GRIN_TIMEZONE=America/Denver
GREEN_GRIN_VAPID_PUBLIC_KEY=from GGL-1.55-NOTIFICATION-KEYS.txt
GREEN_GRIN_VAPID_PRIVATE_KEY=from GGL-1.55-NOTIFICATION-KEYS.txt
GREEN_GRIN_VAPID_SUBJECT=mailto:notifications@greengrinlawns.com
GREEN_GRIN_ZELLE_RECIPIENT_NAME=Green Grin Lawns
GREEN_GRIN_ZELLE_PHONE=2087408837
GREEN_GRIN_ZELLE_EMAIL=ken@greengrinlawns.com
GREEN_GRIN_VENMO_HANDLE=@greengrinlawns
OPENAI_API_KEY=your OpenAI API key for receipt scanning

Do not put the notification keys text file in GitHub.
Do not share the service_role key, private notification key, OpenAI API key, or admin PIN.
The SUPABASE_ANON_KEY and GREEN_GRIN_VAPID_PUBLIC_KEY are okay to expose.

OPENAI_RECEIPT_MODEL is optional. Leave it out unless you are intentionally changing the receipt scanner model.
GREEN_GRIN_GEOCODER_URL is optional. Leave it out to use the default OpenStreetMap address lookup.

MOWING BIDDER
1. Run the latest portal-setup.sql so green_grin_pricing_config exists.
2. Sign in at /admin/, open Bidders, and choose Mowing Bidder.
3. Open Mowing Price Settings, adjust the minimum, price per 1,000 square feet, visit count, discount, rounding, and payments, then click Save Mowing Price.
4. Pricing is stored in Supabase; no additional Netlify environment variable is required.
5. Copy the single calculated quote to a job or draft invoice.

FERTILIZER BIDDER
1. Sign in at /admin/, open Bidders, and choose Fertilizer Bidder.
2. Enter turf square footage to calculate the full five-application program.
3. Open Fertilizer Pricing Settings to adjust the price per 1,000 square feet, minimum application, visits, and rounding. Operating costs, products, and the application schedule are under advanced subsections.
4. Click Save Fert Pricing to store the owner settings in the same Supabase pricing record used by Lawn Bidder.
5. Copy the annual program to a job or copy the average application charge to a draft invoice.
6. Existing saved pricing remains compatible; new simple bidder settings are filled from the supplied defaults.

WEEKLY JOB BILLING
1. In Admin -> Jobs, enter the price per service week plus the season start and end dates.
2. The portal calculates the season total from the scheduled weekly visits.
3. Monthly invoices count the weekly service dates that fall in that calendar month.
4. A four-week month bills four services and a five-week month bills five services.

MARKETING ROUTES
1. In Admin -> Employees, approve the employee and click Make Marketer.
2. Open Admin -> Marketing and assign that marketer a subdivision and city.
3. Choose the route under Plan Houses and click each house on the map.
4. The employee opens Employee -> Marketing Route on their phone.
5. At each house, the employee taps I'm At A House. GPS matches the nearest unvisited planned house.
6. The employee chooses Card Left, Interested, or Not Interested.
7. Admin can edit names and phone numbers or delete a house under the route's Houses list.

SUBCONTRACTORS AND DAILY ROUTES
1. In Admin -> Employees, approve the worker and click Make Subcontractor.
2. Select Aeration, Shrubs, and/or Snow, then click Save Subcontractor Categories.
3. Open Admin -> Jobs and choose the date and employee under Daily Route Builder.
4. Check the jobs for that date and click Save Daily Route.
5. The employee receives an app notification and sees the dated route under My Jobs.

APP NOTIFICATION SETUP
1. Upload/deploy this site to Netlify.
2. Add the Netlify environment variables above.
3. Run portal-setup.sql in Supabase.
4. Redeploy the site. Netlify must include package.json so it installs the push sender.
5. Open /portal/, /admin/, or /employee/.
6. Sign in.
7. Click Enable Notifications on each device that should receive alerts.

NOTIFICATION NOTES
- Customers only receive app reminders after they sign in and tap Enable Notifications.
- Admin only receives admin notifications after you sign in to /admin/ and tap Enable Notifications.
- Employees only receive employee notifications after they sign in to /employee/ and tap Enable Notifications.
- iPhone users usually need to add the portal to their Home Screen before notifications work.
- After notifications are enabled, the app can be closed and notifications can still arrive.
- If a customer blocks notifications, they will not receive reminders.
- If a customer changes phone/browser, they need to enable notifications again.

AUTOMATIC MORNING REMINDERS
Netlify checks every 15 minutes.
It does not notify every 15 minutes.
Each scheduled job gets one morning cleanup reminder per service day, after the saved morning notification time.

INSTALLED APP UPDATES
The downloaded app is still your website.
When you deploy a new version, the installed app usually updates the next time it opens.
If it looks stuck on an old version, fully close and reopen the app.

PAYMENTS
Sent and overdue invoices show Zelle and Venmo instructions in the customer Billing tab.
For Zelle, the customer sends the exact amount in their bank app to Green Grin Lawns using either:
- Phone: (208) 740-8837
- Email: ken@greengrinlawns.com
For Venmo, the customer searches the exact business username @greengrinlawns and confirms Green Grin Lawns before sending.
The customer includes the unique invoice memo, then taps the matching I Sent This Payment button.
The invoice moves to Payment Pending and the admin receives an app notification.
The owner must verify the Zelle or Venmo payment before selecting Mark Paid.
The portal does not connect to either payment service and never marks a payment paid automatically.

EXPENSE SCANNER
Admin -> Expenses can scan receipt photos after OPENAI_API_KEY is added in Netlify.
The scan fills the form only. Review the vendor, date, category, and total before saving.
Receipt photos are not saved in Supabase by this version; only the reviewed expense details are saved.
