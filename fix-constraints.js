require('dotenv').config();
const { query } = require('./config/postgres');

async function fixConstraints() {
    try {
        console.log('Fixing foreign key constraints...\n');
        
        // Step 1: Drop the existing foreign key constraint
        console.log('1. Dropping existing foreign key constraint...');
        await query('ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_period_id_fkey');
        console.log('   ✅ Constraint dropped');
        
        // Step 2: Add the new foreign key constraint with CASCADE DELETE
        console.log('2. Adding new foreign key constraint with CASCADE DELETE...');
        await query(`
            ALTER TABLE attendance 
            ADD CONSTRAINT attendance_period_id_fkey 
            FOREIGN KEY (period_id) REFERENCES timetable_periods(id) ON DELETE CASCADE
        `);
        console.log('   ✅ New constraint added with CASCADE DELETE');
        
        // Step 3: Verify the constraint
        console.log('3. Verifying the new constraint...');
        const constraints = await query(`
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
        
        if (constraints.rows.length > 0) {
            const constraint = constraints.rows[0];
            console.log(`   ✅ Constraint verified: ${constraint.constraint_name}`);
            console.log(`   ✅ Delete Rule: ${constraint.delete_rule}`);
        } else {
            console.log('   ❌ No constraint found');
        }
        
        console.log('\n✅ Foreign key constraints fixed successfully!');
        console.log('Now you can delete periods without foreign key constraint errors.');
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error fixing constraints:', error);
        process.exit(1);
    }
}

fixConstraints();





