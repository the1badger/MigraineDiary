# Future ideas (out of scope for v1)

Listed so they are not forgotten, roughly in the order they would earn their place.

- **Passcode lock.** A hashed 4-digit PIN to stop casual viewing. Not encryption, and the copy must say so. Skipped in v1 so an attack-time log costs zero extra taps.
- **Sharing with a clinician.** A printable one-page summary (monthly counts, medication days, top findings) beyond the CSV export.
- **Sync between devices.** Would need a server or an end-to-end encrypted relay; conflicts with the local-only promise unless done with user-held keys.
- **Weather auto-fetch.** Pressure changes are a common suspect; would need a network call and a location, both of which v1 deliberately avoids.
- **Sleep-tracker or wearable import.** Apple Health / Google Fit export files could fill sleep hours automatically.
- **Medication reminders** for daily preventives.
- **Regression or other multi-factor modelling.** v1 tests each exposure on its own and lists co-occurring ones; a small logistic model with a few factors would need far more data than most diaries hold.
- **SQLite-in-browser** (wa-sqlite / sql.js) if the analysis grows beyond simple counting.
- **Scheduled notifications** via the Notification Triggers API or web push, if browsers make them reliable without a push server.
- **Multi-user** on one device.
- **Accounts, cloud storage, AI chat.** Not planned.
