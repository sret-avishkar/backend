const { auth, db } = require('../config/firebase');

const users = [
    {
        email: 'avishkar2026.eee@sreerama.ac.in',
        password: 'Avishkar@2026',
        displayName: 'T. Kosaleswara Reddy',
        role: 'organizer',
        mobileNumber: '9949266787'
    },
    {
        email: 'avishkar2026.me@sreerama.ac.in',
        password: 'Avishkar@2026',
        displayName: 'K. Ramesh Kumar',
        role: 'organizer',
        mobileNumber: '9494503639'
    },
    {
        email: 'avishkar2026.ece@sreerama.ac.in',
        password: 'Avishkar@2026',
        displayName: 'S. Sruthi',
        role: 'organizer',
        mobileNumber: '7989532664'
    },
    {
        email: 'avishkar2026.cse@sreerama.ac.in',
        password: 'Avishkar@2026',
        displayName: 'Y. Ravi Kumar',
        role: 'organizer',
        mobileNumber: '9666908272'
    },
    {
        email: 'avishkar2026.aids@sreerama.ac.in',
        password: 'Avishkar@2026',
        displayName: 'MR. Pavan Kumar',
        role: 'organizer',
        mobileNumber: '9652916364'
    },
    {
        email: 'avishkar2026.mba@sreerama.ac.in',
        password: 'Avishkar@2026',
        displayName: 'M.S. Vasu',
        role: 'organizer',
        mobileNumber: '7330692733'
    },
    {
        email: 'avishkar2026.bsh@sreerama.ac.in',
        password: 'Avishkar@2026',
        displayName: 'V. Sravan Kumar',
        role: 'organizer',
        mobileNumber: '9030804427'
    },
    // {
    //     email: 'muniravilla7@gmail.com',
    //     password: 'Avishkar@2026',
    //     displayName: 'Muni',
    //     role: 'coordinator',
    //     mobileNumber: '8074182938'
    // }

];

const seedUsers = async () => {
    console.log('Seeding users...');

    for (const user of users) {
        try {
            let userRecord;
            try {
                userRecord = await auth.getUserByEmail(user.email);
                console.log(`User ${user.email} already exists.`);
            } catch (error) {
                if (error.code === 'auth/user-not-found') {
                    userRecord = await auth.createUser({
                        email: user.email,
                        password: user.password,
                        displayName: user.displayName,
                    });
                    console.log(`Created user: ${user.email}`);
                } else {
                    throw error;
                }
            }

            // Set custom claims for role (optional but good for security rules)
            await auth.setCustomUserClaims(userRecord.uid, { role: user.role });

            // Create/Update Firestore document
            await db.collection('users').doc(userRecord.uid).set({
                email: user.email,
                displayName: user.displayName,
                role: user.role,
                mobileNumber: user.mobileNumber || '',
                createdAt: new Date(),
                uid: userRecord.uid
            }, { merge: true });

            console.log(`Updated Firestore for ${user.email} with role ${user.role}`);

        } catch (error) {
            console.error(`Failed to process ${user.email}:`, error);
        }
    }

    console.log('Seeding complete.');
    process.exit(0);
};

seedUsers();
