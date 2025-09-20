const prisma = require('../prisma/client');
const { sendError, sendValidationError } = require('../utils/response');

const listPrices = async (req, res) => {
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
};

const createPrice = async (req, res) => {
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
};

const updatePrice = async (req, res) => {
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
};

const deletePrice = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return sendError(res, 400, 'Invalid price id');
  try {
    const deleted = await prisma.price.delete({ where: { id } });
    res.json(deleted);
  } catch (e) {
    return sendError(res, 400, 'Failed to delete price', e);
  }
};

const listUsers = async (req, res) => {
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
};

const listDoctors = async (req, res) => {
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
};

const listPatients = async (req, res) => {
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
};

const getDashboardStats = async (req, res) => {
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
};

module.exports = {
  listPrices,
  createPrice,
  updatePrice,
  deletePrice,
  listUsers,
  listDoctors,
  listPatients,
  getDashboardStats
};
