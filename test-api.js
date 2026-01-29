// Simple test to check API endpoint
const testAPI = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/generate-ordinal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ number: 1 })
    });
    
    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:', data);
  } catch (error) {
    console.error('Error:', error);
  }
};

testAPI();
