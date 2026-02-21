const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'native/.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    // Check recently completed review_tasks
    const { data: recentlyCompleted, error: fetchError } = await supabase
        .from('review_tasks')
        .select('*')
        .eq('status', 'completed')
        .order('updated_at', { ascending: false })
        .limit(20);

    if (fetchError) {
        console.error('Error fetching completed tasks:', fetchError);
        return;
    }

    console.log(`Found ${recentlyCompleted.length} recently completed tasks.`);
    if (recentlyCompleted.length > 0) {
        console.log('Sample task IDs:', recentlyCompleted.map(t => t.id).join(', '));

        const ids = recentlyCompleted.map(t => t.id);

        // Revert them to pending for the user to be able to see them again
        const { error: updateError } = await supabase
            .from('review_tasks')
            .update({ status: 'pending' })
            .in('id', ids);

        if (updateError) {
            console.error('Error reverting tasks:', updateError);
        } else {
            console.log(`Successfully reverted ${recentlyCompleted.length} tasks back to pending for testing.`);
        }
    }
}

main();
