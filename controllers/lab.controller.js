const prisma = require('../prisma/client');
const { sendError, sendValidationError } = require('../utils/response');

const createLabRequest = async (req, res) => {
  const { id } = req.params;
  const { priceId } = (req.body || {});
  if (!priceId || !Number.isInteger(Number(priceId)) || Number(priceId) <= 0) {
    return sendValidationError(res, 'Invalid request body', { required: ['priceId:number (positive integer)'] });
  }
  try {
    const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
    if (!doctor) return sendError(res, 404, 'Doctor profile not found');
    
    const appointmentId = Number(id);
    if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
      return sendValidationError(res, 'Invalid appointment id', { id: 'positive integer' });
    }
    
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment) return sendError(res, 404, 'Appointment not found');
    if (appointment.doctorId !== doctor.id) {
      return sendError(res, 403, 'Not authorized to request lab for this appointment');
    }
    
    // Verify the price exists and is a LAB type
    const price = await prisma.price.findUnique({ 
      where: { id: Number(priceId) },
      select: { id: true, type: true, name: true, amount: true, active: true }
    });
    if (!price) return sendError(res, 404, 'Lab examination not found');
    if (price.type !== 'LAB') return sendError(res, 400, 'Selected price is not a lab examination');
    if (!price.active) return sendError(res, 400, 'Lab examination is not active');
    
    const labRequest = await prisma.labRequest.create({ 
      data: { 
        appointmentId, 
        requestedByDoctorId: doctor.id, 
        priceId: Number(priceId), 
        isPaid: false 
      },
      include: {
        price: true,
        appointment: {
          include: {
            patient: true,
            doctor: true
          }
        },
        requestedByDoctor: true
      }
    });
    res.json(labRequest);
  } catch (e) { return sendError(res, 500, 'Failed to create lab request', e); }
};

const listLabRequests = async (req, res) => {
  try {
    let where = {};
    if (req.user.role === 'DOCTOR') {
      const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
      if (!doctor) return sendError(res, 404, 'Doctor profile not found');
      where.requestedByDoctorId = doctor.id;
    } else if (req.user.role === 'LABRATORY') {
      where.isPaid = true;
    }
    const labRequests = await prisma.labRequest.findMany({ 
      where, 
      include: { 
        price: true,
        appointment: { 
          include: { 
            patient: true, 
            doctor: true 
          } 
        }, 
        requestedByDoctor: true 
      }, 
      orderBy: { createdAt: 'desc' } 
    });
    res.json(labRequests);
  } catch (e) { return sendError(res, 500, 'Failed to fetch lab requests', e); }
};

const payLabRequest = async (req, res) => {
  const labRequestId = Number(req.params.id);
  if (!Number.isInteger(labRequestId) || labRequestId <= 0) return sendValidationError(res, 'Invalid lab request id', { id: 'positive integer' });
  try {
    const existing = await prisma.labRequest.findUnique({ where: { id: labRequestId } });
    if (!existing) return sendError(res, 404, 'Lab request not found');
    if (existing.isPaid) return sendError(res, 400, 'Lab request is already paid');
    const updated = await prisma.labRequest.update({ where: { id: labRequestId }, data: { isPaid: true } });
    res.json(updated);
  } catch (e) { return sendError(res, 500, 'Unable to mark lab request paid', e); }
};

const submitLabResult = async (req, res) => {
  const labRequestId = Number(req.params.id);
  const { result } = (req.body || {});
  if (!result || typeof result !== 'string' || !result.trim()) return sendValidationError(res, 'Invalid request body', { required: ['result:string (non-empty)'] });
  try {
    const existing = await prisma.labRequest.findUnique({ where: { id: labRequestId } });
    if (!existing) return sendError(res, 404, 'Lab request not found');
    if (!existing.isPaid) return sendError(res, 403, 'Lab request is not paid');
    const updated = await prisma.labRequest.update({ where: { id: labRequestId }, data: { result: result.trim(), status: 'COMPLETED' } });
    res.json(updated);
  } catch (e) { return sendError(res, 500, 'Failed to submit result', e); }
};

