const { db } = require('../config/firebase');

const getSettings = async (req, res) => {
    try {
        const doc = await db.collection('settings').doc('global').get();
        if (!doc.exists) {
            // Return defaults if not set
            return res.status(200).json({
                registrationDeadline: new Date('2026-12-31').toISOString(),
                departments: ['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT', 'AI&DS', 'MBA', 'MCA', 'Others'],
                paymentQrCodeUrl: ''
            });
        }
        // Ensure departments exist even if doc exists
        const data = doc.data();
        if (!data.departments) {
            data.departments = ['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT', 'AI&DS', 'MBA', 'MCA', 'Others'];
        }
        res.status(200).json(data);
    } catch (error) {
        console.error("Get Settings Error:", error);
        res.status(500).json({ error: error.message });
    }
};

const updateSettings = async (req, res) => {
    try {
        const { registrationDeadline, departments, paymentQrCodeUrl } = req.body;
        console.log("Updating Settings with:", { registrationDeadline, departmentsCount: departments?.length, departments });

        const updateData = {};
        if (registrationDeadline !== undefined) updateData.registrationDeadline = registrationDeadline;
        if (departments !== undefined) updateData.departments = departments;
        if (paymentQrCodeUrl !== undefined) updateData.paymentQrCodeUrl = paymentQrCodeUrl;

        await db.collection('settings').doc('global').set(updateData, { merge: true });
        res.status(200).json({ message: 'Settings updated successfully' });
    } catch (error) {
        console.error("Update Settings Error:", error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = { getSettings, updateSettings };
