const express = require('express');
const router = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const { listPrices, createPrice, updatePrice, deletePrice } = require('../controllers/prices.controller');

router.get('/prices', auth, requireRole(['ADMIN']), listPrices);
router.post('/prices', auth, requireRole(['ADMIN']), createPrice);
router.patch('/prices/:id', auth, requireRole(['ADMIN']), updatePrice);
router.delete('/prices/:id', auth, requireRole(['ADMIN']), deletePrice);

module.exports = router;


