require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { queryAll, queryOne } = require('./config/postgres');

const app = express();

// Minimal setup to test the dashboard route
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Simulate a teacher session
const simulateTeacherSession = (req, res, next) => {
    req.session.user = {
        id: 27,  // From our test, teacher1 has ID 27
        username: 'teacher1',
        role: 'teacher',
        name: 'Sir CR Reddey'
    };
    next();
};

// Test the exact dashboard route logic
app.get('/test-dashboard', simulateTeacherSession, async (req, res) => {
    console.log('=== TEACHER DASHBOARD DEBUG ===');
    console.log('Session User:', req.session.user);
    console.log('User ID:', req.session.user.id);
    
    try {
        console.log('\n1. Executing classes query...');
        const classes = await queryAll('SELECT * FROM classes WHERE teacher_id = $1', [req.session.user.id]);
        console.log('Query result:', classes.length, 'classes found');
        
        console.log('\n2. Classes details:');
        classes.forEach((cls, index) => {
            console.log(`   ${index + 1}. ${cls.class_name}`);
            console.log(`      ID: ${cls.id}`);
            console.log(`      Year: ${cls.year}`);
            console.log(`      Section: ${cls.section}`);
            console.log(`      Students: ${cls.total_students}`);
            console.log(`      Teacher ID: ${cls.teacher_id}`);
        });
        
        console.log('\n3. Testing view data preparation...');
        const viewData = {
            classes: classes,
            user: req.session.user,
            error: null
        };
        console.log('View data prepared successfully');
        
        // Test if dashboard would render without errors
        res.json({
            success: true,
            message: 'Dashboard data retrieved successfully',
            classCount: classes.length,
            totalStudents: classes.reduce((total, cls) => total + cls.total_students, 0),
            classes: classes.map(cls => ({
                id: cls.id,
                name: cls.class_name,
                students: cls.total_students,
                year: cls.year,
                section: cls.section
            }))
        });
        
    } catch (err) {
        console.error('\n❌ Dashboard error:', err);
        console.error('Error details:', err.message);
        console.error('Error stack:', err.stack);
        
        res.json({
            success: false,
            error: err.message,
            stack: err.stack
        });
    }
});

// Test route to check what happens when we access attendance
app.get('/test-attendance/:classId', simulateTeacherSession, async (req, res) => {
    const classId = req.params.classId;
    const today = new Date().toISOString().split('T')[0];
    
    console.log('\n=== ATTENDANCE PAGE DEBUG ===');
    console.log('Class ID:', classId);
    console.log('Today:', today);
    console.log('User ID:', req.session.user.id);
    
    try {
        // Get class info and students (exact same query as in server.js)
        console.log('\n1. Getting class info...');
        const classInfo = await queryOne('SELECT * FROM classes WHERE id = $1', [classId]);
        console.log('Class found:', classInfo ? 'YES' : 'NO');
        if (classInfo) {
            console.log('Class name:', classInfo.class_name);
            console.log('Teacher ID:', classInfo.teacher_id);
        }
        
        console.log('\n2. Getting students with attendance...');
        const students = await queryAll(`
            SELECT s.*, a.status 
            FROM students s 
            LEFT JOIN attendance a ON s.id = a.student_id AND a.date = $1
            WHERE s.class_id = $2 
            ORDER BY s.roll_no
        `, [today, classId]);
        
        console.log('Students found:', students.length);
        students.forEach((student, index) => {
            console.log(`   ${index + 1}. ${student.student_name} (Roll: ${student.roll_no}, Status: ${student.status || 'Not marked'})`);
        });
        
        res.json({
            success: true,
            classInfo: classInfo,
            studentsCount: students.length,
            studentsWithAttendance: students.filter(s => s.status).length,
            students: students.slice(0, 5) // Show first 5 for brevity
        });
        
    } catch (err) {
        console.error('\n❌ Attendance page error:', err);
        res.json({
            success: false,
            error: err.message
        });
    }
});

// Start test server
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`\n🔍 Dashboard Debug Server running on http://localhost:${PORT}`);
    console.log('\nTest URLs:');
    console.log('- http://localhost:3001/test-dashboard');
    console.log('- http://localhost:3001/test-attendance/5 (3rd Year IT-A)');
    console.log('- http://localhost:3001/test-attendance/6 (3rd Year IT-B)');
    console.log('\nRun these tests in your browser to see detailed debug output.\n');
});
