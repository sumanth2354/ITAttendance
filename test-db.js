require('dotenv').config();
const { queryAll } = require('./config/postgres');

async function testTeacherDashboard() {
    try {
        console.log('Testing teacher dashboard database queries...\n');
        
        // Test 1: Get teacher info
        console.log('1. Testing teacher login...');
        const teacher = await queryAll('SELECT * FROM users WHERE username = $1', ['teacher1']);
        console.log('Teacher found:', teacher.length > 0 ? 'YES' : 'NO');
        if (teacher.length > 0) {
            console.log('Teacher ID:', teacher[0].id);
            console.log('Teacher Name:', teacher[0].name);
        }
        
        // Check for teacher "roy"
        console.log('\n1a. Checking for teacher "roy"...');
        const royTeacher = await queryAll('SELECT * FROM users WHERE username = $1', ['roy']);
        if (royTeacher.length > 0) {
            console.log('Teacher "roy" found: YES');
            console.log('Roy Teacher ID:', royTeacher[0].id);
            console.log('Roy Teacher Name:', royTeacher[0].name);
        } else {
            console.log('Teacher "roy" found: NO');
        }
        
        // Check all teachers
        console.log('\n1b. All teachers in database...');
        const allTeachers = await queryAll('SELECT * FROM users WHERE role = $1', ['teacher']);
        console.log('Total teachers:', allTeachers.length);
        allTeachers.forEach((t, index) => {
            console.log(`   Teacher ${index + 1}: ${t.name} (ID: ${t.id}, Username: ${t.username})`);
        });
        
        // Test 2: Get ALL classes in the database
        console.log('\n2. Testing ALL classes...');
        const allClasses = await queryAll('SELECT * FROM classes');
        console.log('Total classes in database:', allClasses.length);
        allClasses.forEach((cls, index) => {
            console.log(`   Class ${index + 1}: ${cls.class_name} (ID: ${cls.id}, Teacher ID: ${cls.teacher_id}, Students: ${cls.total_students})`);
        });
        
        // Test 3: Get classes for the specific teacher
        console.log('\n3. Testing classes for teacher...');
        const teacherId = teacher[0]?.id || 2;
        const classes = await queryAll('SELECT * FROM classes WHERE teacher_id = $1', [teacherId]);
        console.log('Classes found for teacher:', classes.length);
        classes.forEach((cls, index) => {
            console.log(`   Class ${index + 1}: ${cls.class_name} (ID: ${cls.id}, Students: ${cls.total_students})`);
        });
        
        // Test 4: Check timetable data
        console.log('\n4. Testing timetable data...');
        const allTimetablePeriods = await queryAll('SELECT COUNT(*) as count FROM timetable_periods');
        console.log('Total timetable periods:', allTimetablePeriods[0].count);
        
        if (allTimetablePeriods[0].count > 0) {
            const periodDetails = await queryAll(`
                SELECT tp.*, c.class_name, s.subject_name, u.name as teacher_name
                FROM timetable_periods tp 
                LEFT JOIN classes c ON tp.class_id = c.id 
                LEFT JOIN subjects s ON tp.subject_id = s.id 
                LEFT JOIN users u ON tp.teacher_id = u.id
                ORDER BY tp.id
            `);
            
            console.log('All timetable period details:');
            periodDetails.forEach((period, index) => {
                console.log(`   Period ${index + 1}: Day ${period.day_of_week}, Period ${period.period_number}, Class: ${period.class_name || 'None'}, Subject: ${period.subject_name || 'Break'}, Teacher: ${period.teacher_name || 'None'}`);
            });
        }
        
        const teacherTimetablePeriods = await queryAll('SELECT COUNT(*) as count FROM timetable_periods WHERE teacher_id = $1', [teacherId]);
        console.log('Timetable periods for teacher:', teacherTimetablePeriods[0].count);
        
        // Test 5: Check if classes have students
        console.log('\n5. Testing student counts...');
        for (const cls of classes) {
            const studentCount = await queryAll('SELECT COUNT(*) as count FROM students WHERE class_id = $1', [cls.id]);
            const actualCount = studentCount[0].count;
            console.log(`   ${cls.class_name}: ${actualCount} students (DB shows: ${cls.total_students})`);
            
            if (actualCount != cls.total_students) {
                console.log('   ⚠️ Student count mismatch detected!');
            }
        }
        
        // Test 6: Check today's attendance
        console.log('\n6. Testing attendance queries...');
        const today = new Date().toISOString().split('T')[0];
        console.log('Today\'s date:', today);
        
        for (const cls of classes) {
            const attendance = await queryAll(`
                SELECT COUNT(*) as marked_count 
                FROM attendance 
                WHERE class_id = $1 AND date = $2
            `, [cls.id, today]);
            
            console.log(`   ${cls.class_name}: ${attendance[0].marked_count} attendance records for today`);
        }
        
        console.log('\n✅ Database test completed!');
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Database test failed:', error);
        process.exit(1);
    }
}

testTeacherDashboard();
