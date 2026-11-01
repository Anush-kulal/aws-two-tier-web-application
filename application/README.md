# Student Management Application

This folder contains a reproducible Node.js/Express and MySQL implementation of the Student Management System used in the AWS two-tier deployment documentation.

> The source was prepared for this repository from the documented application behavior and interface. It is a clean, reproducible implementation; it is not represented as a byte-for-byte export of the files originally created on the EC2 instances.

## Features

- Serve the browser interface from Express.
- Register a student with name, email, and course.
- Read registered student records from MySQL.
- Provide a lightweight `GET /health` endpoint for the ALB target-group health check.
- Use parameterized SQL queries for database writes.
- Load database credentials from environment variables rather than hardcoding them.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Application process health check |
| GET | `/api/students` | Return registered students as JSON |
| POST | `/api/students` | Validate and insert a student record |

Example request:

```json
{
  "name": "Example Student",
  "email": "student@example.com",
  "course": "Computer Science"
}
```

## Files

- `server.js` — Express server, REST endpoints, and MySQL connection pool.
- `public/index.html` — Student registration interface.
- `database/schema.sql` — Table definition for the `studentdb.students` table.
- `.env.example` — Environment-variable template containing placeholders only.
- `package.json` — Node.js package metadata and dependencies.

See the repository's [deployment guide](../DEPLOYMENT.md) for the EC2, RDS, systemd, security-group, and ALB setup.
