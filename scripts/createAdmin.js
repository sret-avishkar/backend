const { auth, db } = require('../config/firebase');

const createAdmin = async () => {
    const email = 'admin@temp.com';
    const password = 'AdminPassword123!';
    const displayName = 'Temporary Admin';

    try {
        let userRecord;
        try {
            userRecord = await auth.getUserByEmail(email);
            console.log(`Admin user ${email} already exists.`);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                userRecord = await auth.createUser({
                    email,
                    password,
                    displayName,
                });
                console.log(`Created admin user: ${email}`);
            } else {
                throw error;
            }
        }

        // Set custom claims
        await auth.setCustomUserClaims(userRecord.uid, { role: 'admin' });

        // Create/Update Firestore document
        await db.collection('users').doc(userRecord.uid).set({
            email,
            displayName,
            role: 'admin',
            createdAt: new Date(),
            uid: userRecord.uid
        }, { merge: true });

        console.log(`Admin privileges granted to ${email}`);
        process.exit(0);

    } catch (error) {
        console.error('Error creating admin:', error);
        process.exit(1);
    }
};

createAdmin();
