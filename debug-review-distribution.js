
const { createClient } = require('@supabase/supabase-js');

// Load environment variables (mimicking local environment or hardcoded for test)
// Note: In a real scenario, use process.env or a config file.
// For this script, we'll try to use the project URL and anon key if available, or ask the user to provide them.
// Since we don't have them here, we'll assume the environment has them or use the ones from previous context if possible.
// Wait, I can't access previous context variables directly.
// I'll try to read them from a local .env file if it exists, or use placeholders.

// ACTUALLY, I'll use the values from the user's `native/.env` if I can read it.
// Or I can just try to run it and let the user know if it fails.
// Let's assume the user has a valid environment.

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://repjlkcreysduccnpmvu.supabase.co';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '...'; // I will use the service role key if I have it, or anon key.
// But I don't have the key. I should read from `native/.env`!
// Wait, I can't read `native/.env` easily without `view_file`.
// I'll assume the user runs this with `node --env-file=.env ...` or I'll try to read it.

// Let's try to infer from previous `debug-review-data-2.js`.
// It used `createClient` without args? No, it must have had args.
// Ah, `debug-review-data-2.js` was written by me in step 270.
// Let's look at `debug-review-data-2.js` content if possible.
// I'll just write a script that requires `dotenv`.


const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function debugReviewDistribution() {
    console.log('Starting debug review distribution...');

    // 1. Get the user ID (hardcoded or from auth list)
    // Since we are running as admin/service role (hopefully), or anon.
    // If anon, we can't `listUsers`.
    // I will try to use the Service Role Key if available in `supa_config` or similar.
    // If not, I'll ask for the user ID.
    // BUT the user said "1 item", so they are logged in.
    // I'll try to fetch tasks for *all* users if I can't find a specific one, or just the first user found.

    // Try to get a user.
    // If we can't list users, we might need a specific user ID.
    // I'll try to query `review_tasks` directly if RLS allows (it usually doesn't for anon).
    // I'll assume I have the service role key in `process.env.SUPABASE_SERVICE_ROLE_KEY`.

    // Let's try to query review_tasks for *any* user.
    const { data: tasks, error } = await supabase
        .from('review_tasks')
        .select('*, study_logs(*)');

    if (error) {
        console.error('Error fetching tasks:', error);
        return;
    }

    console.log(`Fetched ${tasks.length} tasks total.`);

    // Group by user
    const tasksByUser = tasks.reduce((acc, task) => {
        if (!acc[task.user_id]) acc[task.user_id] = [];
        acc[task.user_id].push(task);
        return acc;
    }, {});

    for (const userId in tasksByUser) {
        console.log(`\nUser ${userId}:`);
        const userTasks = tasksByUser[userId];
        console.log(`- Raw count: ${userTasks.length}`);

        // Filter pending
        const pendingTasks = userTasks.filter(t => t.status === 'pending');
        console.log(`- Pending count: ${pendingTasks.length}`);

        // Grouping Logic (Mirrored from ReviewScreen.tsx)
        const groups = {};
        pendingTasks.forEach(task => {
            const log = Array.isArray(task.study_logs) ? task.study_logs[0] : task.study_logs;
            const bookId = log?.reference_book_id;
            const subject = log?.subject || 'Other';
            const key = bookId ? `book:${bookId}` : `subject:${subject}`;

            if (!groups[key]) {
                groups[key] = {
                    key,
                    title: subject, // Simplified
                    count: 0,
                    tasks: []
                };
            }
            groups[key].count++;
            groups[key].tasks.push(task.id);
        });

        const activeGroups = Object.values(groups);
        console.log(`- Group count: ${activeGroups.length}`);
        activeGroups.forEach(g => {
            console.log(`  - Group [${g.key}]: ${g.count} tasks`);
        });

        if (activeGroups.length === 1 && pendingTasks.length > 1) {
            console.warn('  ⚠️  ALERT: Multiple tasks grouped into SINGLE group!');
        }
    }
}

debugReviewDistribution();
