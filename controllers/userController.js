const { auth, db } = require('../config/firebase');

const getAllUsers = async (req, res) => {
    try {
        // Fetch users from Firebase Auth
        const listUsersResult = await auth.listUsers(1000);
        const users = listUsersResult.users.map(userRecord => ({
            uid: userRecord.uid,
            email: userRecord.email,
            displayName: userRecord.displayName || 'N/A',
            role: userRecord.customClaims?.role || 'participant', // Assuming role is in custom claims or we fetch from Firestore
            metadata: userRecord.metadata
        }));

        // Optionally merge with Firestore data if roles are stored there
        // For now, let's just return Auth data
        // If roles are in Firestore, we should fetch them. 
        // Let's try to fetch roles from Firestore 'users' collection

        const usersSnapshot = await db.collection('users').get();
        const firestoreUsers = {};
        usersSnapshot.forEach(doc => {
            firestoreUsers[doc.id] = doc.data();
        });

        const combinedUsers = users.map(user => ({
            ...user,
            ...firestoreUsers[user.uid], // Merge Firestore data (role, etc.)
            role: firestoreUsers[user.uid]?.role || 'participant'
        }));

        res.status(200).json(combinedUsers);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
};

const { sendPushNotification } = require('../services/notificationService');
const { admin } = require('../config/firebase');

const updateUserRole = async (req, res) => {
    const { uid } = req.params;
    const { role } = req.body;

    try {
        // Update custom claims in Firebase Auth
        await auth.setCustomUserClaims(uid, { role });

        // Update role in Firestore
        await db.collection('users').doc(uid).update({
            role,
            organizerRequest: false // Clear the request flag
        });

        // Send Notification
        const isApproved = role === 'organizer';
        const notifTitle = isApproved ? "Organizer Request Approved" : "Organizer Request Rejected";
        const notifBody = isApproved
            ? "Your request for Organizer access has been APPROVED. You can now access the Organizer Dashboard."
            : "Your request for Organizer access has been REJECTED.";

        await db.collection('notifications').add({
            userId: uid,
            title: notifTitle,
            body: notifBody,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            type: 'role_update',
            entityId: uid
        });

        try {
            await sendPushNotification(uid, notifTitle, notifBody);
        } catch (err) {
            console.error("Push notification logic failed", err);
        }

        res.status(200).json({ message: 'User role updated successfully' });
    } catch (error) {
        console.error('Error updating user role:', error);
        res.status(500).json({ error: 'Failed to update user role' });
    }
};

const getUserById = async (req, res) => {
    try {
        const { uid } = req.params;
        const userDoc = await db.collection('users').doc(uid).get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Return public profile info
        const userData = userDoc.data();
        const publicProfile = {
            name: userData.name || '',
            email: userData.email || '', // Maybe hide email if privacy concern? But user requested it.
            mobileNumber: userData.mobileNumber || '',
            upiId: userData.upiId || '',
            role: userData.role || 'participant',
            paymentQrCodeUrl: userData.paymentQrCodeUrl || ''
        };

        res.status(200).json(publicProfile);
    } catch (error) {
        console.error('Error fetching user by ID:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
};

const deleteUser = async (req, res) => {
    const { uid } = req.params;

    try {
        // Delete from Firebase Auth
        await auth.deleteUser(uid);

        // Delete from Firestore
        await db.collection('users').doc(uid).delete();

        // Optionally delete related registrations? 
        // For now, keeping it simple as per request.

        res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
};

const notifyNewUser = async (req, res) => {
    const { userId, name, email } = req.body;

    try {
        const notifTitle = "New Account Registered";
        const notifBody = `New user ${name} (${email}) has joined Avishkar.`;
        const url = `/admin/users`; // Redirect admin to user list

        // Notify ALL Admins
        const adminSnapshot = await db.collection('users').where('role', '==', 'admin').get();
        if (!adminSnapshot.empty) {
            const adminPromises = adminSnapshot.docs.map(async (doc) => {
                const adminId = doc.id;

                // Add to Firestore
                await db.collection('notifications').add({
                    userId: adminId,
                    title: notifTitle,
                    body: notifBody,
                    read: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    type: 'new_user',
                    entityId: userId,
                    url: url
                });

                // Send Push
                await sendPushNotification(adminId, notifTitle, notifBody, {
                    url: url
                });
            });
            await Promise.all(adminPromises);
        }

        res.status(200).json({ message: 'Admins notified' });
    } catch (error) {
        console.error('Error in notifyNewUser:', error);
        // Don't block registration on notification failure
        res.status(500).json({ error: 'Failed to notify admins' });
    }
};

const cleanupNotifications = async (req, res) => {
    const { uid } = req.params;
    try {
        const { cleanupReadNotifications } = require('../services/notificationService');
        // Run in background (don't await strictly if we want fast response, but awaiting is safer for errors)
        await cleanupReadNotifications(uid);
        res.status(200).json({ message: 'Cleanup initiated' });
    } catch (error) {
        console.error("Cleanup error:", error);
        res.status(500).json({ error: 'Cleanup failed' });
    }
};

module.exports = { getAllUsers, updateUserRole, getUserById, deleteUser, notifyNewUser, cleanupNotifications };
