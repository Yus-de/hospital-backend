const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const {
  createDoctor,
  listDoctors,
  listDoctorPatients,
  addAppointmentNote,
  createLabRequest,
  listLabExaminations,
  listLabRequests
} = require('../controllers/doctors.controller');

// Create a new doctor
router.post('/', createDoctor);

// Get all doctors
router.get('/', listDoctors);

// Get doctor's assigned patients (only paid appointments)
router.get('/patients', auth, requireRole(['DOCTOR']), listDoctorPatients);

// Doctor adds a note to an appointment (only for their own appointment)
router.post('/appointments/:id/notes', auth, requireRole(['DOCTOR']), addAppointmentNote);

// Doctor creates a lab request tied to an appointment (unpaid by default)
router.post('/appointments/:id/lab-requests', auth, requireRole(['DOCTOR']), createLabRequest);

// Get available lab examinations for doctors
router.get('/lab-examinations', auth, requireRole(['DOCTOR']), listLabExaminations);

// Get doctor's lab requests
router.get('/lab-requests', auth, requireRole(['DOCTOR']), listLabRequests);

module.exports = router;
