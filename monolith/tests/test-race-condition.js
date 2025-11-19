// test-race-condition.js
// Run this to see race conditions in action!

const axios = require('axios');

const API_URL = 'http://localhost:3000/api';

async function purchaseTicket(userId, eventId) {
  try {
    const response = await axios.post(`${API_URL}/tickets/purchase`, {
      eventId,
      userId
    });
    console.log(`✅ User ${userId} successfully purchased ticket`);
    return true;
  } catch (error) {
    if (error.response?.status === 400) {
      console.log(`❌ User ${userId} failed - no tickets available`);
    } else {
      console.log(`⚠️  User ${userId} error:`, error.response?.data?.error || error.message);
    }
    return false;
  }
}

async function checkEventTickets(eventId) {
  const response = await axios.get(`${API_URL}/events/${eventId}`);
  return response.data.availableTickets;
}

async function simulateRaceCondition() {
  const eventId = '3'; // Comedy show with only 100 tickets
  
  console.log('\n🎟️  Starting Race Condition Test');
  console.log('================================');
  
  const initialTickets = await checkEventTickets(eventId);
  console.log(`Initial available tickets: ${initialTickets}`);
  
  // Create 10 concurrent purchase attempts
  const purchases = [];
  for (let i = 1; i <= 10; i++) {
    purchases.push(purchaseTicket(`racer_${i}`, eventId));
  }
  
  // Wait for all purchases to complete
  const results = await Promise.all(purchases);
  const successCount = results.filter(r => r).length;
  
  // Check final ticket count
  const finalTickets = await checkEventTickets(eventId);
  console.log('\n📊 Results:');
  console.log(`Successful purchases: ${successCount}`);
  console.log(`Final available tickets: ${finalTickets}`);
  console.log(`Tickets sold: ${initialTickets - finalTickets}`);
  
  if (successCount !== (initialTickets - finalTickets)) {
    console.log('\n🚨 RACE CONDITION DETECTED!');
    console.log(`Expected ${successCount} tickets sold, but only ${initialTickets - finalTickets} were deducted!`);
  }
}

// Run the test
if (require.main === module) {
  simulateRaceCondition().catch(console.error);
}

module.exports = { simulateRaceCondition };