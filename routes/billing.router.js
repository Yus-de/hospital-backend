const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const {
  createInvoiceHandler,
  listInvoices,
  getInvoiceById,
  addPaymentHandler,
} = require('../controllers/billing.controller');

// Invoice routes
router.post('/invoices', auth, requireRole(['ACCOUNTANT', 'CASHIER']), createInvoiceHandler);
router.get('/invoices', auth, requireRole(['ACCOUNTANT', 'CASHIER']), listInvoices);
router.get('/invoices/:id', auth, requireRole(['ACCOUNTANT', 'CASHIER']), getInvoiceById);

// Payment routes
router.post('/invoices/:id/payments', auth, requireRole(['CASHIER']), addPaymentHandler);

module.exports = router;
