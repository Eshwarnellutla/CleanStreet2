const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1'))
        ? false
        : { rejectUnauthorized: false }
});

const connectDB = async () => {
    try {
        await pool.query('SELECT NOW()'); // test connection
        console.log('PostgreSQL Connected...');
    } catch (err) {
        console.error('Database Connection Error (Fatal):', err.message);
        console.error('Make sure DATABASE_URL is correct and the database is accessible.');
        process.exit(1);
    }

    try {
        // Auto-migration
        await pool.query(`
            CREATE TABLE IF NOT EXISTS complaints (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                title VARCHAR(255) NOT NULL,
                type VARCHAR(100) NOT NULL,
                priority VARCHAR(50) NOT NULL,
                address TEXT NOT NULL,
                landmark TEXT,
                description TEXT NOT NULL,
                latitude DECIMAL(10, 8),
                longitude DECIMAL(11, 8),
                status VARCHAR(50) DEFAULT 'Pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Migration for existing tables: ensures 'type' column and others exist
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='complaints' AND column_name='type') THEN
                    ALTER TABLE complaints ADD COLUMN type VARCHAR(100) NOT NULL DEFAULT 'Other';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='complaints' AND column_name='priority') THEN
                    ALTER TABLE complaints ADD COLUMN priority VARCHAR(50) NOT NULL DEFAULT 'Medium';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='complaints' AND column_name='landmark') THEN
                    ALTER TABLE complaints ADD COLUMN landmark TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='complaints' AND column_name='photo') THEN
                    ALTER TABLE complaints ADD COLUMN photo TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='complaints' AND column_name='assigned_to') THEN
                    ALTER TABLE complaints ADD COLUMN assigned_to VARCHAR(255);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='complaints' AND column_name='latitude') THEN
                    ALTER TABLE complaints ADD COLUMN latitude DECIMAL(10, 8);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='complaints' AND column_name='longitude') THEN
                    ALTER TABLE complaints ADD COLUMN longitude DECIMAL(11, 8);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='complaints' AND column_name='volunteer_photo') THEN
                    ALTER TABLE complaints ADD COLUMN volunteer_photo TEXT;
                END IF;

                -- Fix NULL or 'received' statuses to 'Pending'
                UPDATE complaints SET status = 'Pending' WHERE status IS NULL OR status = 'received';

                -- Notifications Table (Only create if users table exists, otherwise handle gracefully)
                IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
                        CREATE TABLE notifications (
                            id SERIAL PRIMARY KEY,
                            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                            type VARCHAR(50) NOT NULL,
                            title VARCHAR(255) NOT NULL,
                            message TEXT NOT NULL,
                            complaint_id INTEGER REFERENCES complaints(id) ON DELETE CASCADE,
                            is_read BOOLEAN DEFAULT FALSE,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        );
                        CREATE INDEX idx_notifications_user_id ON notifications(user_id);
                        CREATE INDEX idx_notifications_is_read ON notifications(is_read);
                        CREATE INDEX idx_notifications_created_at ON notifications(created_at);
                    END IF;
                END IF;
            END $$;
        `);
        console.log('Complaints and Notifications tables verified.');
    } catch (err) {
        console.warn('Database Auto-migration warning (Non-fatal):', err.message);
        console.warn('The database connection is active, but auto-migration failed. If this is a fresh setup, please run "npm run migrate" or run backend/migrate.js first.');
    }
};

module.exports = { pool, connectDB };