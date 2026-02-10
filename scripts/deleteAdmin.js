const { auth, db } = require('../config/firebase');

const deleteAdmin = async () => {
    const email = 'admin@temp.com';

    try {
        let userRecord;
        try {
            userRecord = await auth.getUserByEmail(email);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                console.log(`User ${email} not found.`);
                process.exit(0);
            }
            throw error;
        }

        // Delete from Auth
        await auth.deleteUser(userRecord.uid);
        console.log(`Deleted user ${email} from Authentication.`);

        // Delete from Firestore
        await db.collection('users').doc(userRecord.uid).delete();
        console.log(`Deleted user document for ${email} from Firestore.`);

        process.exit(0);

    } catch (error) {
        console.error('Error deleting admin:', error);
        process.exit(1);
    }
};

deleteAdmin();
