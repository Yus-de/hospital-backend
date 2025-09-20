const express = require('express');
const router = express.Router();
const {
  createPatient,
  listPatients,
  getPatientById,
  updatePatient,
  deletePatient
} = require('../controllers/patients.controller');

// Create a new patient
router.post('/', createPatient);

// Get all patients
router.get('/', listPatients);

// Get patient by ID
router.get('/:id', getPatientById);

// Update patient
router.patch('/:id', updatePatient);

// Delete patient
router.delete('/:id', deletePatient);

module.exports = router;
