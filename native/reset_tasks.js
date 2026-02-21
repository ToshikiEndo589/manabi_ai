const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://repjlkcreysduccnpmvu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlcGpsa2NyZXlzZHVjY25wbXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNDU2MjEsImV4cCI6MjA4NDgyMTYyMX0.rsEIlqRfdSnXmsw2Kz3EfxlYWfAmuVuUN6WXec1EbrQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data: materials, error: fetchError } = await supabase
        .from('review_materials')
        .select('*');

    if (fetchError) {
        console.error('Error fetching materials:', fetchError);
        return;
    }

    console.log(`Found ${materials.length} review_materials.`);

    // Check if any review_tasks exist at all
    const { data: tasks } = await supabase.from('review_tasks').select('id');
    console.log(`Total review_tasks in DB: ${tasks ? tasks.length : 0}`);
}

main();
