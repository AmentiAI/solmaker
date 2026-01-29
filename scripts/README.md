# Database Setup Scripts

This directory contains scripts for setting up and managing the database schema for the Collection Management System.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set your database connection string (optional if using default):
```bash
export NEON_DATABASE="your-connection-string-here"
```

## Running Database Setup

To set up the database with all required tables and indexes:

```bash
npm run db:setup
```

Or run directly:
```bash
node scripts/setup-database.js
```

## What the Script Does

1. **Connects to Neon Database** using the provided connection string
2. **Creates Migration Tracking** - A `schema_migrations` table to track executed migrations
3. **Runs Migrations in Order**:
   - `001_create_collections.sql` - Creates collections table
   - `002_create_layers.sql` - Creates layers table with foreign key to collections
   - `003_create_traits.sql` - Creates traits table with foreign key to layers
   - `004_add_indexes.sql` - Adds performance indexes
4. **Verifies Setup** - Confirms all tables were created successfully

## Database Schema

### Collections Table
- `id` (UUID, Primary Key)
- `name` (VARCHAR, Required)
- `description` (TEXT, Optional)
- `is_active` (BOOLEAN, Default: false)
- `created_at`, `updated_at` (TIMESTAMPS)

### Layers Table
- `id` (UUID, Primary Key)
- `collection_id` (UUID, Foreign Key to collections)
- `name` (VARCHAR, Required)
- `display_order` (INTEGER, Required)
- `created_at`, `updated_at` (TIMESTAMPS)

### Traits Table
- `id` (UUID, Primary Key)
- `layer_id` (UUID, Foreign Key to layers)
- `name` (VARCHAR, Required)
- `description` (TEXT, Optional)
- `trait_prompt` (TEXT, AI-generated description)
- `rarity_weight` (INTEGER, Default: 1)
- `created_at`, `updated_at` (TIMESTAMPS)

## Features

- ✅ **Idempotent** - Can be run multiple times safely
- ✅ **Migration Tracking** - Only runs new migrations
- ✅ **Transaction Safety** - Each migration runs in a transaction
- ✅ **Error Handling** - Proper rollback on errors
- ✅ **SSL Support** - Configured for Neon's SSL requirements
- ✅ **Performance Indexes** - Optimized for common queries

## Troubleshooting

If you encounter connection issues:
1. Verify your Neon database is running
2. Check the connection string format
3. Ensure SSL is properly configured
4. Check network connectivity to Neon

The script will provide detailed error messages if something goes wrong.
