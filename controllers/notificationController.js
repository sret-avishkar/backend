const { sendPushNotification } = require('../services/notificationService');
const { db, admin } = require('../config/firebase');

const sendBroadcast = async (req, res) => {
    try {
        const { title, body, targetRole } = req.body; // targetRole: 'all', 'participant', 'organizer'

        if (!title || !body) {
            return res.status(400).json({ error: 'Title and Body are required' });
        }

        let usersQuery = db.collection('users');
        if (targetRole && targetRole !== 'all') {
            usersQuery = usersQuery.where('role', '==', targetRole);
        }

        const snapshot = await usersQuery.get();

        if (snapshot.empty) {
            return res.status(200).json({ message: 'No users found to notify' });
        }

        let sentCount = 0;
        const promises = snapshot.docs.map(async (doc) => {
            const userId = doc.id;

            // 1. Send Push Notification
            await sendPushNotification(userId, title, body, { url: '/dashboard' });

            // 2. Store in Firestore for persistence
            await db.collection('notifications').add({
                userId: userId,
                title: title,
                body: body,
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                type: 'broadcast',
                url: '/dashboard'
            });

            sentCount++;
        });

        await Promise.all(promises);

        res.status(200).json({ message: `Notification sent to ${sentCount} users` });
    } catch (error) {
        console.error('Error sending broadcast:', error);
        res.status(500).json({ error: 'Failed to send broadcast' });
    }
};

module.exports = {
    sendBroadcast
};
