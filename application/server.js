'use strict';

const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');
require('dotenv').config();

const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and configure the database connection.');
  process.exit(1);
}

const app = express();
const port = Number(process.env.PORT || 3000);

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// The target group's /health check verifies that the Node.js process responds.
// Database availability is checked separately when an API request uses MySQL.
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'student-management-app' });
});

// Return the student records stored in Amazon RDS for MySQL.
app.get('/api/students', async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, course FROM students ORDER BY id DESC'
    );
    res.status(200).json(rows);
  } catch (error) {
    console.error('Could not retrieve students:', error.message);
    res.status(500).json({ error: 'Unable to retrieve student records.' });
  }
});

// Validate and save a student record in MySQL.
app.post('/api/students', async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const course = typeof req.body.course === 'string' ? req.body.course.trim() : '';

  if (!name || !email || !course) {
    return res.status(400).json({ error: 'Name, email, and course are required.' });
  }

  if (name.length > 120 || email.length > 254 || course.length > 120) {
    return res.status(400).json({ error: 'One or more fields are too long.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  try {
    const [result] = await pool.execute(
      'INSERT INTO students (name, email, course) VALUES (?, ?, ?)',
      [name, email, course]
    );

    return res.status(201).json({
      message: 'Student registered successfully.',
      student: { id: result.insertId, name, email, course }
    });
  } catch (error) {
    console.error('Could not register student:', error.message);
    return res.status(500).json({ error: 'Unable to register the student.' });
  }
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Student Management System listening on port ${port}`);
});

async function shutDown(signal) {
  console.log(`${signal} received. Closing the HTTP server and database pool...`);
  server.close(async () => {
    try {
      await pool.end();
      process.exit(0);
    } catch (error) {
      console.error('Error while closing the database pool:', error.message);
      process.exit(1);
    }
  });
}

process.on('SIGTERM', () => shutDown('SIGTERM'));
process.on('SIGINT', () => shutDown('SIGINT'));
