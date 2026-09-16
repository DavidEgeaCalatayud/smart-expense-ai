# Android mobile experience 0.4.0

This release builds on the online synchronization and encrypted caching from #109.

## Daily navigation

The persistent bottom bar has Home, Activity, a central Add action, Insights and More.
The `/` route opens Home. Existing workspace links still work. More also links to
budgets, categories, predictions, historical analysis, reports, assistant, imports,
account and settings.

Home combines current server spending, a comparison against the previous full month,
budget progress, a forecast, upcoming payments, open findings and recent replica
transactions. Missing sections and cached snapshots are labelled. Pending local
changes are excluded from server totals until synchronized. The comparison label
explicitly names the previous full month, rather than implying equivalent elapsed days.

## Activity

The modal editor supports income and expense, category selection, a native calendar,
payment method, description and recurrence. Users can create a category when needed.
Category/type validation and the local row/outbox updates share one keyed SQLCipher
transaction. Sending/conflicted records retain their existing concurrency protections.

Search, month, inclusive date range, category, type, recurrence and sync-status filters
run in SQL before pagination. Amount ordering uses integer cents. Lists page through
all matching rows; filtering is not limited to the first 100 transactions.

## Import and account

CSV selection uses Android's document picker and the existing detect → mapping →
preview → commit endpoints. Files are capped at 2 MB. Invalid rows block commit;
duplicates are handled by the backend. The picker copy is removed after reading and
raw content is not persisted in the app cache. Successful commits are followed by a
pull into the shared replica.

Account exposes password change, authenticated JSON privacy export, active mobile
sessions, synchronization information, local app lock and notification preferences.
A password change drains account work, requires pending data to be synchronized,
revokes existing server sessions and obtains replacement mobile credentials. If the
replacement login fails after revocation, the user signs in with the new password.
Exports use a temporary private file and remove it after the Android share sheet closes.

Settings include light/dark/device appearance, the account's actual EUR currency,
version, privacy documentation and bundled package licence notices. There is no
synthetic currency conversion or editable currency unsupported by the backend.

## Native features

Biometric lock is opt-in. It uses strong device biometrics with device-passcode fallback,
locks on leaving the app, conceals financial modals, and prevents screenshots while
enabled. It protects the local presentation and does not replace server authentication
or prevent authorized background synchronization.

Notifications are opt-in local notifications, without a paid push provider or push token.
Canonical server data drives reminders for upcoming subscriptions, 80%/100% budget
thresholds, new anomaly findings and forecast changes of at least 10% and EUR 1.
Forecast updates are limited to one per day. Reminders are scheduled around 09:00
local time the day before an expected payment. Notification text hides financial
amounts and merchant names by default; the user can explicitly enable detailed content. Stale scheduled reminders are cancelled on refresh;
account cleanup cancels pending and displayed notifications. Android may delay
background work or delivery according to device/battery settings.

The native Android home-screen widget and launcher shortcuts open the same authenticated
expense/income quick-add routes. No account balances, credentials or financial records
are written to the launcher. Add the widget by holding an empty home-screen area and
selecting Smart Expense AI in Widgets.

Financial views use progress meters, forecast comparisons, payment status rows,
large insight metrics and monthly bars. Forecast graphics distinguish recorded spending
from the estimated month-end total; they do not invent a daily history or prediction curve.

## Validation and distribution

Mobile unit coverage includes full-replica SQL filtering/paging, exact amounts, rich
mutation payloads, password session replacement, biometric cancellation/relocking,
notification deduplication, cancellation and opt-out races. Native E2E retains all
#109 sync/account invariants and adds quick-add, income/recurrence/filtering, actual
CSV selection/import, account session information and appearance switching.

The new sessions endpoint is read-only and needs a backend deployment. It reuses the
existing sessions table; there is no schema migration or paid hosting change.
Preview APKs remain separately identified and temporarily signed. Production Play
signing, operator privacy details and physical-device acceptance remain owner release
tasks; this preview must not be described as a Google Play publication.

Implementation references: [Expo LocalAuthentication](https://docs.expo.dev/versions/latest/sdk/local-authentication/),
[Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/),
[Expo DocumentPicker](https://docs.expo.dev/versions/latest/sdk/document-picker/),
[Android app widgets](https://developer.android.com/develop/ui/views/appwidgets).
