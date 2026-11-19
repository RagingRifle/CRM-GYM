# Gym CRM

A resellable gym management platform with a web admin dashboard, an Expo member app, trainer access, and a PostgreSQL backend.

## Features

- Gym operations: members, plans, leads, classes, branches, check-ins, payments, expenses, and dues.
- Trainer tools: attendance, payroll, PT sessions, workout and diet plans, and member assessments.
- Member tools: membership details, check-in history, classes, workouts, diet plans, payment history, and support.
- Reporting, analytics, audit logs, settings, and multi-branch administration.

## Local setup

The root Docker Compose file starts a project-owned PostgreSQL database on port 5433 and the API on port 5000. The database uses a dedicated Docker volume and does not connect to any previous project database.

1. Start Docker Desktop.
2. Copy `backend/.env.example` to `backend/.env`.
3. From the repository root run `docker compose up --build -d`.
4. In `backend/.env`, set `LOCAL_ADMIN_EMAIL` and `LOCAL_ADMIN_PASSWORD` to your chosen local account (password must be at least 12 characters). Run `npm run db:bootstrap-local` from `backend` once.
5. Install frontend dependencies in `frontend`, then run `npm run dev`.
6. Install mobile app dependencies in `App-Code`, then run `npm start`.

The web API defaults to `http://localhost:5000/api/v1` and the local database to `postgresql://gymcrm:gymcrm_local@localhost:5433/gymcrm`. Set a fresh `JWT_SECRET` for deployment. The checked-in environment template contains no database credentials.

## Member outreach automations

The admin dashboard's **Automations & Outreach** page supports configurable reminders for upcoming membership expiry, overdue balances, inactive members, and new leads. Rules start paused. Each gym can set timing, channel, and message text, record channel consent for members and leads, and review the queued/sent/failed message history. The worker scans every five minutes and deduplicates queued messages.

Email uses SMTP settings from `backend/.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `FROM_NAME`, and `FROM_EMAIL`. Without complete SMTP settings, email is simulated. For Gmail, use an app password with SMTP (`smtp.gmail.com`, port `465` with secure enabled or `587` with secure disabled); do not use or commit your normal account password. The **Send test email** button sends only to the signed-in staff account. WhatsApp is preview-only until a provider is connected.

For a Gmail test account, the settings typically look like:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@gmail.com
SMTP_PASS=your-google-app-password
FROM_NAME=Gym CRM
FROM_EMAIL=you@gmail.com
```

The overdue-balance rule currently uses membership expiry as the due-date signal because member records do not yet contain a separate invoice due date. Record consent only after the contact has agreed to receive messages through the selected channel.

The Prisma schema is synchronized automatically when the backend starts. The local bootstrap command is restricted to localhost PostgreSQL and creates only the initial Gym CRM workspace and super-admin account. For a physical phone, change `EXPO_PUBLIC_API_URL` in `App-Code/.env` to the development computer's LAN IP address.
