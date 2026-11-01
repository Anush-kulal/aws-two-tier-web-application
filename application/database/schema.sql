-- Run this script against the MySQL RDS instance.
-- It creates the application database and student table if they do not exist.

CREATE DATABASE IF NOT EXISTS studentdb
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE studentdb;

CREATE TABLE IF NOT EXISTS students (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(254) NOT NULL,
    course VARCHAR(120) NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
