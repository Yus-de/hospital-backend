const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const {
  listMedications,
  createMedication,
  updateMedication,
  listPrescriptions,
  fillPrescription,
  getInventory,
  updateInventory,
} = require('../controllers/pharmacy.controller');

// Medication routes
router.get('/medications', auth, requireRole(['PHARMACY', 'DOCTOR']), listMedications);
router.post('/medications', auth, requireRole(['ADMIN', 'PHARMACY']), createMedication);
router.patch('/medications/:id', auth, requireRole(['ADMIN', 'PHARMACY']), updateMedication);

// Prescription routes
router.get('/prescriptions', auth, requireRole(['PHARMACY', 'DOCTOR']), listPrescriptions);
router.patch('/prescriptions/:id/fill', auth, requireRole(['PHARMACY']), fillPrescription);

// Inventory routes
router.get('/inventory', auth, requireRole(['PHARMACY']), getInventory);
router.patch('/inventory/:medicationId', auth, requireRole(['PHARMACY']), updateInventory);

module.exports = router;