const getAvailableLabExaminations = async (req, res) => {
  try {
    const labExaminations = await prisma.price.findMany({
      where: {
        type: 'LAB',
        active: true
      },
      select: {
        id: true,
        code: true,
        name: true,
        amount: true
      },
      orderBy: {
        name: 'asc'
      }
    });
    res.json(labExaminations);
  } catch (e) { return sendError(res, 500, 'Failed to fetch lab examinations', e); }
};

const getPaidLabRequests = async (req, res) => {
  try {
    const { status, testType } = req.query;
    
    // Build where clause for paid lab requests
    let where = {
      isPaid: true
    };
    
    // Filter by status if provided
    if (status && ['REQUESTED', 'COMPLETED'].includes(status)) {
      where.status = status;
    }
    
    // Filter by test type if provided
    if (testType) {
      where.price = {
        code: {
          contains: testType,
          mode: 'insensitive'
        }
      };
    }
    
    const paidLabRequests = await prisma.labRequest.findMany({
      where,
      include: {
        price: {
          select: {
            id: true,
            code: true,
            name: true,
            amount: true
          }
        },
        appointment: {
          include: {
            patient: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true
              }
            },
            doctor: {
              select: {
                id: true,
                name: true,
                specialty: true
              }
            }
          }
        },
        requestedByDoctor: {
          select: {
            id: true,
            name: true,
            specialty: true
          }
        }
      },
      orderBy: [
        { status: 'asc' }, // REQUESTED first, then COMPLETED
        { createdAt: 'desc' }
      ]
    });
    
    // Add summary information
    const summary = {
      total: paidLabRequests.length,
      requested: paidLabRequests.filter(req => req.status === 'REQUESTED').length,
      completed: paidLabRequests.filter(req => req.status === 'COMPLETED').length,
      totalAmount: paidLabRequests.reduce((sum, req) => sum + req.price.amount, 0)
    };
    
    res.json({
      summary,
      labRequests: paidLabRequests
    });
  } catch (e) { 
    return sendError(res, 500, 'Failed to fetch paid lab requests', e); 
  }
};

const getLabRequestById = async (req, res) => {
  try {
    const labRequestId = Number(req.params.id);
    if (!Number.isInteger(labRequestId) || labRequestId <= 0) {
      return sendError(res, 400, 'Invalid lab request id');
    }

    const labRequest = await prisma.labRequest.findUnique({
      where: { id: labRequestId },
      include: {
        price: true,
        appointment: {
          include: {
            patient: true,
            doctor: true
          }
        },
        requestedByDoctor: true
      }
    });

    if (!labRequest) {
      return sendError(res, 404, 'Lab request not found');
    }

    if (!labRequest.isPaid) {
      return sendError(res, 403, 'Lab request is not paid');
    }

    res.json(labRequest);
  } catch (e) {
    return sendError(res, 500, 'Failed to fetch lab request', e);
  }
};

const getLabDashboardStats = async (req, res) => {
  try {
    const [
      totalPaidRequests,
      pendingRequests,
      completedRequests,
      todayRequests,
      todayCompleted
    ] = await Promise.all([
      prisma.labRequest.count({ where: { isPaid: true } }),
      prisma.labRequest.count({ where: { isPaid: true, status: 'REQUESTED' } }),
      prisma.labRequest.count({ where: { isPaid: true, status: 'COMPLETED' } }),
      prisma.labRequest.count({
        where: {
          isPaid: true,
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      }),
      prisma.labRequest.count({
        where: {
          isPaid: true,
          status: 'COMPLETED',
          updatedAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      })
    ]);

    const stats = {
      totalPaidRequests,
      pendingRequests,
      completedRequests,
      todayRequests,
      todayCompleted,
      completionRate: totalPaidRequests > 0 ? (completedRequests / totalPaidRequests * 100).toFixed(1) : 0
    };

    res.json(stats);
  } catch (e) {
    return sendError(res, 500, 'Failed to fetch dashboard statistics', e);
  }
};

module.exports = { createLabRequest, listLabRequests, payLabRequest, submitLabResult, getAvailableLabExaminations, getPaidLabRequests, getLabRequestById, getLabDashboardStats };
