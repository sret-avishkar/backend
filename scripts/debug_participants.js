const { db } = require('../config/firebase');

async function debugParticipants() {
    console.log('--- Debugging Event Participants ---');

    try {
        // 1. Fetch All Events
        console.log('Fetching all events...');
        const eventsSnapshot = await db.collection('events').get();

        if (eventsSnapshot.empty) {
            console.log('No events found in Firestore.');
            return;
        }

        const events = eventsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`Found ${events.length} events.`);

        // 2. For each event, fetch registrations
        for (const event of events) {
            console.log(`\nEvent: ${event.title} (ID: ${event.id})`);
            console.log(`  Date: ${event.date}`);

            // Check Date against "Today" (simulating frontend filter)
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const eventDate = new Date(event.date);
            const isFuture = eventDate >= today;
            console.log(`  Is Future/Today? ${isFuture}`);

            const regsSnapshot = await db.collection('registrations').where('eventId', '==', event.id).get();
            console.log(`  Registrations Found: ${regsSnapshot.size}`);

            if (regsSnapshot.size > 0) {
                regsSnapshot.docs.forEach((doc, index) => {
                    const data = doc.data();
                    console.log(`    ${index + 1}. ${data.name} (${data.email}) - Status: ${data.status}`);
                });
            }
        }

    } catch (error) {
        console.error('Error running debug script:', error);
    }
}

debugParticipants();
