const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const { listLabRequests, payLabRequest, submitLabResult, getAvailableLabExaminations } = require('../controllers/lab.controller');

router.get('/lab-examinations', auth, requireRole(['DOCTOR']), getAvailableLabExaminations);
router.get('/lab-requests', auth, requireRole(['DOCTOR', 'LABRATORY']), listLabRequests);
router.patch('/lab-requests/:id/pay', auth, requireRole(['CASHIER']), payLabRequest);
router.patch('/lab-requests/:id/result', auth, requireRole(['LABRATORY']), submitLabResult);

module.exports = router;


