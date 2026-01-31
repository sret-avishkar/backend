const { db, admin } = require('../config/firebase');
const { uploadToGitHub } = require('../services/githubService');

const registerForEvent = async (req, res) => {
    try {
        const { userId, eventId, mobile, email, name, college, rollNo, department, paymentScreenshotUrl, paperUrl, status, payLater } = req.body;

        if (!userId || !eventId || !mobile) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Fetch Event Data FIRST so it is available for checks and notifications
        const eventDoc = await db.collection('events').doc(eventId).get();
        if (!eventDoc.exists) {
            return res.status(404).json({ error: 'Event not found' });
        }
        const eventData = eventDoc.data();


        // Check if already registered
        const registrationsRef = db.collection('registrations');
        const snapshot = await registrationsRef
            .where('userId', '==', userId)
            .where('eventId', '==', eventId)
            .get();

        if (!snapshot.empty) {
            return res.status(400).json({ message: 'Already registered for this event' });
        }

        // Check for slots availability
        if (eventData.slots) {
            const currentRegistrations = await registrationsRef
                .where('eventId', '==', eventId)
                .get();

            // Filter out rejected registrations
            const activeRegistrations = currentRegistrations.docs.filter(doc => doc.data().status !== 'rejected').length;

            if (activeRegistrations >= eventData.slots) {
                return res.status(400).json({ message: 'Registration Full. Please contact the organizer for more seats.' });
            }
        }

        // Upload payment screenshot if provided and is base64
        let finalPaymentScreenshotUrl = paymentScreenshotUrl || '';
        if (paymentScreenshotUrl && paymentScreenshotUrl.startsWith('data:')) {
            try {
                finalPaymentScreenshotUrl = await uploadToGitHub(paymentScreenshotUrl, 'payment_proofs');
            } catch (uploadError) {
                console.error("Failed to upload payment screenshot:", uploadError);
            }
        }

        // Upload paper if provided and is base64
        let finalPaperUrl = paperUrl || '';
        if (paperUrl && paperUrl.startsWith('data:')) {
            try {
                finalPaperUrl = await uploadToGitHub(paperUrl, 'papers');
            } catch (uploadError) {
                console.error("Failed to upload paper:", uploadError);
            }
        }

        // Determine initial status
        let initialStatus = status || 'pending';
        let initialPaperStatus = 'na'; // Not Applicable by default

        if (paperUrl) {
            initialPaperStatus = 'pending';
            // Status remains 'pending' (waiting for payment, which is blocked until paper accepted)
        }

        // Create registration
        const newRegRef = await registrationsRef.add({
            userId,
            eventId,
            mobile,
            email,
            name,
            college: college || '',
            rollNo: rollNo || '',
            department: department || '',
            teamMembers: req.body.teamMembers || [],
            paymentScreenshotUrl: finalPaymentScreenshotUrl,
            paperUrl: finalPaperUrl,
            status: initialStatus,
            paperStatus: initialPaperStatus,
            payLater: payLater || false, // Save payLater flag
            timestamp: new Date()
        });

        // Update User Profile with Mobile Number if provided
        if (mobile && userId) {
            try {
                await db.collection('users').doc(userId).set({
                    mobileNumber: mobile
                }, { merge: true });
            } catch (userUpdateError) {
                console.error("Failed to update user mobile number:", userUpdateError);
                // Non-critical error, continue
            }
        }

        // --- Send Notification to Organizer AND Admin ---
        try {
            const { sendPushNotification } = require('../services/notificationService');
            const notifTitle = "New Registration";
            const notifBody = `${name} registered for ${eventData.title}.`;
            const url = `/organizer/events/${eventId}/participants`;

            // 1. Determine Organizer
            let targetOrganizerId = null;
            if (eventData.enableMultiDepartment && department && eventData.departmentOrganizers && eventData.departmentOrganizers[department]) {
                targetOrganizerId = eventData.departmentOrganizers[department];
            } else {
                targetOrganizerId = eventData.assignedTo || eventData.createdBy;
            }

            // Notify Organizer (if found)
            if (targetOrganizerId) {
                // Add to Firestore
                await db.collection('notifications').add({
                    userId: targetOrganizerId,
                    title: notifTitle,
                    body: notifBody,
                    read: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    type: 'new_registration',
                    entityId: newRegRef.id,
                    eventId: eventId,
                    url: url
                });

                // Send Push
                await sendPushNotification(targetOrganizerId, notifTitle, notifBody, {
                    url: url,
                    eventId: eventId
                });
            }

            // 2. Notify ALL Admins
            const adminSnapshot = await db.collection('users').where('role', '==', 'admin').get();
            if (!adminSnapshot.empty) {
                const adminPromises = adminSnapshot.docs.map(async (doc) => {
                    const adminId = doc.id;
                    // Avoid duplicate notification if admin is same as organizer
                    if (adminId === targetOrganizerId) return;

                    // Add to Firestore
                    await db.collection('notifications').add({
                        userId: adminId,
                        title: notifTitle,
                        body: notifBody,
                        read: false,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        type: 'new_registration',
                        entityId: newRegRef.id,
                        eventId: eventId,
                        url: url
                    });

                    // Send Push
                    await sendPushNotification(adminId, notifTitle, notifBody, {
                        url: url,
                        eventId: eventId
                    });
                });
                await Promise.all(adminPromises);
            }

        } catch (notifError) {
            console.error("Failed to send organizer/admin notification:", notifError);
            // Don't fail the registration if notification fails
        }

        res.status(201).json({ message: 'Registration successful' });
    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ error: error.message });
    }
};

