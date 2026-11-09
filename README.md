# UEMP – University Education Management Portal

A web portal for running a university's academic records: students register for courses, lecturers enter scores, departments approve results, and a super admin manages the institution. Four roles, each with its own dashboard and permissions enforced on the server.

- **Technical documentation:** [docs/TECHNICAL.md](docs/TECHNICAL.md) (architecture, permission logic, security, decisions)
- **Database design and ER diagram:** [docs/DATABASE.md](docs/DATABASE.md)

## Live demo

**URL:** <https://uemp.up.railway.app>

All demo accounts use the password **`Password@123`**. The login page also lists them with a one-click "Use this account" button.

| Role | Email | Who |
|---|---|---|
| Super Admin | `admin@uemp.test` | Grace Adeyemi |
| Department Admin (Computer Science) | `csc.admin@uemp.test` | Dr. Emeka Nwosu |
| Department Admin (Mathematics) | `mth.admin@uemp.test` | Dr. Funmilayo Bello |
| Lecturer (Computer Science) | `lecturer@uemp.test` | Dr. Tunde Bakare |
| Student (CSC, 200 Level) | `student@uemp.test` | Adaeze Okafor, `CSC/2025/014` |

Other seeded accounts follow the pattern `firstname.lastname@uemp.test`. `oluwaseun.adebayo@uemp.test` is suspended, so it shows the blocked-login message.

### Suggested walkthrough

The seed data puts the current semester (2026/2027, First Semester) in a state where every workflow can be tried straight away:

1. **Student:** sign in as `student@uemp.test` → Course Registration → tick **CSC 203** → Submit. It appears under My Courses and in the department's Registrations.
2. **Lecturer:** sign in as `lecturer@uemp.test` → CSC 203 is a half-entered draft. Fill the empty scores (CA 0–40, exam 0–60), Save draft, then Submit for approval. The sheet locks.
3. **Department admin:** sign in as `csc.admin@uemp.test` → Results Approval → CSC 203 (or CSC 201, already submitted) → Approve, or Reject with feedback. A rejected sheet comes back to the lecturer with a red banner; CSC 205 is already in that state.
4. **Student again:** Results now shows the approved CSC 203 scores, and the CGPA updates.
5. **Cross-department rules:** MTH 201 is taken by Computer Science students but owned by Mathematics. The CSC admin cannot approve it; `mth.admin@uemp.test` can. The super admin can view and reopen sheets but cannot approve.
6. **Super admin:** sign in as `admin@uemp.test` → faculties, departments, sessions and semesters (open/close registration), users (create, change role, suspend), grading scale, roles and permissions, and the audit log.

## Features

| Role | What they can do |
|---|---|
| Student | Dashboard with CGPA and class of degree; view and edit contact details; register and drop courses for the current semester within the rules; view registered courses; view approved results by semester with GPA and CGPA; print a registration slip and a result statement. |
| Lecturer | Dashboard of assigned courses and sheets needing attention; class lists; score entry with live totals, grades and validation; save as draft; submit for approval; see the department's feedback and resubmit. |
| Department Admin | Department dashboard; manage students, lecturers, courses, programmes and curricula; offer courses each semester and assign lecturers; view registrations; review, approve, reject or reopen result sheets; reports with CSV export; department activity log. |
| Super Admin | University dashboard; manage faculties, departments, programmes, sessions and semesters; open and close registration; manage all users, roles and account status; oversee result approvals; reports; full audit log; configure the grading scale; view the roles and permissions matrix. |

## Tech stack

- **API:** Node.js, Express 5, TypeScript, Prisma 6, PostgreSQL, Zod
- **Web:** React 19, Vite, React Router 7, TanStack Query, Tailwind CSS 4
- **Tests:** Vitest and Supertest against a real PostgreSQL database
- **Deployment:** a single Railway service (Express serves the API and the built frontend) plus Railway PostgreSQL

The reasons for each choice are in [docs/TECHNICAL.md](docs/TECHNICAL.md#2-technology-choices).

## Running locally

**Requirements:** Node.js 20+ and PostgreSQL 14+. If you have Docker, `docker compose up -d` starts a suitable database.

```bash
git clone <this repository>
cd uemp
npm install
cp .env.example .env        # adjust DATABASE_URL if needed
npm run db:migrate          # create the schema
npm run db:seed             # load demo data
npm run dev                 # API on :4000, web on http://localhost:5173
```

Open <http://localhost:5173> and sign in with any demo account above.

### Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | required |
| `TEST_DATABASE_URL` | Database the test suite may wipe | required for `npm test` |
| `PORT` | API port | `4000` |
| `NODE_ENV` | `production` enables secure cookies and trusts the proxy | `development` |
| `SESSION_TTL_HOURS` | Session lifetime | `8` |
| `SEED_DEMO_DATA` | `true` loads the demo data on startup if the database has no users | unset |

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run the API and web dev servers together |
| `npm run build` | Build the web app and bundle the API |
| `npm start` | Apply migrations and start the production server |
| `npm test` | Run the API test suite (resets `TEST_DATABASE_URL`) |
| `npm run typecheck` | Type-check both packages |
| `npm run db:migrate` | Create or update the schema in development |
| `npm run db:seed` | **Wipe all data** and reload the demo dataset |

## Tests

```bash
npm test
```

58 tests cover authentication, the role × endpoint access matrix, department scoping, registration rules, the full result approval workflow and the audit trail. See [docs/TECHNICAL.md §12](docs/TECHNICAL.md#12-testing).

## Deployment

The repository deploys to Railway as one service (see `railway.json`):

1. Create a Railway project with a PostgreSQL database and a service from this repository.
2. Set `DATABASE_URL` to the database's connection URL, `NODE_ENV=production` and `SEED_DEMO_DATA=true`.
3. Deploy. The build runs `npm run build`; the start command applies migrations, then starts the server.
4. On first boot with an empty database, `SEED_DEMO_DATA=true` loads the demo data. It never runs over existing data.

To reset the demo data later, run `npm run db:seed` against the database (for example from `railway ssh`).

## Project structure

```
api/          Express API, Prisma schema, migrations, seed and tests
web/          React frontend
docs/         Technical documentation and database design
```
