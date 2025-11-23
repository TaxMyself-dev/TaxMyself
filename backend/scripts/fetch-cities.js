const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function fetchCities() {
  const url = 'https://data.gov.il/api/3/action/datastore_search';

  try {
    console.log('📥 Fetching cities...');

    const response = await axios.get(url, {
      params: {
        resource_id: '5c78e9fa-c2e2-4771-93ff-7f400a12f7ba',
        limit: 2000,
      },
    });

    if (!response.data?.success) {
      throw new Error('API returned success=false');
    }

    const records = response.data.result.records;

    const outputPath = path.join(__dirname, '../src/data/cities.json');

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(records, null, 2));

    console.log('✅ cities.json created at:', outputPath);
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

fetchCities();
