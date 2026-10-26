const http = require('node:http');

http.get('http://localhost:9992/data/services', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log(`Dataservice returned ${parsed.length} services.`);
      if (parsed.length > 0) {
        console.log("Sample:", parsed[0]);
      }
    } catch (e) {
      console.log('Failed to parse response as JSON:', e.message);
      console.log(data);
    }
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