const getEventParticipants = async (req, res) => {
    try {
        const { eventId } = req.params;

        const registrationsRef = db.collection('registrations');
        const snapshot = await registrationsRef.where('eventId', '==', eventId).get();

        const participants = [];
        snapshot.forEach(doc => {
            participants.push({ id: doc.id, ...doc.data() });
        });

        res.status(200).json(participants);
    } catch (error) {
        console.error("Fetch Participants Error:", error);
        res.status(500).json({ error: error.message });
    }
};

const getUserRegistrations = async (req, res) => {
    try {
        const { userId } = req.params;
        const registrationsRef = db.collection('registrations');
        const snapshot = await registrationsRef.where('userId', '==', userId).get();

        const registrations = [];
        // We might want to fetch event details for each registration too
        // For now, let's just return the registration data which contains eventId
        // The frontend can fetch event details or we can do a join here.
        // Let's do a simple join here to make frontend easier.

        for (const doc of snapshot.docs) {
            const regData = doc.data();
            const eventDoc = await db.collection('events').doc(regData.eventId).get();
            if (eventDoc.exists) {
                registrations.push({
                    id: doc.id,
                    ...regData,
                    eventTitle: eventDoc.data().title,
                    eventDate: eventDoc.data().date,
                    eventVenue: eventDoc.data().venue
                });
            } else {
                registrations.push({ id: doc.id, ...regData, eventTitle: 'Unknown Event' });
            }
        }

        res.status(200).json(registrations);
    } catch (error) {
        console.error("Fetch User Registrations Error:", error);
        res.status(500).json({ error: error.message });
    }
};

const getRegistrationById = async (req, res) => {
    try {
        const { id } = req.params;
        const doc = await db.collection('registrations').doc(id).get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Registration not found' });
        }

        const data = doc.data();

        // Fetch event title if possible
        let eventTitle = 'Unknown Event';
        if (data.eventId) {
            const eventDoc = await db.collection('events').doc(data.eventId).get();
            if (eventDoc.exists) {
                const eventData = eventDoc.data();
                eventTitle = eventData.title;
                // Add fields for permission checking
                data.eventAssignedTo = eventData.assignedTo;
                data.eventCreatedBy = eventData.createdBy;
                data.eventDepartmentOrganizers = eventData.departmentOrganizers;
                data.eventEnableMultiDepartment = eventData.enableMultiDepartment;
            }
        }

        res.status(200).json({ id: doc.id, ...data, eventTitle });
    } catch (error) {
        console.error("Get Registration Error:", error);
        res.status(500).json({ error: error.message });
    }
};

const updateRegistrationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }

        const regDoc = await db.collection('registrations').doc(id).get();
        if (!regDoc.exists) {
            return res.status(404).json({ error: 'Registration not found' });
        }
        const registration = regDoc.data();

        await db.collection('registrations').doc(id).update({ status });

        // Send Notification
        let notifTitle = 'Registration Update';
        if (status === 'approved') notifTitle = 'Registration Approved';
        else if (status === 'confirmed') notifTitle = 'Registration Confirmed';
        else if (status === 'rejected') notifTitle = 'Registration Rejected';

        const notifBody = `Your registration for the event has been ${status.charAt(0).toUpperCase() + status.slice(1)}.`;

        // Add to Firestore
        await db.collection('notifications').add({
            userId: registration.userId,
            title: notifTitle,
            body: notifBody,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            type: 'registration_status',
            entityId: id, // Registration ID
            eventId: registration.eventId,
            url: `/events/${registration.eventId}`
        });

        // Send Push
        try {
            const { sendPushNotification } = require('../services/notificationService');
            // Assuming registration document has eventId. 
            // If not, we might need to fetch it or rely on entityId = registrationId which frontend can resolve.
            // But having a direct URL is better.
            const url = `/events/${registration.eventId}`;
            await sendPushNotification(registration.userId, notifTitle, notifBody, {
                url: url,
                eventId: registration.eventId
            });
        } catch (err) {
            console.error("Push notification failed", err);
        }

        // Send Email Notification (Existing logic kept or minimized)
        if (registration.email) {
            // ... existing email logic ...
        }

        res.status(200).json({ message: 'Registration status updated' });
    } catch (error) {
        console.error("Update Registration Status Error:", error);
        res.status(500).json({ error: error.message });
    }
};


