require('dotenv').config();
const { Pool } = require('pg');

// Create PostgreSQL connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Test connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to PostgreSQL database:', err.stack);
    } else {
        console.log('✅ Connected to Neon PostgreSQL database successfully!');
        release();
    }
});

// Initialize database tables with PostgreSQL syntax
const initDatabase = async () => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Users table (admin, teachers and students)
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(10) NOT NULL CHECK(role IN ('admin', 'teacher', 'student')),
                name VARCHAR(100) NOT NULL,
                register_id VARCHAR(50) UNIQUE,
                can_change_password BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Update existing constraint to allow admin role
        await client.query(`
            ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check
        `);
        
        await client.query(`
            ALTER TABLE users ADD CONSTRAINT users_role_check 
            CHECK (role IN ('admin', 'teacher', 'student'))
        `);
        
        // Add missing columns to existing users table
        await client.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS register_id VARCHAR(50),
            ADD COLUMN IF NOT EXISTS can_change_password BOOLEAN DEFAULT TRUE
        `);

        // Classes table with year and section
        await client.query(`
            CREATE TABLE IF NOT EXISTS classes (
                id SERIAL PRIMARY KEY,
                class_name VARCHAR(100) NOT NULL,
                year INTEGER NOT NULL CHECK(year IN (1, 2, 3, 4)),
                section VARCHAR(5) NOT NULL,
                teacher_id INTEGER REFERENCES users(id),
                total_students INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(year, section)
            )
        `);
        
        // Add missing columns to existing classes table
        await client.query(`
            ALTER TABLE classes 
            ADD COLUMN IF NOT EXISTS year INTEGER,
            ADD COLUMN IF NOT EXISTS section VARCHAR(5)
        `);
        
        // Update year and section for existing classes if they don't have values
        await client.query(`
            UPDATE classes SET year = 1, section = 'A' WHERE id = 1 AND year IS NULL
        `);
        await client.query(`
            UPDATE classes SET year = 1, section = 'B' WHERE id = 2 AND year IS NULL
        `);
        await client.query(`
            UPDATE classes SET year = 2, section = 'A' WHERE id = 3 AND year IS NULL
        `);

        // Students table with roll numbers
        await client.query(`
            CREATE TABLE IF NOT EXISTS students (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                roll_no INTEGER NOT NULL,
                class_id INTEGER REFERENCES classes(id),
                student_name VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(roll_no, class_id)
            )
        `);

        // Subjects table
        await client.query(`
            CREATE TABLE IF NOT EXISTS subjects (
                id SERIAL PRIMARY KEY,
                subject_name VARCHAR(100) NOT NULL,
                subject_code VARCHAR(20),
                subject_type VARCHAR(20) DEFAULT 'theory' CHECK(subject_type IN ('theory', 'lab', 'elective')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Timetable periods table
        await client.query(`
            CREATE TABLE IF NOT EXISTS timetable_periods (
                id SERIAL PRIMARY KEY,
                class_id INTEGER REFERENCES classes(id),
                day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 7), -- 1=Monday, 7=Sunday
                period_number INTEGER NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                subject_id INTEGER REFERENCES subjects(id),
                teacher_id INTEGER REFERENCES users(id),
                is_break BOOLEAN DEFAULT FALSE,
                break_name VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(class_id, day_of_week, period_number)
            )
        `);
        
        // Attendance records table (updated for period-wise attendance)
        await client.query(`
            CREATE TABLE IF NOT EXISTS attendance (
                id SERIAL PRIMARY KEY,
                student_id INTEGER REFERENCES students(id),
                class_id INTEGER REFERENCES classes(id),
                period_id INTEGER REFERENCES timetable_periods(id),
                date DATE NOT NULL,
                status VARCHAR(1) NOT NULL CHECK(status IN ('P', 'A')),
                marked_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(student_id, date, period_id)
            )
        `);
        
        // Add period_id column to existing attendance table if it doesn't exist
        await client.query(`
            ALTER TABLE attendance 
            ADD COLUMN IF NOT EXISTS period_id INTEGER
        `);
        
        // Drop existing foreign key constraint if it exists
        await client.query(`
            ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_period_id_fkey
        `);
        
        // Add foreign key constraint with CASCADE DELETE
        await client.query(`
            ALTER TABLE attendance 
            ADD CONSTRAINT attendance_period_id_fkey 
            FOREIGN KEY (period_id) REFERENCES timetable_periods(id) ON DELETE CASCADE
        `);
        
        // Update the unique constraint to include period_id
        await client.query(`
            ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_student_id_date_key
        `);
        
        await client.query(`
            ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_student_date_period_unique
        `);
        
        // Add the main unique constraint for period-wise attendance
        await client.query(`
            ALTER TABLE attendance 
            ADD CONSTRAINT attendance_student_date_period_unique 
            UNIQUE(student_id, date, period_id)
        `);
        
        // Note: PostgreSQL doesn't support partial unique constraints with WHERE clause in ALTER TABLE
        // We'll handle manual attendance uniqueness in the application logic instead
        console.log('ℹ️  Manual attendance uniqueness will be handled in application logic');

        // Insert sample data
        // Create admin (HOD) account
        await client.query(`
            INSERT INTO users (username, password, role, name) 
            VALUES ('hod', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', 'Head of Department - IT')
            ON CONFLICT (username) DO NOTHING
        `);

        // Create teacher account with encrypted password (password = "password")
        await client.query(`
            INSERT INTO users (username, password, role, name) 
            VALUES ('teacher1', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'teacher', 'Sir CR Reddey')
            ON CONFLICT (username) DO NOTHING
        `);

        // Get teacher ID
        const teacherResult = await client.query('SELECT id FROM users WHERE username = $1', ['teacher1']);
        const teacherId = teacherResult.rows[0]?.id || 2;

        // Create sample classes for all years
        const sampleClasses = [
            { id: 1, name: '1st Year IT-A', year: 1, section: 'A', students: 0 },
            { id: 2, name: '1st Year IT-B', year: 1, section: 'B', students: 0 },
            { id: 3, name: '2nd Year IT-A', year: 2, section: 'A', students: 0 },
            { id: 4, name: '2nd Year IT-B', year: 2, section: 'B', students: 0 },
            { id: 5, name: '3rd Year IT-A', year: 3, section: 'A', students: 25 },
            { id: 6, name: '3rd Year IT-B', year: 3, section: 'B', students: 23 },
            { id: 7, name: '4th Year IT-A', year: 4, section: 'A', students: 0 },
            { id: 8, name: '4th Year IT-B', year: 4, section: 'B', students: 0 }
        ];

        for (const cls of sampleClasses) {
            await client.query(`
                INSERT INTO classes (id, class_name, teacher_id, total_students, year, section) 
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO NOTHING
            `, [cls.id, cls.name, teacherId, cls.students, cls.year, cls.section]);
        }

        // Only insert sample data if no students exist yet (avoid destroying user data)
        const existingStudentsCount = await client.query('SELECT COUNT(*) FROM students');
        const hasExistingStudents = parseInt(existingStudentsCount.rows[0].count) > 0;
        
        if (hasExistingStudents) {
            console.log('⚠️  Existing student data found - skipping sample data insertion to preserve user data');
        } else {
            console.log('💡 No existing students found - inserting sample data');
            
            // Insert sample students for 3rd Year IT-A (Class ID: 5)
        const studentsClassA = [
            'Arjun Sharma', 'Priya Patel', 'Rahul Kumar', 'Sneha Reddy', 'Vikram Singh',
            'Ananya Das', 'Karthik Nair', 'Divya Iyer', 'Rohit Gupta', 'Meera Joshi',
            'Aditya Verma', 'Kavya Menon', 'Siddharth Rao', 'Pooja Agarwal', 'Nikhil Bhatt',
            'Riya Kulkarni', 'Harsh Pandey', 'Shruti Desai', 'Amith Saxena', 'Nidhi Kapoor',
            'Dev Malhotra', 'Ishita Bansal', 'Gaurav Sinha', 'Swathi Pillai', 'Abhishek Tiwari'
        ];
        
        // Insert sample students for 3rd Year IT-B (Class ID: 6)
        const studentsClassB = [
            'Rohan Mishra', 'Sakshi Jain', 'Varun Chandra', 'Kritika Dubey', 'Aryan Chopra',
            'Neha Sharma', 'Ayush Thakur', 'Tanvi Agrawal', 'Vishal Yadav', 'Akshara Mehta',
            'Deepak Shah', 'Priyanka Goyal', 'Rajesh Kumar', 'Aditi Bose', 'Manish Gupta',
            'Shreya Soni', 'Tushar Rathi', 'Megha Singh', 'Kartik Joshi', 'Pallavi Dixit',
            'Sourav Das', 'Richa Arora', 'Mohit Bajaj'
        ];

        // Insert students for 3rd Year classes only
        const bcrypt = require('bcryptjs');
        
        // Insert students for 3rd Year IT-A with user accounts
        for (let i = 0; i < studentsClassA.length; i++) {
            const registerId = `3A${String(i + 1).padStart(3, '0')}`; // 3A001, 3A002, etc.
            const username = registerId;
            const hashedPassword = await bcrypt.hash(registerId, 10);
            
            // Create user account
            const userResult = await client.query(`
                INSERT INTO users (username, password, role, name, register_id)
                VALUES ($1, $2, 'student', $3, $4)
                ON CONFLICT (username) DO NOTHING
                RETURNING id
            `, [username, hashedPassword, studentsClassA[i], registerId]);
            
            if (userResult.rows.length > 0) {
                const userId = userResult.rows[0].id;
                
                // Add to students table
                await client.query(`
                    INSERT INTO students (user_id, roll_no, class_id, student_name) 
                    VALUES ($1, $2, 5, $3)
                    ON CONFLICT (roll_no, class_id) DO NOTHING
                `, [userId, i + 1, studentsClassA[i]]);
            }
        }
        
        // Insert students for 3rd Year IT-B with user accounts
        for (let i = 0; i < studentsClassB.length; i++) {
            const registerId = `3B${String(i + 1).padStart(3, '0')}`; // 3B001, 3B002, etc.
            const username = registerId;
            const hashedPassword = await bcrypt.hash(registerId, 10);
            
            // Create user account
            const userResult = await client.query(`
                INSERT INTO users (username, password, role, name, register_id)
                VALUES ($1, $2, 'student', $3, $4)
                ON CONFLICT (username) DO NOTHING
                RETURNING id
            `, [username, hashedPassword, studentsClassB[i], registerId]);
            
            if (userResult.rows.length > 0) {
                const userId = userResult.rows[0].id;
                
                // Add to students table
                await client.query(`
                    INSERT INTO students (user_id, roll_no, class_id, student_name) 
                    VALUES ($1, $2, 6, $3)
                    ON CONFLICT (roll_no, class_id) DO NOTHING
                `, [userId, i + 1, studentsClassB[i]]);
            }
        } // End of conditional sample data insertion
        } // Close the else block
        
        // Always update class student counts to reflect current reality
        await client.query(`
            UPDATE classes SET total_students = (
                SELECT COUNT(*) FROM students WHERE class_id = classes.id
            )
        `);
        
        // Insert sample subjects if none exist
        const existingSubjects = await client.query('SELECT COUNT(*) FROM subjects');
        if (parseInt(existingSubjects.rows[0].count) === 0) {
            const sampleSubjects = [
                { name: 'Java Programming', code: 'IT301', type: 'theory' },
                { name: 'Data Structures', code: 'IT302', type: 'theory' },
                { name: 'Operating Systems', code: 'IT303', type: 'theory' },
                { name: 'Database Management', code: 'IT304', type: 'theory' },
                { name: 'Computer Networks', code: 'IT305', type: 'theory' },
                { name: 'Software Engineering', code: 'IT306', type: 'theory' },
                { name: 'Java Lab', code: 'IT301L', type: 'lab' },
                { name: 'Database Lab', code: 'IT304L', type: 'lab' },
                { name: 'Elective Subject', code: 'IT307', type: 'elective' }
            ];
            
            for (const subject of sampleSubjects) {
                await client.query(`
                    INSERT INTO subjects (subject_name, subject_code, subject_type)
                    VALUES ($1, $2, $3)
                `, [subject.name, subject.code, subject.type]);
            }
            
            console.log('✅ Sample subjects inserted successfully!');
        }
        
        // Bookmarks/Festivals table for marking special days
        await client.query(`
            CREATE TABLE IF NOT EXISTS bookmarks (
                id SERIAL PRIMARY KEY,
                date DATE NOT NULL,
                title VARCHAR(100) NOT NULL,
                description TEXT,
                marked_by INTEGER REFERENCES users(id),
                class_id INTEGER REFERENCES classes(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(date, class_id)
            )
        `);
        
        // Fix sequences for all tables to prevent primary key conflicts
        await client.query(`
            SELECT setval('classes_id_seq', COALESCE((SELECT MAX(id) FROM classes), 1))
        `);
        
        await client.query(`
            SELECT setval('users_id_seq', COALESCE((SELECT MAX(id) FROM users), 1))
        `);
        
        await client.query(`
            SELECT setval('students_id_seq', COALESCE((SELECT MAX(id) FROM students), 1))
        `);
        
        await client.query(`
            SELECT setval('subjects_id_seq', COALESCE((SELECT MAX(id) FROM subjects), 1))
        `);
        
        await client.query(`
            SELECT setval('timetable_periods_id_seq', COALESCE((SELECT MAX(id) FROM timetable_periods), 1))
        `);
        
        await client.query(`
            SELECT setval('bookmarks_id_seq', COALESCE((SELECT MAX(id) FROM bookmarks), 1))
        `);

        await client.query('COMMIT');
        console.log('✅ Database tables created and sample data inserted successfully!');
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error initializing database:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Helper function to execute queries
const query = async (text, params = []) => {
    const client = await pool.connect();
    try {
        const result = await client.query(text, params);
        return result;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    } finally {
        client.release();
    }
};

// Helper function to get a single row
const queryOne = async (text, params = []) => {
    const result = await query(text, params);
    return result.rows[0] || null;
};

// Helper function to get all rows
const queryAll = async (text, params = []) => {
    const result = await query(text, params);
    return result.rows;
};

module.exports = { 
    pool, 
    query, 
    queryOne, 
    queryAll, 
    initDatabase 
};
