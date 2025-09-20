const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const {
  listPrices,
  createPrice,
  updatePrice,
  deletePrice,
  listUsers,
  listDoctors,
  listPatients,
  getDashboardStats
} = require('../controllers/admin.controller');

// Admin CRUD for Prices
router.get('/prices', auth, requireRole(['ADMIN']), listPrices);
router.post('/prices', auth, requireRole(['ADMIN']), createPrice);
router.patch('/prices/:id', auth, requireRole(['ADMIN']), updatePrice);
router.delete('/prices/:id', auth, requireRole(['ADMIN']), deletePrice);

// Admin CRUD for Users
router.get('/users', auth, requireRole(['ADMIN']), listUsers);

// Admin CRUD for Doctors
router.get('/doctors', auth, requireRole(['ADMIN']), listDoctors);

// Admin CRUD for Patients
router.get('/patients', auth, requireRole(['ADMIN']), listPatients);

// Admin dashboard statistics
router.get('/dashboard', auth, requireRole(['ADMIN']), getDashboardStats);

module.exports = router;
