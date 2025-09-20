const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const { 
  listLabRequests, 
  payLabRequest, 
  submitLabResult, 
  getAvailableLabExaminations, 
  getPaidLabRequests,
  getLabRequestById,
  getLabDashboardStats
} = require('../controllers/lab.controller');

// Get all available lab examinations (for doctors to request)
router.get('/lab-examinations', auth, requireRole(['DOCTOR']), getAvailableLabExaminations);

// Get lab requests (for doctors and lab technicians)
router.get('/lab-requests', auth, requireRole(['DOCTOR', 'LABRATORY']), listLabRequests);

// Get paid lab requests (for lab technicians with filtering)
router.get('/lab-requests/paid', auth, requireRole(['LABRATORY']), getPaidLabRequests);

// Get a single lab request by ID (for lab technicians)
router.get('/lab-requests/:id', auth, requireRole(['LABRATORY']), getLabRequestById);

// Mark a lab request as paid (for cashiers)
router.patch('/lab-requests/:id/pay', auth, requireRole(['CASHIER']), payLabRequest);

// Submit a lab result (for lab technicians)
router.patch('/lab-requests/:id/result', auth, requireRole(['LABRATORY']), submitLabResult);

// Get lab dashboard statistics (for lab technicians)
router.get('/dashboard', auth, requireRole(['LABRATORY']), getLabDashboardStats);

module.exports = router;
