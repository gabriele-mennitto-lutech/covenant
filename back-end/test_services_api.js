const axios = require('axios');

async function testBackend() {
  try {
    // 1. Login to get token
    console.log("Logging in...");
    const loginRes = await axios.post('http://localhost:9991/api/auth/login', {
      username: 'admin',
      password: 'password'
    });
    const token = loginRes.data.token;
    console.log("Got token:", token.substring(0, 10) + "...");
    
    // 2. Fetch services
    console.log("Fetching services...");
    const servicesRes = await axios.get('http://localhost:9991/api/services', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log("Services response:", servicesRes.data);
  } catch (err) {
    if (err.response) {
      console.error("Error from backend:", err.response.status, err.response.data);
    } else {
      console.error("Error:", err.message);
    }
  }
}

testBackend();
