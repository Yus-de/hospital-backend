const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const {
  createAppointment,
  payAppointment,
  payLabRequest,
  listAppointments,
  listLabRequests
} = require('../controllers/cashier.controller');

// Only CASHIER can create appointments; created as unpaid by default
// Can also create patient if they don't exist
router.post('/appointments', auth, requireRole(['CASHIER']), createAppointment);

// Cashier marks an appointment as paid
router.post('/appointments/:id/pay', auth, requireRole(['CASHIER']), payAppointment);

// Cashier marks a lab request as paid
router.post('/lab-requests/:id/pay', auth, requireRole(['CASHIER']), payLabRequest);

// Get all appointments (for cashier management)
router.get('/appointments', auth, requireRole(['CASHIER']), listAppointments);

// Get all lab requests (for cashier management)
router.get('/lab-requests', auth, requireRole(['CASHIER']), listLabRequests);

module.exports = router;
