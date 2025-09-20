const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { auth, requireRole } = require('../middleware/auth');

const prisma = new PrismaClient();

// Standard error response helper
const sendError = (res, status, msg, err) => {
  const payload = { success: false, msg };
  if (process.env.NODE_ENV !== 'production' && err) {
    payload.error = typeof err === 'string' ? err : err.message;
  }
  return res.status(status).json(payload);
};

// Validation error helper with requirements payload
const sendValidationError = (res, msg, requirements) => {
  return res.status(400).json({ success: false, msg, requirements });
};

// Admin CRUD for Prices
router.get('/prices', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { type, active } = req.query;
    
    let where = {};
    if (type) {
      where.type = type;
    }
    if (active !== undefined) {
      where.active = active === 'true';
    }

    const prices = await prisma.price.findMany({ 
      where,
      orderBy: { createdAt: 'desc' } 
    });
    res.json(prices);
  } catch (e) {
    return sendError(res, 500, 'Failed to list prices', e);
  }
});

router.post('/prices', auth, requireRole(['ADMIN']), async (req, res) => {
  const { type, code, name, amount, active } = (req.body || {});
  const validTypes = ['APPOINTMENT', 'LAB'];
  if (!type || !validTypes.includes(type) || !code || !name || typeof amount !== 'number' || !(amount >= 0)) {
    return sendValidationError(res, 'Invalid request body', {
      required: ['type:APPOINTMENT|LAB', 'code:string', 'name:string', 'amount:number >= 0'],
      optional: ['active:boolean']
    });
  }
  try {
    // Check if price with same type and code already exists
    const existing = await prisma.price.findUnique({
      where: { type_code: { type, code } }
    });
    
    if (existing) {
      return sendError(res, 409, `Price with type '${type}' and code '${code}' already exists`, {
        existing: {
          id: existing.id,
          name: existing.name,
          amount: existing.amount,
          active: existing.active
        },
        suggestion: 'Use a different code or update the existing price'
      });
    }
    
    const created = await prisma.price.create({
      data: { type, code, name, amount, active: active !== undefined ? !!active : true },
    });
    res.json(created);
  } catch (e) {
    return sendError(res, 400, 'Failed to create price', e);
  }
});

router.patch('/prices/:id', auth, requireRole(['ADMIN']), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return sendValidationError(res, 'Invalid price id', { id: 'positive integer' });
  const { type, code, name, amount, active } = req.body;
  const data = {};
  if (type) {
    const validTypes = ['APPOINTMENT', 'LAB'];
    if (!validTypes.includes(type)) return sendValidationError(res, 'Invalid type', { type: 'APPOINTMENT|LAB' });
    data.type = type;
  }
  if (code) data.code = code;
  if (name) data.name = name;
  if (amount !== undefined) {
    const num = Number(amount);
    if (Number.isNaN(num) || num < 0) return sendValidationError(res, 'Invalid amount', { amount: 'number >= 0' });
    data.amount = num;
  }
  if (active !== undefined) data.active = !!active;
  try {
    const updated = await prisma.price.update({ where: { id }, data });
    res.json(updated);
  } catch (e) {
    return sendError(res, 400, 'Failed to update price', e);
  }
});

router.delete('/prices/:id', auth, requireRole(['ADMIN']), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return sendError(res, 400, 'Invalid price id');
  try {
    const deleted = await prisma.price.delete({ where: { id } });
    res.json(deleted);
  } catch (e) {
    return sendError(res, 400, 'Failed to delete price', e);
  }
});

// Admin CRUD for Users
router.get('/users', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { role } = req.query;
    
    let where = {};
    if (role) {
      where.role = role;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        doctor: {
          select: {
            id: true,
            name: true,
            specialty: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (e) {
    return sendError(res, 500, 'Failed to list users', e);
  }
});

// Admin CRUD for Doctors
router.get('/doctors', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const doctors = await prisma.doctor.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true
          }
        },
        appointments: {
          select: {
            id: true,
            appointmentDate: true,
            isPaid: true
          }
        },
        requestedLabs: {
          select: {
            id: true,
            status: true,
            isPaid: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(doctors);
  } catch (e) {
    return sendError(res, 500, 'Failed to list doctors', e);
  }
});

// Admin CRUD for Patients
router.get('/patients', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const patients = await prisma.patient.findMany({
      include: {
        appointments: {
          select: {
            id: true,
            appointmentDate: true,
            isPaid: true,
            doctor: {
              select: {
                name: true,
                specialty: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(patients);
  } catch (e) {
    return sendError(res, 500, 'Failed to list patients', e);
  }
});

// Admin dashboard statistics
router.get('/dashboard', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const [
      totalPatients,
      totalDoctors,
      totalAppointments,
      paidAppointments,
      totalLabRequests,
      paidLabRequests,
      completedLabRequests,
      totalRevenue
    ] = await Promise.all([
      prisma.patient.count(),
      prisma.doctor.count(),
      prisma.appointment.count(),
      prisma.appointment.count({ where: { isPaid: true } }),
      prisma.labRequest.count(),
      prisma.labRequest.count({ where: { isPaid: true } }),
      prisma.labRequest.count({ where: { status: 'COMPLETED' } }),
      prisma.labRequest.aggregate({
        where: { isPaid: true },
        _sum: { price: { amount: true } }
      })
    ]);

    const stats = {
      patients: {
        total: totalPatients
      },
      doctors: {
        total: totalDoctors
      },
      appointments: {
        total: totalAppointments,
        paid: paidAppointments,
        unpaid: totalAppointments - paidAppointments
      },
      labRequests: {
        total: totalLabRequests,
        paid: paidLabRequests,
        completed: completedLabRequests,
        pending: paidLabRequests - completedLabRequests
      },
      revenue: {
        total: totalRevenue._sum.price?.amount || 0
      }
    };

    res.json(stats);
  } catch (e) {
    return sendError(res, 500, 'Failed to fetch dashboard statistics', e);
  }
});

module.exports = router;
