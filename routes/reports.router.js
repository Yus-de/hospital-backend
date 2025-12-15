const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const { getFinancialReport } = require('../controllers/reports.controller');

router.get('/financial', auth, requireRole(['ACCOUNTANT', 'ADMIN']), getFinancialReport);

module.exports = router;
