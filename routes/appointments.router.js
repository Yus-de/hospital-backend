const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const { createAppointment, listAppointments, payAppointment, doctorPatients } = require('../controllers/appointments.controller');
const { addNote } = require('../controllers/notes.controller');
const { createLabRequest } = require('../controllers/lab.controller');

router.post('/appointments', auth, requireRole(['CASHIER']), createAppointment);
router.get('/appointments', auth, listAppointments);
router.patch('/appointments/:id/pay', auth, requireRole(['CASHIER']), payAppointment);
router.get('/doctor/patients', auth, requireRole(['DOCTOR']), doctorPatients);
router.post('/appointments/:id/notes', auth, requireRole(['DOCTOR']), addNote);
router.post('/appointments/:id/lab-requests', auth, requireRole(['DOCTOR']), createLabRequest);

module.exports = router;


