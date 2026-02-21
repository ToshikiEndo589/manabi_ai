
const https = require('https');

const SUPABASE_URL = 'https://repjlkcreysduccnpmvu.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlcGpsa2NyZXlzZHVjY25wbXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNDU2MjEsImV4cCI6MjA4NDgyMTYyMX0.rsEIlqRfdSnXmsw2Kz3EfxlYWfAmuVuUN6WXec1EbrQ';

async function checkColumn(column) {
    return new Promise((resolve, reject) => {
        const url = `${SUPABASE_URL}/rest/v1/profiles?select=${column}&limit=1`;
        const options = {
            headers: {
                'apikey': ANON_KEY,
                'Authorization': `Bearer ${ANON_KEY}`
            }
        };

        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log(`Column '${column}' exists.`);
                    resolve(true);
                } else if (res.statusCode === 400) {
                    // Parse error to be sure
                    try {
                        const json = JSON.parse(data);
                        console.log(`Column '${column}' check failed: ${json.message}`);
                        if (json.message && json.message.includes('dtabase column') || json.message.includes('does not exist')) {
                            resolve(false);
                        } else {
                            // Some other error
                            console.log('Unknown error:', json);
                            resolve(false);
                        }
                    } catch (e) {
                        console.log('Error parsing JSON:', data);
                        resolve(false);
                    }
                } else {
                    console.log(`Column '${column}' check returned status ${res.statusCode}`);
                    resolve(false); // Assume fail if not 200
                }
            });
        }).on('error', (err) => {
            console.error('Request error:', err);
            reject(err);
        });
    });
}

async function main() {
    console.log('Checking columns...');
    await checkColumn('birth_date');
    await checkColumn('gender');
    await checkColumn('study_purpose');
    await checkColumn('created_at'); // Should exist
}

main();
