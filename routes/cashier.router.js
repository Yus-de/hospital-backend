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

// Only CASHIER can create appointments; created as unpaid by default
// Can also create patient if they don't exist
router.post('/appointments', auth, requireRole(['CASHIER']), async (req, res) => {
  const { patientId, doctorId, appointmentDate, reason, patient } = (req.body || {});
  
  // Validate required fields
  if (!doctorId || !appointmentDate) {
    return sendValidationError(res, 'Invalid request body', {
      required: ['doctorId:number', 'appointmentDate:ISO-8601 string'],
      optional: ['reason:string', 'patientId:number OR patient:object'],
      patient: {
        requiredWhenCreating: ['name:string', 'email:string'],
        optional: ['phone:string', 'address:string']
      }
    });
  }
  
  // Validate and parse date
  const parsedDate = new Date(appointmentDate);
  if (isNaN(parsedDate.getTime())) {
    return sendValidationError(res, 'Invalid appointmentDate', {
      appointmentDate: 'Use an ISO-8601 datetime string, e.g. 2025-09-10T09:00:00Z'
    });
  }
  
  try {
    // Step 1: Validate doctor exists
    const doctor = await prisma.doctor.findUnique({ where: { id: parseInt(doctorId) } });
    if (!doctor) {
      return sendError(res, 400, 'Doctor not found');
    }
    
    // Step 2: Handle patient - create if needed, or validate existing
    let finalPatientId;
    
    if (patientId) {
      // Use existing patient
      const existingPatient = await prisma.patient.findUnique({ where: { id: parseInt(patientId) } });
      if (!existingPatient) {
        return sendValidationError(res, 'Patient not found', {
          patientId: 'Existing patient id must reference a valid patient'
        });
      }
      finalPatientId = parseInt(patientId);
    } else if (patient) {
      // Create new patient first
      const { name, email, phone, address } = patient;
      if (!name || !email) {
        return sendValidationError(res, 'Invalid patient object', {
          patient: { required: ['name:string', 'email:string'], optional: ['phone:string', 'address:string'] }
        });
      }
      
      // Check if patient with this email already exists
      const existingPatient = await prisma.patient.findUnique({ where: { email } });
      if (existingPatient) {
        finalPatientId = existingPatient.id;
      } else {
        // Create new patient
        const newPatient = await prisma.patient.create({
          data: { name, email, phone, address }
        });
        finalPatientId = newPatient.id;
      }
    } else {
      return sendValidationError(res, 'Invalid request body', {
        oneOf: ['patientId:number', 'patient:object with name and email']
      });
    }
    
    // Step 3: Create appointment after patient is ready
    const appointment = await prisma.appointment.create({
      data: { 
        patientId: finalPatientId, 
        doctorId: parseInt(doctorId), 
        appointmentDate: parsedDate, 
        reason, 
        isPaid: false 
      },
      include: {
        patient: true,
        doctor: true
      }
    });
    
    res.json({
      message: 'Appointment created successfully',
      appointment,
      patientId: finalPatientId
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return sendError(res, 500, 'Failed to create appointment', error);
  }
});

// Cashier marks an appointment as paid
router.patch('/appointments/:id/pay', auth, requireRole(['CASHIER']), async (req, res) => {
  const { id } = req.params;
  const appointmentId = Number(id);

  if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
    return sendError(res, 400, 'Invalid appointment id');
  }

  try {
    const existing = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!existing) {
      return sendError(res, 404, 'Appointment not found');
    }

    if (existing.isPaid) {
      return sendError(res, 400, 'Appointment is already paid');
    }

    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { isPaid: true },
      include: {
        patient: true,
        doctor: true
      }
    });
    res.json(updated);
  } catch (e) {
    return sendError(res, 400, 'Unable to mark paid', e);
  }
});

// Cashier marks a lab request as paid
router.patch('/lab-requests/:id/pay', auth, requireRole(['CASHIER']), async (req, res) => {
  const labRequestId = Number(req.params.id);
  if (!Number.isInteger(labRequestId) || labRequestId <= 0) {
    return sendError(res, 400, 'Invalid lab request id');
  }
  try {
    const existing = await prisma.labRequest.findUnique({ where: { id: labRequestId } });
    if (!existing) return sendError(res, 404, 'Lab request not found');
    if (existing.isPaid) return sendError(res, 400, 'Lab request is already paid');
    const updated = await prisma.labRequest.update({ 
      where: { id: labRequestId }, 
      data: { isPaid: true },
      include: {
        price: true,
        appointment: {
          include: {
            patient: true,
            doctor: true
          }
        }
      }
    });
    res.json(updated);
  } catch (e) {
    return sendError(res, 500, 'Unable to mark lab request paid', e);
  }
});

// Get all appointments (for cashier management)
router.get('/appointments', auth, requireRole(['CASHIER']), async (req, res) => {
  try {
    const { isPaid, doctorId, patientId } = req.query;
    
    let where = {};
    if (isPaid !== undefined) {
      where.isPaid = isPaid === 'true';
    }
    if (doctorId) {
      where.doctorId = parseInt(doctorId);
    }
    if (patientId) {
      where.patientId = parseInt(patientId);
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        patient: true,
        doctor: true,
        labRequests: {
          include: {
            price: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(appointments);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    return sendError(res, 500, 'Failed to fetch appointments', error);
  }
});

// Get all lab requests (for cashier management)
router.get('/lab-requests', auth, requireRole(['CASHIER']), async (req, res) => {
  try {
    const { isPaid, status } = req.query;
    
    let where = {};
    if (isPaid !== undefined) {
      where.isPaid = isPaid === 'true';
    }
    if (status) {
      where.status = status;
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
  } catch (error) {
    console.error('Error fetching lab requests:', error);
    return sendError(res, 500, 'Failed to fetch lab requests', error);
  }
});

module.exports = router;
