const { db } = require('../config/firebase');
const { deleteFromGitHub } = require('../services/githubService');

const createEvent = async (req, res) => {
    try {
        const { title, date, description, venue, imageUrl, createdBy, role, price, category, assignedTo, paymentQrCodeUrl, upiId, slots, maxTeamMembers } = req.body;

        let organizerName = req.body.organizerName || '';
        let organizerEmail = req.body.organizerEmail || '';
        let organizerMobile = req.body.organizerMobile || '';

        if (assignedTo) {
            const userDoc = await db.collection('users').doc(assignedTo).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                if (userData.name) organizerName = userData.name;
                if (userData.email) organizerEmail = userData.email;
                if (userData.mobileNumber) organizerMobile = userData.mobileNumber;
            }
        } else if (createdBy && createdBy !== 'admin' && role !== 'admin') {
            const userDoc = await db.collection('users').doc(createdBy).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                if (userData.name) organizerName = userData.name;
                if (userData.email) organizerEmail = userData.email;
                if (userData.mobileNumber) organizerMobile = userData.mobileNumber;
            }
        }

        const newEvent = {
            title,
            date,
            description,
            venue,
            imageUrl,
            price,
            category,
            createdBy: createdBy || 'admin',
            assignedTo: assignedTo || null,
            organizerName,
            organizerEmail,
            paymentQrCodeUrl: paymentQrCodeUrl || '',
            upiId: upiId || '',
            slots: slots ? parseInt(slots) : null,
            organizerMobile: organizerMobile,
            maxTeamMembers: maxTeamMembers ? parseInt(maxTeamMembers) : 1,
            year: req.body.year || '2026',
            status: role === 'admin' ? 'approved' : 'pending',
            createdAt: new Date().toISOString(),
            enableMultiDepartment: req.body.enableMultiDepartment || false,
            departmentOrganizers: req.body.departmentOrganizers || {},
            organizerIds: req.body.organizerIds || [],
            registeredCount: 0
        };
        const docRef = await db.collection('events').add(newEvent);
        res.status(201).json({ id: docRef.id, ...newEvent });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getEvents = async (req, res) => {
    try {
        const { role, organizerId } = req.query;
        let query = db.collection('events');

        if (role !== 'admin' && role !== 'coordinator') {
            if (organizerId) {
                const snapshot = await query.get();
                let events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                events = events.filter(event => {
                    const isAssigned = event.assignedTo === organizerId;
                    const isInOrganizersList = event.organizerIds && event.organizerIds.includes(organizerId);
                    const isDeptOrganizer = event.departmentOrganizers && Object.values(event.departmentOrganizers).includes(organizerId);

                    if (isAssigned || isInOrganizersList || isDeptOrganizer) return true;

                    // Only fallback to createdBy if NOT assigned to anyone else and NOT multi-dept
                    if (event.createdBy === organizerId) {
                        return !event.assignedTo && !event.enableMultiDepartment;
                    }

                    return false;
                });
                return res.status(200).json(events);
            } else {
                // Return both approved and completed events so Archives/PreviousYear pages work
                query = query.where('status', 'in', ['approved', 'completed']);
            }
        }

        const snapshot = await query.get();
        const events = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                registeredCount: data.registeredCount || 0
            };
        });
        res.status(200).json(events);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getEventById = async (req, res) => {
    try {
        const doc = await db.collection('events').doc(req.params.id).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Event not found' });
        }
        const data = doc.data();
        res.status(200).json({
            id: doc.id,
            ...data,
            registeredCount: data.registeredCount || 0
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateEvent = async (req, res) => {
    try {
        const updates = { ...req.body };
        // console.log(`Updating event ${req.params.id}`, Object.keys(updates));

        // 1. Fetch current event state to determine mode switch
        const eventRef = db.collection('events').doc(req.params.id);
        const eventDoc = await eventRef.get();
        if (!eventDoc.exists) {
            return res.status(404).json({ error: 'Event not found' });
        }
        const currentEvent = eventDoc.data();

        // Determine new state of enableMultiDepartment
        let isMultiDept = currentEvent.enableMultiDepartment;
        if (updates.enableMultiDepartment !== undefined) {
            isMultiDept = updates.enableMultiDepartment;
        }

        if (isMultiDept) {
            // --- SWITCHING TO / UPDATING MULTI-DEPT MODE ---
            // Clear single organizer fields to prevent double listing
            updates.assignedTo = null;
            updates.organizerName = '';
            updates.organizerEmail = '';
            updates.organizerMobile = '';

            // Ensure departmentOrganizers is updated from request if provided
            if (updates.departmentOrganizers) {
                // Just use the provided map
            } else if (updates.enableMultiDepartment === true && !currentEvent.enableMultiDepartment) {
                // If switching to multi-dept but no organizers provided, init empty
                updates.departmentOrganizers = {};
            }

        } else {
            // --- SWITCHING TO / UPDATING SINGLE-ORGANIZER MODE ---
            // Clear multi-dept fields
            updates.departmentOrganizers = {};

            // Handle Single Organizer Assignment logic
            if (updates.assignedTo !== undefined) {
                if (updates.assignedTo) {
                    const userDoc = await db.collection('users').doc(updates.assignedTo).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        updates.organizerName = userData.name || updates.organizerName || '';
                        updates.organizerEmail = userData.email || updates.organizerEmail || '';
                        updates.organizerMobile = userData.mobileNumber || updates.organizerMobile || '';
                    } else {
                        // User not found? Clear fields
                        updates.organizerName = '';
                        updates.organizerEmail = '';
                        updates.organizerMobile = '';
                    }
                } else {
                    // assignedTo explicitly set to null/empty
                    updates.organizerName = '';
                    updates.organizerEmail = '';
                    updates.organizerMobile = '';
                    updates.assignedTo = null;
                }
            } else if (updates.enableMultiDepartment === false && currentEvent.enableMultiDepartment) {
                // If switching FROM multi-dept TO single but didn't provide a new assignedTo,
                // we should probably clear the single organizer fields just in case, or leave them if they were somehow set?
                // Safer to clear if not explicitly provided during a switch.
                if (!updates.assignedTo) {
                    updates.assignedTo = null;
                    updates.organizerName = '';
                    updates.organizerEmail = '';
                    updates.organizerMobile = '';
                }
            }
        }

        if (updates.slots) {
            updates.slots = parseInt(updates.slots);
        }

        await eventRef.update(updates);
        res.status(200).json({ id: req.params.id, ...updates });
    } catch (error) {
        console.error("Update Event Error:", error);
        res.status(500).json({ error: error.message });
    }
};

const deleteEvent = async (req, res) => {
    try {
        const docRef = db.collection('events').doc(req.params.id);
        const doc = await docRef.get();

        if (doc.exists) {
            const eventData = doc.data();

            // Send Notification to Creator (if not admin) if it was pending or approved
            if (eventData.createdBy && eventData.createdBy !== 'admin') {
                const notifTitle = "Event Deleted/Rejected";
                const notifBody = `Your event "${eventData.title}" has been deleted (or rejected by admin).`;

                await db.collection('notifications').add({
                    userId: eventData.createdBy,
                    title: notifTitle,
                    body: notifBody,
                    read: false,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    type: 'event_deletion',
                    entityId: req.params.id
                });

                try {
                    await sendPushNotification(eventData.createdBy, notifTitle, notifBody);
                } catch (err) {
                    console.error("Push notif error", err);
                }
            }


            // 1. Delete Image from GitHub
            if (eventData.imageUrl) {
                await deleteFromGitHub(eventData.imageUrl);
            }

            // 2. Delete all registrations for this event
            const registrationsSnapshot = await db.collection('registrations').where('eventId', '==', req.params.id).get();
            const batch = db.batch();
            registrationsSnapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });
            await batch.commit();

            // 3. Delete the event itself
            await docRef.delete();
            res.status(200).json({ message: 'Event and associated registrations deleted successfully' });
        } else {
            res.status(404).json({ error: 'Event not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const { admin } = require('../config/firebase');
const { sendPushNotification } = require('../services/notificationService');

const approveEvent = async (req, res) => {
    try {
        const eventDoc = await db.collection('events').doc(req.params.id).get();
        if (!eventDoc.exists) {
            return res.status(404).json({ error: 'Event not found' });
        }
        const event = eventDoc.data();

        await db.collection('events').doc(req.params.id).update({ status: 'approved' });

        // Send Notification to Creator (if not admin)
        if (event.createdBy && event.createdBy !== 'admin') {
            const notifTitle = "Event Approved";
            const notifBody = `Your event "${event.title}" has been APPROVED and is now visible to students.`;

            await db.collection('notifications').add({
                userId: event.createdBy,
                title: notifTitle,
                body: notifBody,
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                type: 'event_approval',
                entityId: req.params.id
            });

            try {
                await sendPushNotification(event.createdBy, notifTitle, notifBody);
            } catch (err) {
                console.error("Push notif error", err);
            }
        }

        res.status(200).json({ message: 'Event approved successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const archiveEvents = async (req, res) => {
    try {
        const { year } = req.body;
        const snapshot = await db.collection('events').where('status', '==', 'approved').get();

        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
            batch.update(doc.ref, {
                status: 'completed',
                year: year || new Date().getFullYear().toString()
            });
        });

        await batch.commit();
        res.status(200).json({ message: `Archived ${snapshot.size} events to year ${year}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    createEvent,
    getEvents,
    getEventById,
    updateEvent,
    deleteEvent,
    approveEvent,
    archiveEvents
};