const checkRegistrationStatus = async (req, res) => {
    try {
        const { eventId, userId } = req.params;

        if (!eventId || !userId) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const registrationsRef = db.collection('registrations');
        const snapshot = await registrationsRef
            .where('userId', '==', userId)
            .where('eventId', '==', eventId)
            .get();

        if (snapshot.empty) {
            return res.status(200).json({ registered: false });
        }

        // Return the first match (should only be one active usually)
        const doc = snapshot.docs[0];
        res.status(200).json({
            registered: true,
            registration: { id: doc.id, ...doc.data() }
        });

    } catch (error) {
        console.error("Check Registration Status Error:", error);
        res.status(500).json({ error: error.message });
    }
};

const updateRegistrationPayment = async (req, res) => {
    try {
        const { id } = req.params;
        const { paymentScreenshotUrl } = req.body;

        if (!paymentScreenshotUrl) {
            return res.status(400).json({ error: 'Payment screenshot is required' });
        }

        const regRef = db.collection('registrations').doc(id);
        const regDoc = await regRef.get();

        if (!regDoc.exists) {
            return res.status(404).json({ error: 'Registration not found' });
        }

        const currentData = regDoc.data();

        let finalUrl = paymentScreenshotUrl;
        if (paymentScreenshotUrl.startsWith('data:')) {
            try {
                finalUrl = await uploadToGitHub(paymentScreenshotUrl, 'payment_proofs');
            } catch (err) {
                console.error("Upload failed", err);
                // Continue with base64 if upload fails? No, better to fail or store raw.
                // We'll proceed but warn.
            }
        }

        // Update status to 'pending' to indicate Payment Verification Pending
        // If it was 'approved' (paper accepted), this moves it to next stage.
        await regRef.update({
            paymentScreenshotUrl: finalUrl,
            status: 'pending', // Reverts to pending for organizer check
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Notify Organizer
        const eventId = currentData.eventId;
        const eventDoc = await db.collection('events').doc(eventId).get();
        if (eventDoc.exists) {
            const eventData = eventDoc.data();
            const notifTitle = "Payment Proof Uploaded";
            const notifBody = `${currentData.name} uploaded payment proof for ${eventData.title}`;
            const url = `/organizer/events/${eventId}/participants`;

            // Determine Organizer (Simplified from register)
            // ... (Ideally extract this logic, but for now reuse checks)
            let targetOrganizerId = eventData.assignedTo || eventData.createdBy;
            if (eventData.enableMultiDepartment && currentData.department && eventData.departmentOrganizers?.[currentData.department]) {
                targetOrganizerId = eventData.departmentOrganizers[currentData.department];
            }

            if (targetOrganizerId) {
                await db.collection('notifications').add({
                    userId: targetOrganizerId,
                    title: notifTitle,
                    body: notifBody,
                    read: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    type: 'payment_upload',
                    entityId: id,
                    eventId: eventId,
                    url: url
                });
            }
        }

        res.status(200).json({ message: 'Payment updated successfully' });
    } catch (error) {
        console.error("Update Payment Error:", error);
        res.status(500).json({ error: error.message });
    }
};


const updateRegistrationPaperStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { paperStatus } = req.body;

        if (!paperStatus) {
            return res.status(400).json({ error: 'Paper status is required' });
        }

        const regRef = db.collection('registrations').doc(id);
        const regDoc = await regRef.get();

        if (!regDoc.exists) {
            return res.status(404).json({ error: 'Registration not found' });
        }

        const currentData = regDoc.data();

        await regRef.update({
            paperStatus,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Send Notification if status changes
        if (currentData.paperStatus !== paperStatus) {
            const notifTitle = paperStatus === 'accepted' ? 'Paper Accepted' : paperStatus === 'rejected' ? 'Paper Rejected' : 'Paper Update';
            const notifBody = `Your paper status has been updated to ${paperStatus.toUpperCase()}.`;

            // Only notify if accepted or rejected (skip pending if strictly internal, but usually good to notify)
            // If accepted, we might want to nudge them to pay.
            let extraBody = "";
            if (paperStatus === 'accepted') {
                extraBody = " You can now proceed to payment.";
            }

            await db.collection('notifications').add({
                userId: currentData.userId,
                title: notifTitle,
                body: notifBody + extraBody,
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                type: 'paper_status',
                entityId: id,
                eventId: currentData.eventId,
                url: `/events/${currentData.eventId}`
            });

            // Send Push
            try {
                const { sendPushNotification } = require('../services/notificationService');
                const url = `/events/${currentData.eventId}`;
                await sendPushNotification(currentData.userId, notifTitle, notifBody + extraBody, {
                    url: url,
                    eventId: currentData.eventId
                });
            } catch (err) {
                console.error("Push failed for paper status", err);
            }
        }

        res.status(200).json({ message: 'Paper status updated successfully' });
    } catch (error) {
        console.error("Update Paper Status Error:", error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    registerForEvent,
    getEventParticipants,
    getUserRegistrations,
    getRegistrationById,
    updateRegistrationStatus,
    checkRegistrationStatus,
    updateRegistrationPayment,
    updateRegistrationPaperStatus
};
