const { db } = require('../config/firebase');

const verifyUsers = async () => {
    console.log('Verifying users in Firestore...');
    const snapshot = await db.collection('users').get();

    if (snapshot.empty) {
        console.log('No matching documents.');
        return;
    }

    snapshot.forEach(doc => {
        const data = doc.data();
        if (data.role === 'organizer') {
            console.log(doc.id, '=>', data.email, '| Mobile:', data.mobileNumber);
        }
    });

    process.exit(0);
};

verifyUsers();
