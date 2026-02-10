const express = require('express');
const router = express.Router();
const { registerForEvent, getEventParticipants, getUserRegistrations, spotRegister } = require('../controllers/registrationController');

router.post('/', registerForEvent);
router.post('/spot', spotRegister);
router.get('/event/:eventId', getEventParticipants);
router.get('/user/:userId', getUserRegistrations);
router.get('/:id', require('../controllers/registrationController').getRegistrationById);
router.get('/check/:eventId/:userId', require('../controllers/registrationController').checkRegistrationStatus);
router.put('/:id/status', require('../controllers/registrationController').updateRegistrationStatus);
router.put('/:id/payment', require('../controllers/registrationController').updateRegistrationPayment);
router.put('/:id/paper-status', require('../controllers/registrationController').updateRegistrationPaperStatus);

module.exports = router;
