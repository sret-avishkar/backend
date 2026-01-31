const { db } = require('../config/firebase');

const syncEventOrganizers = async () => {
    console.log('Syncing event organizers...');
    try {
        const eventsSnapshot = await db.collection('events').get();
        let updatedCount = 0;

        for (const doc of eventsSnapshot.docs) {
            const eventData = doc.data();
            const updates = {};
            let userIdToFetch = null;

            if (eventData.assignedTo) {
                userIdToFetch = eventData.assignedTo;
            } else if (eventData.createdBy && eventData.createdBy !== 'admin') {
                userIdToFetch = eventData.createdBy;
            }

            if (userIdToFetch) {
                const userDoc = await db.collection('users').doc(userIdToFetch).get();
                if (userDoc.exists) {
                    const userData = userDoc.data();

                    // Check if updates are needed
                    const newMobile = userData.mobileNumber || '';
                    const newName = userData.name || userData.displayName || '';
                    const newEmail = userData.email || '';

                    if (eventData.organizerMobile !== newMobile ||
                        eventData.organizerName !== newName ||
                        eventData.organizerEmail !== newEmail) {

                        updates.organizerMobile = newMobile;
                        updates.organizerName = newName;
                        updates.organizerEmail = newEmail;

                        await doc.ref.update(updates);
                        console.log(`Updated event ${eventData.title} (${doc.id}) with mobile: ${newMobile}`);
                        updatedCount++;
                    }
                }
            }
        }

        console.log(`Sync complete. Updated ${updatedCount} events.`);
    } catch (error) {
        console.error('Error syncing events:', error);
    }
    process.exit(0);
};

syncEventOrganizers();
