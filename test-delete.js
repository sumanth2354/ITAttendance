require('dotenv').config();
const { queryAll, queryOne, query } = require('./config/postgres');

async function testDeleteFunctionality() {
    try {
        console.log('Testing delete functionality...\n');
        
        // Test 1: Check current timetable periods
        console.log('1. Current timetable periods:');
        const periods = await queryAll('SELECT * FROM timetable_periods');
        console.log(`   Total periods: ${periods.length}`);
        periods.forEach((period, index) => {
            console.log(`   Period ${index + 1}: ID=${period.id}, Class=${period.class_id}, Day=${period.day_of_week}, Period=${period.period_number}`);
        });
        
        // Test 2: Check attendance records
        console.log('\n2. Current attendance records:');
        const attendance = await queryAll('SELECT * FROM attendance');
        console.log(`   Total attendance records: ${attendance.length}`);
        attendance.forEach((record, index) => {
            console.log(`   Record ${index + 1}: ID=${record.id}, Class=${record.class_id}, Period=${record.period_id}, Student=${record.student_id}`);
        });
        
        // Test 3: Check foreign key constraints
        console.log('\n3. Checking foreign key constraints...');
        try {
            const constraints = await queryAll(`
                SELECT 
                    tc.constraint_name, 
                    tc.table_name, 
                    kcu.column_name, 
                    ccu.table_name AS foreign_table_name,
                    ccu.column_name AS foreign_column_name,
                    rc.delete_rule
                FROM 
                    information_schema.table_constraints AS tc 
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_name = kcu.constraint_name
                      AND tc.table_schema = kcu.table_schema
                    JOIN information_schema.constraint_column_usage AS ccu
                      ON ccu.constraint_name = tc.constraint_name
                      AND ccu.table_schema = tc.table_schema
                    JOIN information_schema.referential_constraints AS rc
                      ON tc.constraint_name = rc.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY' 
                AND tc.table_name = 'attendance'
                AND kcu.column_name = 'period_id'
            `);
            
            console.log('   Foreign key constraints for attendance.period_id:');
            constraints.forEach((constraint, index) => {
                console.log(`   Constraint ${index + 1}: ${constraint.constraint_name}`);
                console.log(`     Table: ${constraint.table_name}.${constraint.column_name}`);
                console.log(`     References: ${constraint.foreign_table_name}.${constraint.foreign_column_name}`);
                console.log(`     Delete Rule: ${constraint.delete_rule}`);
            });
        } catch (error) {
            console.log('   Error checking constraints:', error.message);
        }
        
        console.log('\n✅ Delete functionality test completed!');
        console.log('\nTo test deletion:');
        console.log('1. Start the server: node server.js');
        console.log('2. Login as HOD (username: hod, password: password)');
        console.log('3. Go to Timetable Management');
        console.log('4. Try deleting a period - it should work without foreign key errors');
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

testDeleteFunctionality();





