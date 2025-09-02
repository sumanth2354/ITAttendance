const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'attendance.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
const initDatabase = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Users table (teachers and students)
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    role VARCHAR(10) NOT NULL CHECK(role IN ('teacher', 'student')),
                    name VARCHAR(100) NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Classes table
            db.run(`
                CREATE TABLE IF NOT EXISTS classes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    class_name VARCHAR(100) NOT NULL,
                    teacher_id INTEGER,
                    total_students INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (teacher_id) REFERENCES users(id)
                )
            `);

            // Students table with roll numbers
            db.run(`
                CREATE TABLE IF NOT EXISTS students (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    roll_no INTEGER NOT NULL,
                    class_id INTEGER,
                    student_name VARCHAR(100) NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (class_id) REFERENCES classes(id),
                    UNIQUE(roll_no, class_id)
                )
            `);

            // Attendance records table
            db.run(`
                CREATE TABLE IF NOT EXISTS attendance (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id INTEGER,
                    class_id INTEGER,
                    date DATE NOT NULL,
                    status VARCHAR(1) NOT NULL CHECK(status IN ('P', 'A')),
                    marked_by INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (student_id) REFERENCES students(id),
                    FOREIGN KEY (class_id) REFERENCES classes(id),
                    FOREIGN KEY (marked_by) REFERENCES users(id),
                    UNIQUE(student_id, date)
                )
            `);

            // Insert sample data
            // Create teacher account
            db.run(`
                INSERT OR IGNORE INTO users (username, password, role, name) 
                VALUES ('teacher1', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'teacher', 'Sir CR Reddey')
            `);

            // Create classes
            db.run(`
                INSERT OR IGNORE INTO classes (id, class_name, teacher_id, total_students) 
                VALUES (1, 'IT 3rd Year - Class 1', 1, 70)
            `);
            
            db.run(`
                INSERT OR IGNORE INTO classes (id, class_name, teacher_id, total_students) 
                VALUES (2, 'IT 3rd Year - Class 2', 1, 65)
            `);
            
            db.run(`
                INSERT OR IGNORE INTO classes (id, class_name, teacher_id, total_students) 
                VALUES (3, 'IT 3rd Year - Class 3', 1, 68)
            `);

            // Insert sample students for Class 1
            const studentNames = [
                'Bob', 'Alice', 'Charlie', 'Diana', 'Eva', 'Frank', 'Grace', 'Henry',
                'Iris', 'Jack', 'Kate', 'Liam', 'Maya', 'Noah', 'Olivia', 'Paul',
                'Quinn', 'Rachel', 'Sam', 'Tina', 'Uma', 'Victor', 'Wendy', 'Xavier',
                'Yara', 'Zoe', 'Adam', 'Beth', 'Chris', 'Dora', 'Ethan', 'Fiona',
                'George', 'Hannah', 'Ian', 'Julia', 'Kevin', 'Luna', 'Mark', 'Nina',
                'Oscar', 'Penny', 'Quincy', 'Rose', 'Steve', 'Tara', 'Ulrich', 'Vera',
                'Will', 'Xara', 'Yale', 'Zara', 'Alex', 'Bella', 'Carl', 'Donna',
                'Eric', 'Flora', 'Gary', 'Helen', 'Ivan', 'Jane', 'Kyle', 'Lisa',
                'Mike', 'Nora', 'Owen', 'Pam', 'Queen', 'Rick', 'Sara', 'Tom'
            ];

            studentNames.forEach((name, index) => {
                db.run(`
                    INSERT OR IGNORE INTO students (roll_no, class_id, student_name) 
                    VALUES (?, 1, ?)
                `, [index + 1, name]);
            });

            resolve();
        });
    });
};

module.exports = { db, initDatabase };
