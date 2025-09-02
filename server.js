require('dotenv').config();
// Force server timezone to IST if not provided by environment
process.env.TZ = process.env.TZ || 'Asia/Kolkata';
const TIME_OFFSET_MINUTES = parseInt(process.env.TIME_OFFSET_MINUTES || '0', 10) || 0;
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const path = require('path');
const { query, queryOne, queryAll, initDatabase } = require('./config/postgres');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

app.use(session({
    secret: 'attendance-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

const requireTeacher = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'teacher') {
        next();
    } else {
        res.redirect('/login');
    }
};

const requireAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.redirect('/login');
    }
};

// Helper functions for timetable-based functionality
const formatDateLocal = (dateInput) => {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
// Compute time in IST explicitly to avoid server timezone differences (e.g., Vercel UTC)
const getNowIST = () => new Date(Date.now() + (5.5 * 60 * 60 * 1000) + (TIME_OFFSET_MINUTES * 60 * 1000)); // UTC+5:30 + manual offset

const getCurrentDayOfWeek = () => {
    const ist = getNowIST();
    const dayOfWeek = ist.getUTCDay(); // 0 = Sunday
    return dayOfWeek === 0 ? 7 : dayOfWeek;
};

const getCurrentTime = () => {
    const ist = getNowIST();
    const hours = String(ist.getUTCHours()).padStart(2, '0');
    const minutes = String(ist.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
};

const getCurrentPeriod = async (classId) => {
    const currentDay = getCurrentDayOfWeek();
    const currentTime = getCurrentTime();
    
    try {
        const currentPeriod = await queryOne(`
            SELECT 
                tp.*,
                s.subject_name,
                s.subject_code,
                u.name as teacher_name
            FROM timetable_periods tp
            LEFT JOIN subjects s ON tp.subject_id = s.id
            LEFT JOIN users u ON tp.teacher_id = u.id
            WHERE tp.class_id = $1 
            AND tp.day_of_week = $2 
            AND tp.start_time <= $3 
            AND tp.end_time >= $3
            ORDER BY tp.period_number
            LIMIT 1
        `, [classId, currentDay, currentTime]);
        
        return currentPeriod;
    } catch (error) {
        console.error('Error getting current period:', error);
        return null;
    }
};

const getTeacherCurrentClasses = async (teacherId) => {
    const currentDay = getCurrentDayOfWeek();
    const currentTime = getCurrentTime();
    
    try {
        const currentClasses = await queryAll(`
            SELECT DISTINCT 
                c.*,
                COALESCE(student_counts.student_count, 0) as total_students,
                tp.id as period_id,
                tp.period_number,
                tp.start_time,
                tp.end_time,
                tp.is_break,
                tp.break_name,
                s.subject_name,
                s.subject_code
            FROM classes c
            JOIN timetable_periods tp ON c.id = tp.class_id
            LEFT JOIN subjects s ON tp.subject_id = s.id
            LEFT JOIN (
                SELECT class_id, COUNT(*) as student_count 
                FROM students 
                GROUP BY class_id
            ) student_counts ON c.id = student_counts.class_id
            WHERE tp.teacher_id = $1 
            AND tp.day_of_week = $2 
            AND tp.start_time <= $3 
            AND tp.end_time >= $3
            AND tp.is_break = false
            ORDER BY c.year, c.section
        `, [teacherId, currentDay, currentTime]);
        
        return currentClasses;
    } catch (error) {
        console.error('Error getting teacher current classes:', error);
        return [];
    }
};

// Routes
app.get('/', (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'teacher') {
            res.redirect('/teacher/dashboard');
        } else {
            res.redirect('/student/dashboard');
        }
    } else {
        res.redirect('/login');
    }
});

