# objectified-schema

This is the Database Schema scripts used by Objectified.

## Prerequisites

- PostgreSQL 18 or higher
- pgvector extension (for vector search capabilities)
- [schema-evolution-manager](https://github.com/mbryzek/schema-evolution-manager)

## Setup Instructions

Set up your PostgreSQL configurations (POSTGRES_USERNAME, PASSWORD, etc.) then run:

```bash
sem-apply
```

This will apply the latest schema to your database, stored in a schema called "objectified".  This way,
any database schemas you currently have in your system will not be touched.

## Guidelines

Creating new tables or updating existing tables should keep the following in mind:

- Database tables should be soft-deleted records for audit purposes.  This means:
  - Dates for `created_at`, `updated_at`, and `deleted_at` should be included in all tables.
  - When deleting records, instead of removing them from the database, set the `deleted_at` field, and set an enabled flag to `false`.
  - All database time tables must be in UTC timezone, meaning `WITHOUT TIME ZONE` when creating.
  - Database table names **MUST NEVER BE PLURALIZED**.
  - Database referential integrity must be maintained, meaning foreign keys should be used to link tables together, and cascading deletes should be avoided.
  - All tables should have a primary key, and it should be a UUIDv7 ID, using `uuidv7()` as the default value.
- **Avoid stored procedures**
- Avoid triggers except in the case of a updated_at trigger to update the `updated_at` field on record updates.

Updates to tables that already contain data must be done in a way that does not corrupt any data.  This means:

- Database tables should be locked
- New columns should be added with a default value, and not set to `NOT NULL` until after the column has been added and populated with data.
- When changing a column type, a new column should be added with the new type, data should be migrated from the old column to the new column, and then the old column should be dropped.