app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const user = await queryOne('SELECT * FROM users WHERE username = $1', [username]);
        
        if (!user) {
            return res.render('login', { error: 'Invalid username or password' });
        }
        
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.render('login', { error: 'Invalid username or password' });
        }
        
        req.session.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            name: user.name
        };
        
        if (user.role === 'admin') {
            res.redirect('/admin/dashboard');
        } else if (user.role === 'teacher') {
            res.redirect('/teacher/dashboard');
        } else {
            res.redirect('/student/dashboard');
        }
    } catch (err) {
        console.error('Login error:', err);
        res.render('login', { error: 'Database error' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// Teacher routes
app.get('/teacher/dashboard', requireTeacher, async (req, res) => {
    try {
        // Add cache control headers to prevent caching
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        
        console.log(`[${new Date().toISOString()}] Teacher dashboard accessed by: ${req.session.user.name} (ID: ${req.session.user.id})`);
        
        // Get current classes for this teacher based on timetable
        const currentClasses = await getTeacherCurrentClasses(req.session.user.id);
        
        // Get current day and time for display
        const currentDay = getCurrentDayOfWeek();
        const currentTime = getCurrentTime();
        const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const currentDayName = dayNames[currentDay];
        
        console.log(`[${new Date().toISOString()}] Current day: ${currentDayName}, Time: ${currentTime}`);
        console.log(`[${new Date().toISOString()}] Found ${currentClasses.length} current classes for teacher ${req.session.user.name}`);
        
        // If no current classes, show only the classes assigned to this teacher (from their timetable)
        let allClasses = [];
        if (currentClasses.length === 0) {
            allClasses = await queryAll(`
                SELECT DISTINCT c.*, COALESCE(student_counts.student_count, 0) as total_students
                FROM classes c
                JOIN timetable_periods tp ON c.id = tp.class_id
                LEFT JOIN (
                    SELECT class_id, COUNT(*) as student_count 
                    FROM students 
                    GROUP BY class_id
                ) student_counts ON c.id = student_counts.class_id
                WHERE tp.teacher_id = $1 AND tp.is_break = false
                ORDER BY c.year, c.section
            `, [req.session.user.id]);
            console.log(`[${new Date().toISOString()}] No current classes found, showing ${allClasses.length} assigned classes for teacher ${req.session.user.name}`);
        }
        
        // If teacher has no timetable assignments at all, show all available classes as a fallback
        if (allClasses.length === 0) {
            allClasses = await queryAll(`
                SELECT DISTINCT c.*, COALESCE(student_counts.student_count, 0) as total_students
                FROM classes c
                LEFT JOIN (
                    SELECT class_id, COUNT(*) as student_count 
                    FROM students 
                    GROUP BY class_id
                ) student_counts ON c.id = student_counts.class_id
                ORDER BY c.year, c.section
            `);
            console.log(`[${new Date().toISOString()}] Teacher has no timetable assignments, showing ${allClasses.length} available classes as fallback`);
        }
        
        // Get schedule data for all classes assigned to this teacher
        let allAssignedClasses = await queryAll(`
            SELECT DISTINCT c.*, COALESCE(student_counts.student_count, 0) as total_students
            FROM classes c
            JOIN timetable_periods tp ON c.id = tp.class_id
            LEFT JOIN (
                SELECT class_id, COUNT(*) as student_count 
                FROM students 
                GROUP BY class_id
            ) student_counts ON c.id = student_counts.class_id
            WHERE tp.teacher_id = $1 AND tp.is_break = false
            ORDER BY c.year, c.section
        `, [req.session.user.id]);
        
        // If no assigned classes, use the fallback classes
        if (allAssignedClasses.length === 0) {
            allAssignedClasses = allClasses;
        }
        
        // Get schedule details for each class
        for (const cls of allAssignedClasses) {
            // Try to get schedule for this class (will be empty if teacher has no timetable periods)
            const schedule = await queryAll(`
                SELECT 
                    tp.day_of_week,
                    tp.period_number,
                    tp.start_time,
                    tp.end_time,
                    tp.is_break,
                    s.subject_name,
                    s.subject_code
                FROM timetable_periods tp
                LEFT JOIN subjects s ON tp.subject_id = s.id
                WHERE tp.class_id = $1 AND tp.teacher_id = $2 AND tp.is_break = false
                ORDER BY tp.day_of_week, tp.period_number
            `, [cls.id, req.session.user.id]);
            
            cls.schedule = schedule;
            if (schedule.length === 0) {
                console.log(`[${new Date().toISOString()}] Class ${cls.class_name} has no timetable periods for this teacher`);
            } else {
                console.log(`[${new Date().toISOString()}] Class ${cls.class_name} schedule:`, schedule);
            }
        }
        
        // Calculate period-specific attendance for current classes (THIS TEACHER only)
        const today = new Date().toISOString().split('T')[0];
        for (const cls of currentClasses) {
            // Get current period for THIS TEACHER in this class
            const currentPeriod = await queryOne(`
                SELECT 
                    tp.*,
                    s.subject_name,
                    s.subject_code
                FROM timetable_periods tp
                LEFT JOIN subjects s ON tp.subject_id = s.id
                WHERE tp.class_id = $1 
                AND tp.teacher_id = $2
                AND tp.day_of_week = $3 
                AND tp.start_time <= $4 
                AND tp.end_time >= $4
                AND tp.is_break = false
                ORDER BY tp.period_number
                LIMIT 1
            `, [cls.id, req.session.user.id, getCurrentDayOfWeek(), getCurrentTime()]);
            
            if (currentPeriod) {
                const attendanceCount = await queryOne(
                    'SELECT COUNT(*) as count FROM attendance WHERE class_id = $1 AND date = $2 AND period_id = $3',
                    [cls.id, today, currentPeriod.id]
                );
                cls.attendance_count = parseInt(attendanceCount.count);
            } else {
                cls.attendance_count = 0;
            }
        }
        
        res.render('teacher/dashboard', { 
            classes: currentClasses.length > 0 ? currentClasses : allClasses,
            currentClasses,
            allClasses: allClasses.length > 0 ? allClasses : [],
            allAssignedClasses,
            currentDayName,
            currentTime,
            isCurrentPeriod: currentClasses.length > 0,
            user: req.session.user, 
            error: null 
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.render('teacher/dashboard', { 
            classes: [], 
            currentClasses: [],
            allClasses: [],
            currentDayName: '',
            currentTime: '',
            isCurrentPeriod: false,
            user: req.session.user, 
            error: 'Database error' 
        });
    }
});

// API route to refresh dashboard data
app.get('/teacher/dashboard/refresh', requireTeacher, async (req, res) => {
    try {
        console.log(`[${new Date().toISOString()}] Dashboard refresh requested by: ${req.session.user.name}`);
        
        // Show only classes assigned to this teacher from their timetable
        const classes = await queryAll(`
            SELECT DISTINCT c.*, COALESCE(student_counts.student_count, 0) as total_students
            FROM classes c
            JOIN timetable_periods tp ON c.id = tp.class_id
            LEFT JOIN (
                SELECT class_id, COUNT(*) as student_count 
                FROM students 
                GROUP BY class_id
            ) student_counts ON c.id = student_counts.class_id
            WHERE tp.teacher_id = $1 AND tp.is_break = false
            ORDER BY c.year, c.section
        `, [req.session.user.id]);
        
        // Get schedule data for all classes assigned to this teacher
        for (const cls of classes) {
            const schedule = await queryAll(`
                SELECT 
                    tp.day_of_week,
                    tp.period_number,
                    tp.start_time,
                    tp.end_time,
                    tp.is_break,
                    s.subject_name,
                    s.subject_code
                FROM timetable_periods tp
                LEFT JOIN subjects s ON tp.subject_id = s.id
                WHERE tp.class_id = $1 AND tp.teacher_id = $2 AND tp.is_break = false
                ORDER BY tp.day_of_week, tp.period_number
            `, [cls.id, req.session.user.id]);
            
            cls.schedule = schedule;
        }
        
        // Calculate today's attendance statistics across all classes (period-specific)
        const today = new Date().toISOString().split('T')[0];
        let totalAttendanceToday = 0;
        let totalStudentsToday = 0;
        
        for (const cls of classes) {
            // Get current period for THIS TEACHER in this class
            const currentPeriod = await queryOne(`
                SELECT 
                    tp.*,
                    s.subject_name,
                    s.subject_code
                FROM timetable_periods tp
                LEFT JOIN subjects s ON tp.subject_id = s.id
                WHERE tp.class_id = $1 
                AND tp.teacher_id = $2
                AND tp.day_of_week = $3 
                AND tp.start_time <= $4 
                AND tp.end_time >= $4
                AND tp.is_break = false
                ORDER BY tp.period_number
                LIMIT 1
            `, [cls.id, req.session.user.id, getCurrentDayOfWeek(), getCurrentTime()]);
            
            if (currentPeriod) {
                // Count attendance only for THIS TEACHER's current period
                const attendanceCount = await queryOne(
                    'SELECT COUNT(*) as count FROM attendance WHERE class_id = $1 AND date = $2 AND period_id = $3',
                    [cls.id, today, currentPeriod.id]
                );
                totalAttendanceToday += parseInt(attendanceCount.count);
            }
            totalStudentsToday += cls.total_students;
        }
        
        res.json({
            success: true,
            data: {
                totalClasses: classes.length,
                totalStudents: classes.reduce((total, cls) => total + cls.total_students, 0),
                attendanceToday: totalAttendanceToday,
                studentsToday: totalStudentsToday,
                classes: classes.map(cls => ({
                    id: cls.id,
                    name: cls.class_name,
                    students: cls.total_students,
                    year: cls.year,
                    section: cls.section
                })),
                lastUpdated: new Date().toISOString()
            }
        });
    } catch (err) {
        console.error('Dashboard refresh error:', err);
        res.json({ success: false, error: err.message });
    }
});

app.get('/teacher/class/:classId/attendance', requireTeacher, async (req, res) => {
    const classId = req.params.classId;
    const today = new Date().toISOString().split('T')[0];
    const teacherId = req.session.user.id;
    
    try {
        // First check if this teacher is assigned to teach this class
        const teacherAssignment = await queryOne(`
            SELECT DISTINCT tp.id
            FROM timetable_periods tp
            WHERE tp.class_id = $1 AND tp.teacher_id = $2 AND tp.is_break = false
        `, [classId, teacherId]);
        
        if (!teacherAssignment) {
            console.log(`[${new Date().toISOString()}] Teacher ${req.session.user.name} attempted to access class ${classId} without assignment`);
            return res.redirect('/teacher/dashboard');
        }
        
        // Get class info and students
        const classInfo = await queryOne('SELECT * FROM classes WHERE id = $1', [classId]);
        if (!classInfo) {
            return res.redirect('/teacher/dashboard');
        }
        
        // Get current period for THIS TEACHER in this class
        const currentPeriod = await queryOne(`
            SELECT 
                tp.*,
                s.subject_name,
                s.subject_code
            FROM timetable_periods tp
            LEFT JOIN subjects s ON tp.subject_id = s.id
            WHERE tp.class_id = $1 
            AND tp.teacher_id = $2
            AND tp.day_of_week = $3 
            AND tp.start_time <= $4 
            AND tp.end_time >= $4
            AND tp.is_break = false
            ORDER BY tp.period_number
            LIMIT 1
        `, [classId, teacherId, getCurrentDayOfWeek(), getCurrentTime()]);
        
        // Get students with period-specific attendance for THIS TEACHER's period
        let students;
        if (currentPeriod) {
            students = await queryAll(`
                SELECT s.*, a.status, a.period_id
                FROM students s 
                LEFT JOIN attendance a ON s.id = a.student_id AND a.date = $1 AND a.period_id = $2
                WHERE s.class_id = $3 
                ORDER BY s.roll_no
            `, [today, currentPeriod.id, classId]);
        } else {
            // If no current period for THIS TEACHER, show students without attendance status
            students = await queryAll(`
                SELECT s.*, NULL as status, NULL as period_id
                FROM students s 
                WHERE s.class_id = $1 
                ORDER BY s.roll_no
            `, [classId]);
        }
        
        // Get current period information for this teacher and class
        const currentDay = getCurrentDayOfWeek();
        const currentTime = getCurrentTime();
        
        const currentPeriodInfo = await queryOne(`
            SELECT 
                tp.*,
                s.subject_name,
                s.subject_code
            FROM timetable_periods tp
            LEFT JOIN subjects s ON tp.subject_id = s.id
            WHERE tp.class_id = $1 
            AND tp.teacher_id = $2
            AND tp.day_of_week = $3 
            AND tp.start_time <= $4 
            AND tp.end_time >= $4
            AND tp.is_break = false
            ORDER BY tp.period_number
            LIMIT 1
        `, [classId, teacherId, currentDay, currentTime]);
        
        // Get teacher's upcoming period for this class (next 2 hours)
        const nextTime = new Date();
        nextTime.setHours(nextTime.getHours() + 2);
        const nextTimeString = nextTime.toTimeString().slice(0, 5);
        
        const upcomingPeriod = await queryOne(`
            SELECT 
                tp.*,
                s.subject_name,
                s.subject_code
            FROM timetable_periods tp
            LEFT JOIN subjects s ON tp.subject_id = s.id
            WHERE tp.class_id = $1 
            AND tp.teacher_id = $2
            AND tp.day_of_week = $3 
            AND tp.start_time > $4
            AND tp.start_time <= $5
            AND tp.is_break = false
            ORDER BY tp.start_time
            LIMIT 1
        `, [classId, teacherId, currentDay, currentTime, nextTimeString]);
        
        const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const currentDayName = dayNames[currentDay];
        
        res.render('teacher/attendance', { 
            classInfo, 
            students, 
            date: today,
            currentPeriodInfo,
            upcomingPeriod,
            currentTime,
            currentDayName,
            user: req.session.user,
            error: null 
        });
    } catch (err) {
        console.error('Attendance page error:', err);
        res.redirect('/teacher/dashboard');
    }
});

app.post('/teacher/mark-attendance', requireTeacher, async (req, res) => {
    const { studentId, classId, status, date } = req.body;
    
    try {
        // Get current period for THIS TEACHER in this class
        const currentPeriod = await queryOne(`
            SELECT 
                tp.*,
                s.subject_name,
                s.subject_code
            FROM timetable_periods tp
            LEFT JOIN subjects s ON tp.subject_id = s.id
            WHERE tp.class_id = $1 
            AND tp.teacher_id = $2
            AND tp.day_of_week = $3 
            AND tp.start_time <= $4 
            AND tp.end_time >= $4
            AND tp.is_break = false
            ORDER BY tp.period_number
            LIMIT 1
        `, [classId, req.session.user.id, getCurrentDayOfWeek(), getCurrentTime()]);
        
        if (!currentPeriod) {
            return res.json({ 
                success: false, 
                error: 'No active period found for you in this class. Attendance can only be marked during your scheduled teaching periods.' 
            });
        }
        
        // Only mark attendance for the current period when THIS TEACHER is teaching
        await query(`
            INSERT INTO attendance (student_id, class_id, period_id, date, status, marked_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (student_id, date, period_id) 
            DO UPDATE SET status = $5, marked_by = $6
        `, [studentId, classId, currentPeriod.id, date, status, req.session.user.id]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Mark attendance error:', err);
        res.json({ success: false, error: 'Failed to mark attendance' });
    }
});

// Teacher timetable view
app.get('/teacher/timetable', requireTeacher, async (req, res) => {
    try {
        const teacherId = req.session.user.id;
        const currentDay = getCurrentDayOfWeek();
        const currentTime = getCurrentTime();
        const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const currentDayName = dayNames[currentDay];
        
        // Get all periods for this teacher
        const allPeriods = await queryAll(`
            SELECT 
                tp.*,
                s.subject_name,
                s.subject_code,
                c.class_name,
                c.id as class_id
            FROM timetable_periods tp
            JOIN subjects s ON tp.subject_id = s.id
            JOIN classes c ON tp.class_id = c.id
            WHERE tp.teacher_id = $1 AND tp.is_break = false
            ORDER BY tp.day_of_week, tp.period_number
        `, [teacherId]);
        
        // Organize timetable by days
        const timetable = {};
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        
        // Initialize days
        days.forEach((day, index) => {
            timetable[index + 1] = {
                day: day,
                periods: []
            };
        });
        
        // Add periods to appropriate days
        allPeriods.forEach(period => {
            if (timetable[period.day_of_week]) {
                timetable[period.day_of_week].periods.push(period);
            }
        });
        
        // Get current period if any
        const currentPeriodInfo = await queryOne(`
            SELECT 
                tp.*,
                s.subject_name,
                s.subject_code,
                c.class_name
            FROM timetable_periods tp
            LEFT JOIN subjects s ON tp.subject_id = s.id
            LEFT JOIN classes c ON tp.class_id = c.id
            WHERE tp.teacher_id = $1 
            AND tp.day_of_week = $2 
            AND tp.start_time <= $3 
            AND tp.end_time >= $3
            AND tp.is_break = false
            ORDER BY tp.period_number
            LIMIT 1
        `, [teacherId, currentDay, currentTime]);
        
        // Calculate statistics
        const totalPeriods = allPeriods.length;
        const uniqueClasses = new Set(allPeriods.map(p => p.class_id)).size;
        const uniqueSubjects = new Set(allPeriods.map(p => p.subject_id)).size;
        const todayPeriods = timetable[currentDay] ? timetable[currentDay].periods.length : 0;
        
        res.render('teacher/timetable', {
            user: req.session.user,
            timetable,
            currentDayName,
            currentTime,
            currentPeriodInfo,
            totalPeriods,
            uniqueClasses,
            uniqueSubjects,
            todayPeriods
        });
    } catch (err) {
        console.error('Teacher timetable error:', err);
        res.render('teacher/timetable', {
            user: req.session.user,
            timetable: {},
            currentDayName: '',
            currentTime: '',
            currentPeriodInfo: null,
            totalPeriods: 0,
            uniqueClasses: 0,
            uniqueSubjects: 0,
            todayPeriods: 0
        });
    }
});

// Get historical attendance management
app.get('/teacher/attendance/:classId/history', requireTeacher, async (req, res) => {
    const classId = req.params.classId;
    const { view = 'week', date } = req.query;
    const teacherId = req.session.user.id;
    
    try {
        // First check if this teacher is assigned to teach this class
        const teacherAssignment = await queryOne(`
            SELECT DISTINCT tp.id
            FROM timetable_periods tp
            WHERE tp.class_id = $1 AND tp.teacher_id = $2 AND tp.is_break = false
        `, [classId, teacherId]);
        
        if (!teacherAssignment) {
            console.log(`[${new Date().toISOString()}] Teacher ${req.session.user.name} attempted to access attendance history for class ${classId} without assignment`);
            return res.redirect('/teacher/dashboard');
        }
        
        // Get class info
        const classInfo = await queryOne('SELECT * FROM classes WHERE id = $1', [classId]);
        if (!classInfo) {
            return res.redirect('/teacher/dashboard');
        }
        
        // Get all students in this class
        const students = await queryAll(`
            SELECT id, roll_no, student_name
            FROM students 
            WHERE class_id = $1 
            ORDER BY roll_no
        `, [classId]);
        
        // Calculate date range based on view type and selected date
        const currentDate = date ? new Date(date) : new Date();
        let startDate, endDate, dates = [];
        
        if (view === 'week') {
            // Get week start (Monday) and end (Sunday)
            const dayOfWeek = currentDate.getDay();
            const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            
            startDate = new Date(currentDate);
            startDate.setDate(currentDate.getDate() + daysToMonday);
            
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            
            // Generate week dates
            for (let i = 0; i < 7; i++) {
                const date = new Date(startDate);
                date.setDate(startDate.getDate() + i);
                dates.push({
                    date: formatDateLocal(date),
                    day: date.toLocaleDateString('en-US', { weekday: 'short' }),
                    dayNum: date.getDate()
                });
            }
        } else if (view === 'month') {
            // Get month start and end
            startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
            
            // Generate month dates
            const daysInMonth = endDate.getDate();
            for (let i = 1; i <= daysInMonth; i++) {
                const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
                dates.push({
                    date: formatDateLocal(date),
                    day: date.toLocaleDateString('en-US', { weekday: 'short' }),
                    dayNum: date.getDate()
                });
            }
        }
        
        // Get teacher's timetable periods for this class to determine period-specific columns
        const teacherPeriodsOnSameDays = await queryAll(`
            SELECT DISTINCT tp.*, c.class_name, s.subject_name, s.subject_code
            FROM timetable_periods tp
            JOIN classes c ON tp.class_id = c.id
            LEFT JOIN subjects s ON tp.subject_id = s.id
            WHERE tp.teacher_id = $1
            AND tp.class_id = $2
            AND tp.is_break = false
            ORDER BY tp.day_of_week, tp.period_number
        `, [teacherId, classId]);
        
        // Get ALL attendance records for this class with period information
        const attendanceRecords = await queryAll(`
            SELECT 
                a.student_id, 
                a.date::date as date, 
                a.status,
                a.class_id,
                a.period_id,
                tp.period_number,
                tp.start_time,
                tp.end_time,
                s.subject_name,
                s.subject_code
            FROM attendance a
            JOIN students st ON a.student_id = st.id
            LEFT JOIN timetable_periods tp ON a.period_id = tp.id
            LEFT JOIN subjects s ON tp.subject_id = s.id
            WHERE st.class_id = $1 
            AND a.date::date >= $2::date
            AND a.date::date <= $3::date
            ORDER BY a.date::date, st.roll_no
        `, [classId, formatDateLocal(startDate), formatDateLocal(endDate)]);
        
        console.log(`[${new Date().toISOString()}] Found ${attendanceRecords.length} attendance records for class ${classInfo.class_name} from ${formatDateLocal(startDate)} to ${formatDateLocal(endDate)}`);
        
        if (attendanceRecords.length > 0) {
            console.log(`[${new Date().toISOString()}] Sample attendance record:`, attendanceRecords[0]);
        }
        
        // Get bookmarks for the date range
        const bookmarks = await queryAll(`
            SELECT b.*, u.name as marked_by_name
            FROM bookmarks b
            LEFT JOIN users u ON b.marked_by = u.id
            WHERE b.class_id = $1
            AND b.date >= $2 
            AND b.date <= $3
            ORDER BY b.date
        `, [classId, formatDateLocal(startDate), formatDateLocal(endDate)]);
        
        // Organize attendance by student, date, and period
        const attendanceGrid = {};
        students.forEach(student => {
            attendanceGrid[student.id] = {};
            // Initialize with the generated dates
            dates.forEach(dateInfo => {
                attendanceGrid[student.id][dateInfo.date] = {};
                // Initialize with teacher's periods for this day
                const dayOfWeek = new Date(dateInfo.date).getDay();
                const adjustedDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
                const periodsForThisDay = teacherPeriodsOnSameDays.filter(period => period.day_of_week === adjustedDayOfWeek);
                
                if (periodsForThisDay.length > 0) {
                    periodsForThisDay.forEach(period => {
                        attendanceGrid[student.id][dateInfo.date][period.id] = null;
                    });
                } else {
                    // If no specific periods, use a general entry
                    attendanceGrid[student.id][dateInfo.date]['general'] = null;
                }
            });
        });
        
        console.log(`[${new Date().toISOString()}] Attendance grid initialized for ${students.length} students and ${dates.length} dates`);
        
        // Fill in actual attendance records
        attendanceRecords.forEach(record => {
            const recordDate = formatDateLocal(record.date); // Convert to YYYY-MM-DD format (local)
            
            // Ensure the student exists in the grid
            if (!attendanceGrid[record.student_id]) {
                console.log(`[${new Date().toISOString()}] Student ${record.student_id} not found in attendance grid`);
                return;
            }
            
            // Create the date entry if it doesn't exist
            if (!attendanceGrid[record.student_id][recordDate]) {
                attendanceGrid[record.student_id][recordDate] = {};
            }
            
            // Store attendance by period if available, otherwise by general
            if (record.period_id && attendanceGrid[record.student_id][recordDate][record.period_id] !== undefined) {
                attendanceGrid[record.student_id][recordDate][record.period_id] = record.status;
                console.log(`[${new Date().toISOString()}] Setting attendance for student ${record.student_id} on ${recordDate} for period ${record.period_id}: ${record.status}`);
            } else {
                // Fallback to general entry
                attendanceGrid[record.student_id][recordDate]['general'] = record.status;
                console.log(`[${new Date().toISOString()}] Setting attendance for student ${record.student_id} on ${recordDate}: ${record.status}`);
            }
        });
        
        console.log(`[${new Date().toISOString()}] Final attendance grid sample:`, Object.keys(attendanceGrid).slice(0, 2).map(studentId => ({
            studentId,
            dates: Object.keys(attendanceGrid[studentId]).slice(0, 3).map(date => ({
                date,
                status: attendanceGrid[studentId][date]
            }))
        })));
        
        // Calculate navigation dates
        let prevDate, nextDate;
        if (view === 'week') {
            prevDate = new Date(startDate);
            prevDate.setDate(startDate.getDate() - 7);
            nextDate = new Date(startDate);
            nextDate.setDate(startDate.getDate() + 7);
        } else {
            prevDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
            nextDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
        }
        
        res.render('teacher/attendance-history', {
            classInfo,
            students,
            dates,
            attendanceGrid,
            bookmarks,
            teacherPeriodsOnSameDays,
            view,
            currentDate: formatDateLocal(currentDate),
            prevDate: formatDateLocal(prevDate),
            nextDate: formatDateLocal(nextDate),
            startDate: formatDateLocal(startDate),
            endDate: formatDateLocal(endDate),
            user: req.session.user,
            error: null
        });
    } catch (err) {
        console.error('Historical attendance error:', err);
        res.redirect('/teacher/dashboard');
    }
});


// Bookmark/Festival Management Routes

// Get bookmarks for a class and date range
app.get('/api/bookmarks/:classId', requireTeacher, async (req, res) => {
    const classId = req.params.classId;
    const { startDate, endDate } = req.query;
    
    try {
        let query = `
            SELECT b.*, u.name as marked_by_name
            FROM bookmarks b
            LEFT JOIN users u ON b.marked_by = u.id
            WHERE b.class_id = $1
        `;
        let params = [classId];
        
        if (startDate && endDate) {
            query += ` AND b.date >= $2 AND b.date <= $3`;
            params.push(startDate, endDate);
        }
        
        query += ` ORDER BY b.date`;
        
        const bookmarks = await queryAll(query, params);
        res.json({ success: true, bookmarks });
    } catch (err) {
        console.error('Get bookmarks error:', err);
        res.json({ success: false, error: err.message });
    }
});

// Add or update bookmark
app.post('/api/bookmarks', requireTeacher, async (req, res) => {
    const { date, title, description, classId } = req.body;
    const teacherId = req.session.user.id;
    
    try {
        // Check if bookmark already exists for this date and class
        const existingBookmark = await queryOne(
            'SELECT id FROM bookmarks WHERE date = $1 AND class_id = $2',
            [date, classId]
        );
        
        let result;
        if (existingBookmark) {
            // Update existing bookmark
            result = await query(`
                UPDATE bookmarks 
                SET title = $1, description = $2, marked_by = $3
                WHERE date = $4 AND class_id = $5
                RETURNING *
            `, [title, description, teacherId, date, classId]);
        } else {
            // Create new bookmark
            result = await query(`
                INSERT INTO bookmarks (date, title, description, marked_by, class_id)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `, [date, title, description, teacherId, classId]);
        }
        
        res.json({ success: true, bookmark: result.rows[0] });
    } catch (err) {
        console.error('Save bookmark error:', err);
        res.json({ success: false, error: err.message });
    }
});

// Delete bookmark
app.delete('/api/bookmarks/:id', requireTeacher, async (req, res) => {
    const bookmarkId = req.params.id;
    
    try {
        await query('DELETE FROM bookmarks WHERE id = $1', [bookmarkId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete bookmark error:', err);
        res.json({ success: false, error: err.message });
    }
});

// Update bulk attendance


// Get attendance reports
app.get('/teacher/reports/:classId', requireTeacher, async (req, res) => {
    const classId = req.params.classId;
    const { period = 'week' } = req.query;
    const teacherId = req.session.user.id;
    
    try {
        // First check if this teacher is assigned to teach this class
        const teacherAssignment = await queryOne(`
            SELECT DISTINCT tp.id
            FROM timetable_periods tp
            WHERE tp.class_id = $1 AND tp.teacher_id = $2 AND tp.is_break = false
        `, [classId, teacherId]);
        
        if (!teacherAssignment) {
            console.log(`[${new Date().toISOString()}] Teacher ${req.session.user.name} attempted to access reports for class ${classId} without assignment`);
            return res.redirect('/teacher/dashboard');
        }
        let params = [classId, teacherId];
        const today = new Date();
        
        let query = `
            SELECT 
                s.roll_no,
                s.student_name,
                COUNT(a.id) as total_days,
                SUM(CASE WHEN a.status = 'P' THEN 1 ELSE 0 END) as present_days,
                SUM(CASE WHEN a.status = 'A' THEN 1 ELSE 0 END) as absent_days,
                ROUND(
                    (SUM(CASE WHEN a.status = 'P' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(a.id), 0)), 2
                ) as attendance_percentage
            FROM students s
            LEFT JOIN attendance a ON s.id = a.student_id 
            LEFT JOIN timetable_periods tp ON a.period_id = tp.id
            WHERE s.class_id = $1 
            AND (tp.teacher_id = $2 OR a.id IS NULL)
        `;
        
        // Add date filter based on period - only when we have attendance records
        switch(period) {
            case 'week':
                const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                query += ` AND (a.id IS NULL OR a.date >= $3)`;
                params.push(weekAgo.toISOString().split('T')[0]);
                break;
            case 'month':
                const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
                query += ` AND (a.id IS NULL OR a.date >= $3)`;
                params.push(monthAgo.toISOString().split('T')[0]);
                break;
            case 'full':
            default:
                // No date filter for full period
                break;
        }
        
        query += ` GROUP BY s.id, s.roll_no, s.student_name ORDER BY s.roll_no`;
        
        console.log('Generated SQL query:', query);
        console.log('Parameters:', params);
        
        const report = await queryAll(query, params);
        
        const classInfo = await queryOne('SELECT * FROM classes WHERE id = $1', [classId]);
        
        res.render('teacher/reports', { 
            report, 
            classInfo, 
            period, 
            user: req.session.user,
            error: null 
        });
    } catch (err) {
        console.error('Reports error:', err);
        res.render('teacher/reports', { 
            report: [], 
            classInfo: { class_name: 'Unknown Class' }, 
            period, 
            user: req.session.user,
            error: 'Database error' 
        });
    }
});

// Admin (HOD) routes
app.get('/admin/dashboard', requireAdmin, async (req, res) => {
    try {
        const stats = await queryOne(`
            SELECT 
                (SELECT COUNT(*) FROM users WHERE role = 'teacher') as teachers,
                (SELECT COUNT(*) FROM users WHERE role = 'student') as students,
                (SELECT COUNT(*) FROM classes) as classes,
                (SELECT COUNT(*) FROM students) as total_students
        `);
        res.render('admin/dashboard', { stats, user: req.session.user, error: null });
    } catch (err) {
        console.error('Admin dashboard error:', err);
        res.render('admin/dashboard', { stats: {}, user: req.session.user, error: 'Database error' });
    }
});

// Manage Classes
app.get('/admin/classes', requireAdmin, async (req, res) => {
    try {
        const classes = await queryAll(`
            SELECT c.*, u.name as teacher_name 
            FROM classes c 
            LEFT JOIN users u ON c.teacher_id = u.id 
            ORDER BY c.year, c.section
        `);
        const teachers = await queryAll('SELECT * FROM users WHERE role = \'teacher\' ORDER BY name');
        res.render('admin/classes', { classes, teachers, user: req.session.user, error: null });
    } catch (err) {
        console.error('Classes error:', err);
        res.render('admin/classes', { classes: [], teachers: [], user: req.session.user, error: 'Database error' });
    }
});

// Assign teacher to class
app.post('/admin/classes/assign-teacher', requireAdmin, async (req, res) => {
    const { class_id, teacher_id } = req.body;
    
    try {
        await query(
            'UPDATE classes SET teacher_id = $1 WHERE id = $2',
            [teacher_id, class_id]
        );
        
        res.json({ success: true });
    } catch (err) {
        console.error('Assign teacher error:', err);
        res.json({ success: false, error: err.message });
    }
});

// Create new class
app.post('/admin/classes/create', requireAdmin, async (req, res) => {
    const { year, section } = req.body;
    
    console.log(`Attempting to create class: Year=${year}, Section=${section}`);
    
    try {
        // Validate input
        if (!year || !section) {
            console.log('Missing year or section');
            return res.redirect('/admin/classes?error=Year and Section are required');
        }
        
        // Check if class already exists
        const existingClass = await queryOne(
            'SELECT id, class_name FROM classes WHERE year = $1 AND section = $2',
            [year, section]
        );
        
        if (existingClass) {
            console.log(`Class already exists: ${existingClass.class_name}`);
            return res.redirect('/admin/classes?error=Class already exists for this year and section');
        }
        
        const className = `${year}${year == 1 ? 'st' : year == 2 ? 'nd' : year == 3 ? 'rd' : 'th'} Year IT-${section}`;
        console.log(`Creating class: ${className}`);
        
        const result = await query(`
            INSERT INTO classes (class_name, year, section, total_students)
            VALUES ($1, $2, $3, 0)
            RETURNING id, class_name
        `, [className, year, section]);
        
        console.log(`Successfully created class: ${result.rows[0].class_name} with ID: ${result.rows[0].id}`);
        res.redirect('/admin/classes?success=Class created successfully');
        
    } catch (err) {
        console.error('Create class error:', err);
        console.error('Error details:', err.message);
        console.error('Error code:', err.code);
        
        let errorMessage = 'Failed to create class';
        if (err.code === '23505') {
            errorMessage = 'Class with this year and section already exists';
        }
        
        res.redirect('/admin/classes?error=' + encodeURIComponent(errorMessage));
    }
});

// Manage Subjects
app.get('/admin/subjects', requireAdmin, async (req, res) => {
    try {
        const subjects = await queryAll('SELECT * FROM subjects ORDER BY subject_name');
        res.render('admin/subjects', { subjects, user: req.session.user, error: null, success: null });
    } catch (err) {
        console.error('Subjects error:', err);
        res.render('admin/subjects', { subjects: [], user: req.session.user, error: 'Database error', success: null });
    }
});

// Create new subject
app.post('/admin/subjects/create', requireAdmin, async (req, res) => {
    const { subject_name, subject_code, subject_type } = req.body;
    
    try {
        await query(`
            INSERT INTO subjects (subject_name, subject_code, subject_type)
            VALUES ($1, $2, $3)
        `, [subject_name, subject_code, subject_type]);
        
        res.redirect('/admin/subjects?success=Subject created successfully');
    } catch (err) {
        console.error('Create subject error:', err);
        res.redirect('/admin/subjects?error=Failed to create subject');
    }
});

// Edit subject
app.put('/admin/subjects/edit/:id', requireAdmin, async (req, res) => {
    const subjectId = req.params.id;
    const { subject_name, subject_code, subject_type } = req.body;
    
    try {
        await query(`
            UPDATE subjects 
            SET subject_name = $1, subject_code = $2, subject_type = $3
            WHERE id = $4
        `, [subject_name, subject_code, subject_type, subjectId]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Edit subject error:', err);
        res.json({ success: false, error: err.message });
    }
});

// Delete subject
app.delete('/admin/subjects/delete/:id', requireAdmin, async (req, res) => {
    const subjectId = req.params.id;
    
    try {
        // First check if subject is used in any timetables
        const usageCheck = await queryOne(
            'SELECT COUNT(*) as count FROM timetable_periods WHERE subject_id = $1', 
            [subjectId]
        );
        
        if (parseInt(usageCheck.count) > 0) {
            return res.json({ success: false, error: 'Cannot delete subject as it is used in timetables' });
        }
        
        await query('DELETE FROM subjects WHERE id = $1', [subjectId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Delete subject error:', err);
        res.json({ success: false, error: err.message });
    }
});

// Timetable Management Routes

// Get timetable management page
app.get('/admin/timetable', requireAdmin, async (req, res) => {
    try {
        const classes = await queryAll(`
            SELECT c.*, COUNT(s.id) as student_count 
            FROM classes c 
            LEFT JOIN students s ON c.id = s.class_id 
            GROUP BY c.id, c.class_name, c.year, c.section, c.teacher_id, c.total_students, c.created_at 
            ORDER BY c.year, c.section
        `);
        
        const subjects = await queryAll('SELECT * FROM subjects ORDER BY subject_name');
        const teachers = await queryAll('SELECT id, name FROM users WHERE role = \'teacher\' ORDER BY name');
        
        res.render('admin/timetable', { 
            classes, 
            subjects, 
            teachers, 
            user: req.session.user, 
            error: null 
        });
    } catch (err) {
        console.error('Timetable page error:', err);
        res.render('admin/timetable', { 
            classes: [], 
            subjects: [], 
            teachers: [], 
            user: req.session.user, 
            error: 'Database error' 
        });
    }
});

// Get timetable for a specific class
app.get('/api/timetable/:classId', requireAdmin, async (req, res) => {
    const classId = req.params.classId;
    
    try {
        const timetable = await queryAll(`
            SELECT 
                tp.*,
                s.subject_name,
                s.subject_code,
                u.name as teacher_name
            FROM timetable_periods tp
            LEFT JOIN subjects s ON tp.subject_id = s.id
            LEFT JOIN users u ON tp.teacher_id = u.id
            WHERE tp.class_id = $1
            ORDER BY tp.day_of_week, tp.period_number
        `, [classId]);
        
        // Organize timetable by days
        const organizedTimetable = {};
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        
        days.forEach((day, index) => {
            organizedTimetable[index + 1] = {
                day: day,
                periods: timetable.filter(period => period.day_of_week === index + 1)
            };
        });
        
        res.json({ success: true, timetable: organizedTimetable });
    } catch (err) {
        console.error('Get timetable error:', err);
        res.json({ success: false, error: err.message });
    }
});

// Add or update timetable period
app.post('/api/timetable/period', requireAdmin, async (req, res) => {
    const { 
        class_id, 
        day_of_week, 
        period_number, 
        start_time, 
        end_time, 
        subject_id, 
        teacher_id, 
        is_break, 
        break_name 
    } = req.body;
    
    try {
        // Check if period already exists
        const existingPeriod = await queryOne(
            'SELECT id FROM timetable_periods WHERE class_id = $1 AND day_of_week = $2 AND period_number = $3',
            [class_id, day_of_week, period_number]
        );
        
        let result;
        if (existingPeriod) {
            // Update existing period
            result = await query(`
                UPDATE timetable_periods 
                SET start_time = $1, end_time = $2, subject_id = $3, teacher_id = $4, 
                    is_break = $5, break_name = $6
                WHERE class_id = $7 AND day_of_week = $8 AND period_number = $9
                RETURNING *
            `, [start_time, end_time, subject_id || null, teacher_id || null, 
                is_break || false, break_name || null, class_id, day_of_week, period_number]);
        } else {
            // Create new period
            result = await query(`
                INSERT INTO timetable_periods 
                (class_id, day_of_week, period_number, start_time, end_time, subject_id, teacher_id, is_break, break_name)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `, [class_id, day_of_week, period_number, start_time, end_time, 
                subject_id || null, teacher_id || null, is_break || false, break_name || null]);
        }
        
        res.json({ success: true, period: result.rows[0] });
    } catch (err) {
        console.error('Save timetable period error:', err);
        res.json({ success: false, error: err.message });
    }
});

// Delete timetable period with cascade deletion of attendance records
app.delete('/api/timetable/period/:periodId', requireAdmin, async (req, res) => {
    const periodId = req.params.periodId;
    
    try {
        // First, get period details for logging
        const periodDetails = await queryOne(`
            SELECT tp.*, c.class_name, s.subject_name, u.name as teacher_name
            FROM timetable_periods tp 
            LEFT JOIN classes c ON tp.class_id = c.id 
            LEFT JOIN subjects s ON tp.subject_id = s.id 
            LEFT JOIN users u ON tp.teacher_id = u.id
            WHERE tp.id = $1
        `, [periodId]);
        
        if (!periodDetails) {
            return res.status(404).json({ success: false, error: 'Period not found' });
        }
        
        // Count attendance records that will be deleted
        const attendanceCount = await queryOne(
            'SELECT COUNT(*) as count FROM attendance WHERE period_id = $1',
            [periodId]
        );
        
        console.log(`[${new Date().toISOString()}] HOD deleting period: ${periodDetails.class_name} - ${periodDetails.subject_name || 'Break'} (Day ${periodDetails.day_of_week}, Period ${periodDetails.period_number})`);
        console.log(`[${new Date().toISOString()}] This will also delete ${attendanceCount.count} attendance records`);
        
        // With CASCADE DELETE, we can now directly delete the period
        // The attendance records will be automatically deleted
        await query('DELETE FROM timetable_periods WHERE id = $1', [periodId]);
        
        console.log(`[${new Date().toISOString()}] Period and ${attendanceCount.count} attendance records deleted successfully`);
        
        res.json({ 
            success: true, 
            message: `Period deleted successfully. ${attendanceCount.count} attendance records were also removed.`,
            deletedAttendanceCount: attendanceCount.count
        });
    } catch (err) {
        console.error('Delete timetable period error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Manage Teachers
app.get('/admin/teachers', requireAdmin, async (req, res) => {
    try {
        const teachers = await queryAll('SELECT * FROM users WHERE role = \'teacher\' ORDER BY name');
        res.render('admin/teachers', { teachers, user: req.session.user, error: null });
    } catch (err) {
        console.error('Teachers error:', err);
        res.render('admin/teachers', { teachers: [], user: req.session.user, error: 'Database error' });
    }
});

// Add new teacher
app.post('/admin/teachers/create', requireAdmin, async (req, res) => {
    const { name, register_id } = req.body;
    try {
        const username = register_id;
        const password = await bcrypt.hash(register_id, 10); // Default password is register_id
        
        await query(`
            INSERT INTO users (username, password, role, name, register_id)
            VALUES ($1, $2, 'teacher', $3, $4)
        `, [username, password, name, register_id]);
        
        res.redirect('/admin/teachers');
    } catch (err) {
        console.error('Create teacher error:', err);
        res.redirect('/admin/teachers?error=Failed to create teacher');
    }
});

// Manage Students
app.get('/admin/students', requireAdmin, async (req, res) => {
    try {
        const classes = await queryAll('SELECT * FROM classes ORDER BY year, section');
        const students = await queryAll(`
            SELECT s.*, c.class_name, u.username 
            FROM students s 
            JOIN classes c ON s.class_id = c.id
            LEFT JOIN users u ON s.user_id = u.id
            ORDER BY c.year, c.section, s.roll_no
        `);
        res.render('admin/students', { classes, students, user: req.session.user, error: null });
    } catch (err) {
        console.error('Students error:', err);
        res.render('admin/students', { classes: [], students: [], user: req.session.user, error: 'Database error' });
    }
});

// Get students by class
app.get('/admin/students/class/:classId', requireAdmin, async (req, res) => {
    const classId = req.params.classId;
    try {
        const students = await queryAll(`
            SELECT s.*, u.username, u.register_id
            FROM students s 
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.class_id = $1 
            ORDER BY s.roll_no
        `, [classId]);
        
        res.json({ success: true, students });
    } catch (err) {
        console.error('Get students by class error:', err);
        res.json({ success: false, error: err.message });
    }
});

// Get all classes with updated student counts for dropdown refresh
app.get('/admin/classes/list', requireAdmin, async (req, res) => {
    try {
        const classes = await queryAll('SELECT * FROM classes ORDER BY year, section');
        res.json({ success: true, classes });
    } catch (err) {
        console.error('Get classes list error:', err);
        res.json({ success: false, error: err.message });
    }
});

// Delete entire class with all related data (HOD only)
app.delete('/api/admin/class/:classId', requireAdmin, async (req, res) => {
    const classId = req.params.classId;
    
    try {
        // Get class details for logging
        const classDetails = await queryOne('SELECT * FROM classes WHERE id = $1', [classId]);
        if (!classDetails) {
            return res.json({ success: false, error: 'Class not found' });
        }
        
        // Count related records that will be deleted
        const studentCount = await queryOne('SELECT COUNT(*) as count FROM students WHERE class_id = $1', [classId]);
        const periodCount = await queryOne('SELECT COUNT(*) as count FROM timetable_periods WHERE class_id = $1', [classId]);
        const attendanceCount = await queryOne('SELECT COUNT(*) as count FROM attendance WHERE class_id = $1', [classId]);
        
        console.log(`[${new Date().toISOString()}] HOD deleting class: ${classDetails.class_name}`);
        console.log(`[${new Date().toISOString()}] This will delete: ${studentCount.count} students, ${periodCount.count} periods, ${attendanceCount.count} attendance records`);
        
        // Delete in the correct order to avoid foreign key constraints
        // With CASCADE DELETE, attendance records will be automatically deleted when periods are deleted
        // 1. Delete timetable periods (attendance records will be CASCADE deleted)
        await query('DELETE FROM timetable_periods WHERE class_id = $1', [classId]);
        
        // 2. Delete students
        await query('DELETE FROM students WHERE class_id = $1', [classId]);
        
        // 3. Finally delete the class
        await query('DELETE FROM classes WHERE id = $1', [classId]);
        
        console.log(`[${new Date().toISOString()}] Class ${classDetails.class_name} and all related data deleted successfully`);
        
        res.json({ 
            success: true, 
            message: `Class "${classDetails.class_name}" deleted successfully.`,
            deletedData: {
                students: studentCount.count,
                periods: periodCount.count,
                attendance: attendanceCount.count
            }
        });
    } catch (err) {
        console.error('Delete class error:', err);
        res.json({ success: false, error: err.message });
    }
});

// Delete all periods for a class (HOD only)
app.delete('/api/admin/class/:classId/periods', requireAdmin, async (req, res) => {
    const classId = req.params.classId;
    
    try {
        // Get class details for logging
        const classDetails = await queryOne('SELECT * FROM classes WHERE id = $1', [classId]);
        if (!classDetails) {
            return res.json({ success: false, error: 'Class not found' });
        }
        
        // Count periods and attendance records that will be deleted
        const periodCount = await queryOne('SELECT COUNT(*) as count FROM timetable_periods WHERE class_id = $1', [classId]);
        const attendanceCount = await queryOne('SELECT COUNT(*) as count FROM attendance WHERE class_id = $1', [classId]);
        
        console.log(`[${new Date().toISOString()}] HOD deleting all periods for class: ${classDetails.class_name}`);
        console.log(`[${new Date().toISOString()}] This will delete: ${periodCount.count} periods, ${attendanceCount.count} attendance records`);
        
        // With CASCADE DELETE, we can directly delete all timetable periods
        // The attendance records will be automatically deleted
        await query('DELETE FROM timetable_periods WHERE class_id = $1', [classId]);
        
        console.log(`[${new Date().toISOString()}] All periods for class ${classDetails.class_name} deleted successfully`);
        
        res.json({ 
            success: true, 
            message: `All periods for class "${classDetails.class_name}" deleted successfully.`,
            deletedData: {
                periods: periodCount.count,
                attendance: attendanceCount.count
            }
        });
    } catch (err) {
        console.error('Delete all periods error:', err);
        res.json({ success: false, error: err.message });
    }
});

// Bulk update attendance records (for historical attendance editing)
app.post('/api/attendance/bulk-update', requireTeacher, async (req, res) => {
    const { classId, changes } = req.body;
    const teacherId = req.session.user.id;
    
    try {
        // For historical attendance editing, teachers can edit any attendance for classes they have access to
        // Check if teacher has any assignment to this class (for security) - no period restrictions for historical editing
        const teacherAssignment = await queryOne(`
            SELECT DISTINCT tp.id
            FROM timetable_periods tp
            WHERE tp.class_id = $1 AND tp.teacher_id = $2 AND tp.is_break = false
        `, [classId, teacherId]);
        
        if (!teacherAssignment) {
            return res.status(403).json({ success: false, error: 'Access denied to this class' });
        }
        
        let updatedCount = 0;
        
        for (const change of changes) {
            const { studentId, date, status } = change;
            
            if (!status || status === '') {
                // Delete attendance record if status is empty
                await query(`
                    DELETE FROM attendance 
                    WHERE student_id = $1 AND date = $2
                `, [studentId, date]);
                updatedCount++;
            } else {
                // Check if attendance record already exists
                const existingRecord = await queryOne(`
                    SELECT id FROM attendance 
                    WHERE student_id = $1 AND date = $2
                `, [studentId, date]);
                
                if (existingRecord) {
                    // Update existing record
                    await query(`
                        UPDATE attendance 
                        SET status = $1
                        WHERE student_id = $2 AND date = $3
                    `, [status, studentId, date]);
                } else {
                    // Create new record (manual attendance) - no period_id for historical editing
                    await query(`
                        INSERT INTO attendance (student_id, date, status, marked_by, created_at)
                        VALUES ($1, $2, $3, $4, NOW())
                    `, [studentId, date, status, teacherId]);
                }
                updatedCount++;
            }
        }
        
        console.log(`[${new Date().toISOString()}] Teacher ${req.session.user.name} updated ${updatedCount} attendance records for class ${classId}`);
        
        res.json({ 
            success: true, 
            updatedCount: updatedCount,
            message: `Successfully updated ${updatedCount} attendance records`
        });
        
    } catch (err) {
        console.error('Bulk attendance update error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Add individual student
app.post('/admin/students/add-individual', requireAdmin, async (req, res) => {
    const { class_id, roll_no, name, register_id } = req.body;
    
    console.log('=== ADD INDIVIDUAL STUDENT REQUEST ===');
    console.log('Request body:', { class_id, roll_no, name, register_id });
    console.log('User:', req.session.user?.username);
    
    try {
        // Check if roll number already exists in the class
        const existingStudent = await queryOne(
            'SELECT id FROM students WHERE roll_no = $1 AND class_id = $2', 
            [roll_no, class_id]
        );
        
        if (existingStudent) {
            return res.json({ success: false, error: 'Roll number already exists in this class' });
        }
        
        // Check if register_id already exists
        const existingRegister = await queryOne(
            'SELECT id FROM users WHERE register_id = $1', 
            [register_id]
        );
        
        if (existingRegister) {
            return res.json({ success: false, error: 'Register ID already exists' });
        }
        
        // Create user account for student
        const username = register_id;
        const password = await bcrypt.hash(register_id, 10);
        
        const userResult = await query(`
            INSERT INTO users (username, password, role, name, register_id)
            VALUES ($1, $2, 'student', $3, $4)
            RETURNING id
        `, [username, password, name, register_id]);
        
        const userId = userResult.rows[0].id;
        
        // Add to students table
        await query(`
            INSERT INTO students (user_id, roll_no, class_id, student_name)
            VALUES ($1, $2, $3, $4)
        `, [userId, roll_no, class_id, name]);
        
        // Update class student count
        await query(`
            UPDATE classes SET total_students = (
                SELECT COUNT(*) FROM students WHERE class_id = $1
            ) WHERE id = $1
        `, [class_id]);
        
        console.log('✅ Individual student added successfully:', name, 'Roll:', roll_no);
        res.json({ success: true });
    } catch (err) {
        console.error('Add individual student error:', err);
        res.json({ success: false, error: err.message });
    }
});

// Edit student
app.put('/admin/students/edit/:studentId', requireAdmin, async (req, res) => {
    const studentId = req.params.studentId;
    const { roll_no, name, register_id } = req.body;
    
    try {
        // Get current student info
        const currentStudent = await queryOne(
            'SELECT s.*, u.register_id as current_register_id FROM students s LEFT JOIN users u ON s.user_id = u.id WHERE s.id = $1', 
            [studentId]
        );
        
        if (!currentStudent) {
            return res.json({ success: false, error: 'Student not found' });
        }
        
        // Check if roll number conflicts with another student in the same class
        if (roll_no !== currentStudent.roll_no) {
            const existingRoll = await queryOne(
                'SELECT id FROM students WHERE roll_no = $1 AND class_id = $2 AND id != $3', 
                [roll_no, currentStudent.class_id, studentId]
            );
            
            if (existingRoll) {
                return res.json({ success: false, error: 'Roll number already exists in this class' });
            }
        }
        
        // Check if register_id conflicts with another user
        if (register_id !== currentStudent.current_register_id) {
            const existingRegister = await queryOne(
                'SELECT id FROM users WHERE register_id = $1 AND id != $2', 
                [register_id, currentStudent.user_id]
            );
            
            if (existingRegister) {
                return res.json({ success: false, error: 'Register ID already exists' });
            }
        }
        
        // Update student record
        await query(`
            UPDATE students SET roll_no = $1, student_name = $2 WHERE id = $3
        `, [roll_no, name, studentId]);
        
        // Update user record if user_id exists
        if (currentStudent.user_id) {
            await query(`
                UPDATE users SET name = $1, register_id = $2, username = $2 WHERE id = $3
            `, [name, register_id, currentStudent.user_id]);
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Edit student error:', err);
        res.json({ success: false, error: err.message });
    }
});

// Add students to class (bulk upload)
app.post('/admin/students/add', requireAdmin, async (req, res) => {
    const { class_id, students_data } = req.body;
    
    console.log('=== BULK ADD STUDENTS REQUEST ===');
    console.log('Class ID:', class_id);
    console.log('User:', req.session.user?.username);
    console.log('Students data length:', students_data?.length);
    
    try {
        const studentsArray = JSON.parse(students_data);
        console.log('Parsed students array:', studentsArray.length, 'students');
        
        for (const student of studentsArray) {
            const { roll_no, name, register_id } = student;
            
            // Check if roll number already exists in the class
            const existingStudent = await queryOne(
                'SELECT id FROM students WHERE roll_no = $1 AND class_id = $2', 
                [roll_no, class_id]
            );
            
            if (existingStudent) {
                throw new Error(`Roll number ${roll_no} already exists in this class`);
            }
            
            // Check if register_id already exists
            const existingRegister = await queryOne(
                'SELECT id FROM users WHERE register_id = $1', 
                [register_id]
            );
            
            if (existingRegister) {
                throw new Error(`Register ID ${register_id} already exists`);
            }
            
            // Create user account for student
            const username = register_id;
            const password = await bcrypt.hash(register_id, 10); // Default password is register_id
            
            const userResult = await query(`
                INSERT INTO users (username, password, role, name, register_id)
                VALUES ($1, $2, 'student', $3, $4)
                RETURNING id
            `, [username, password, name, register_id]);
            
            const userId = userResult.rows[0].id;
            
            // Add to students table
            await query(`
                INSERT INTO students (user_id, roll_no, class_id, student_name)
                VALUES ($1, $2, $3, $4)
            `, [userId, roll_no, class_id, name]);
        }
        
        // Update class student count
        await query(`
            UPDATE classes SET total_students = (
                SELECT COUNT(*) FROM students WHERE class_id = $1
            ) WHERE id = $1
        `, [class_id]);
        
        console.log(`✅ Bulk students added successfully: ${studentsArray.length} students to class ${class_id}`);
        res.json({ success: true });
    } catch (err) {
        console.error('Add students error:', err);
        res.json({ success: false, error: err.message });
    }
});

// Password management
app.get('/admin/passwords', requireAdmin, async (req, res) => {
    try {
        const users = await queryAll(`
            SELECT id, username, name, role, register_id 
            FROM users 
            WHERE role IN ('teacher', 'student') 
            ORDER BY role, name
        `);
        res.render('admin/passwords', { users, user: req.session.user, error: null });
    } catch (err) {
        console.error('Password management error:', err);
        res.render('admin/passwords', { users: [], user: req.session.user, error: 'Database error' });
    }
});

// Reset password
app.post('/admin/reset-password', requireAdmin, async (req, res) => {
    const { user_id } = req.body;
    try {
        const user = await queryOne('SELECT register_id FROM users WHERE id = $1', [user_id]);
        const newPassword = await bcrypt.hash(user.register_id, 10);
        
        await query('UPDATE users SET password = $1 WHERE id = $2', [newPassword, user_id]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Reset password error:', err);
        res.json({ success: false, error: err.message });
    }
});

// Delete class
app.delete('/admin/classes/delete/:id', requireAdmin, async (req, res) => {
    const class_id = req.params.id;
    try {
        // First delete related attendance records
        await query('DELETE FROM attendance WHERE class_id = $1', [class_id]);
        
        // Then delete students in the class
        await query('DELETE FROM students WHERE class_id = $1', [class_id]);
        
        // Finally delete the class
        await query('DELETE FROM classes WHERE id = $1', [class_id]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Delete class error:', err);
        res.json({ success: false, message: err.message });
    }
});

// Delete teacher
app.delete('/admin/teachers/delete/:id', requireAdmin, async (req, res) => {
    const teacher_id = req.params.id;
    try {
        // First unassign teacher from classes
        await query('UPDATE classes SET teacher_id = NULL WHERE teacher_id = $1', [teacher_id]);
        
        // Set marked_by to NULL for attendance records marked by this teacher
        await query('UPDATE attendance SET marked_by = NULL WHERE marked_by = $1', [teacher_id]);
        
        // Delete teacher user account
        await query('DELETE FROM users WHERE id = $1 AND role = \'teacher\'', [teacher_id]);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Delete teacher error:', err);
        res.json({ success: false, message: err.message });
    }
});

// Delete student
app.delete('/admin/students/delete/:id', requireAdmin, async (req, res) => {
    const student_id = req.params.id;
    try {
        // Get student info
        const student = await queryOne('SELECT user_id, class_id FROM students WHERE id = $1', [student_id]);
        
        if (student) {
            // Delete attendance records
            await query('DELETE FROM attendance WHERE student_id = $1', [student_id]);
            
            // Delete student record
            await query('DELETE FROM students WHERE id = $1', [student_id]);
            
            // Delete user account if exists
            if (student.user_id) {
                await query('DELETE FROM users WHERE id = $1 AND role = \'student\'', [student.user_id]);
            }
            
            // Update class student count
            await query(`
                UPDATE classes SET total_students = (
                    SELECT COUNT(*) FROM students WHERE class_id = $1
                ) WHERE id = $1
            `, [student.class_id]);
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Delete student error:', err);
        res.json({ success: false, message: err.message });
    }
});

// Student routes (basic implementation)
app.get('/student/dashboard', requireAuth, (req, res) => {
    if (req.session.user.role !== 'student') {
        if (req.session.user.role === 'admin') {
            return res.redirect('/admin/dashboard');
        }
        return res.redirect('/teacher/dashboard');
    }
    res.render('student/dashboard', { user: req.session.user });
});

// Initialize database and start server
if (require.main === module) {
    initDatabase().then(() => {
        app.listen(PORT, () => {
            console.log(`\n🎓 IT Department Attendance System running on http://localhost:${PORT}`);
            console.log('\n📋 Login Credentials:');
            console.log('👨‍💼 Admin (HOD): username=hod, password=password');
            console.log('👨‍🏫 Teacher: username=teacher1, password=password');
            console.log('👨‍🎓 Students: Register ID as username and password\n');
        });
    }).catch(err => {
        console.error('Failed to initialize database:', err);
    });
} else {
    // For serverless runtimes (e.g., Vercel), initialize DB but do not listen
    initDatabase().catch(err => console.error('Failed to initialize database:', err));
}

module.exports = app;
