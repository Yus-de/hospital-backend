const express = require('express');
require('dotenv').config();
const cors = require("cors");
const { PrismaClient } = require('@prisma/client');
const { auth, requireRole } = require('./middleware/auth');

const prisma = new PrismaClient();
const app = express();

app.use(express.json());

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

app.use(
  cors({
    origin: "http://localhost:3000", // frontend URL
    credentials: true, // allow cookies if needed
  })
);

app.use('/api', require('./routes/users'));
app.use('/api', require('./routes/appointments.router'));
app.use('/api', require('./routes/lab.router'));
app.use('/api', require('./routes/prices.router'));

// Patient routes
app.post('/patients', async (req, res) => {
  const { name, email, phone, address } = req.body;
  const patient = await prisma.patient.create({
    data: { name, email, phone, address },
  });
  res.json(patient);
});

app.get('/patients', async (req, res) => {
  const patients = await prisma.patient.findMany();
  res.json(patients);
});

// Doctor routes
app.post('/doctors', async (req, res) => {
  const { name, email, specialty } = req.body;
  const doctor = await prisma.doctor.create({
    data: { name, email, specialty },
  });
  res.json(doctor);
});

app.get('/doctors', async (req, res) => {
  const doctors = await prisma.doctor.findMany();
  res.json(doctors);
});

// Appointment routes
// Only CASHIER can create appointments; created as unpaid by default
// Can also create patient if they don't exist
app.post('/appointments', auth, requireRole(['CASHIER']), async (req, res) => {
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

// Doctors only see paid appointments (optionally by their own doctorId if logged as doctor)
app.get('/appointments', auth, async (req, res) => {
  const where = {};
  // If role is DOCTOR, restrict to paid and to their doctorId if linked
  if (req.user && req.user.role === 'DOCTOR') {
    where.isPaid = true;
    // Try to find doctor by userId to filter their own appointments
    try {
      const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
      if (doctor) {
        where.doctorId = doctor.id;
      } else {
        // If no linked doctor record, return empty list for safety
        return res.json([]);
      }
    } catch (e) {
      return sendError(res, 500, 'Failed to resolve doctor mapping', e);
    }
  }

  const appointments = await prisma.appointment.findMany({ 
    where,
    include: {
      patient: true,
      doctor: true
    }
  });
  res.json(appointments);
});

// Cashier marks an appointment as paid
app.patch('/appointments/:id/pay', auth, requireRole(['CASHIER']), async (req, res) => {
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
    });
    res.json(updated);
  } catch (e) {
    return sendError(res, 400, 'Unable to mark paid', e);
  }
});

// Get doctor's assigned patients (only paid appointments)
app.get('/doctor/patients', auth, requireRole(['DOCTOR']), async (req, res) => {
  try {
    // Find the doctor record linked to this user
    const doctor = await prisma.doctor.findUnique({ 
      where: { userId: req.user.id } 
    });
    
    if (!doctor) {
      return sendError(res, 404, 'Doctor profile not found');
    }

    // Get all paid appointments for this doctor with patient details
    const appointments = await prisma.appointment.findMany({
      where: {
        doctorId: doctor.id,
        isPaid: true
      },
      include: {
        patient: true
      },
      orderBy: {
        appointmentDate: 'asc'
      }
    });

    // Extract unique patients from appointments
    const patientsMap = new Map();
    appointments.forEach(appointment => {
      if (!patientsMap.has(appointment.patient.id)) {
        patientsMap.set(appointment.patient.id, {
          ...appointment.patient,
          appointments: []
        });
      }
      patientsMap.get(appointment.patient.id).appointments.push({
        id: appointment.id,
        appointmentDate: appointment.appointmentDate,
        reason: appointment.reason,
        isPaid: appointment.isPaid,
        createdAt: appointment.createdAt
      });
    });

    const patients = Array.from(patientsMap.values());

    res.json({
      doctor: {
        id: doctor.id,
        name: doctor.name,
        specialty: doctor.specialty
      },
      patients,
      totalPatients: patients.length,
      totalAppointments: appointments.length
    });
  } catch (error) {
    console.error('Error fetching doctor patients:', error);
    return sendError(res, 500, 'Failed to fetch patients', error);
  }
});

// Doctor adds a note to an appointment (only for their own appointment)
app.post('/appointments/:id/notes', auth, requireRole(['DOCTOR']), async (req, res) => {
  const { id } = req.params;
  const { note } = (req.body || {});

  if (!note || typeof note !== 'string' || !note.trim()) {
    return sendValidationError(res, 'Invalid request body', { required: ['note:string (non-empty)'] });
  }

  try {
    const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
    if (!doctor) return sendError(res, 404, 'Doctor profile not found');

    const appointmentId = Number(id);
    if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
      return sendError(res, 400, 'Invalid appointment id');
    }
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment) return sendError(res, 404, 'Appointment not found');
    if (appointment.doctorId !== doctor.id) {
      return sendError(res, 403, 'Not authorized to add note to this appointment');
    }

    const created = await prisma.appointmentNote.create({
      data: {
        appointmentId,
        doctorId: doctor.id,
        note: note.trim(),
      },
    });
    res.json(created);
  } catch (e) {
    return sendError(res, 500, 'Failed to add note', e);
  }
});

// Doctor creates a lab request tied to an appointment (unpaid by default)
app.post('/appointments/:id/lab-requests', auth, requireRole(['DOCTOR']), async (req, res) => {
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
      return sendError(res, 400, 'Invalid appointment id');
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
        isPaid: false,
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
  } catch (e) {
    return sendError(res, 500, 'Failed to create lab request', e);
  }
});

// List lab requests
// - DOCTOR: sees all their requested lab requests (any payment status)
// - LABRATORY: sees only PAID lab requests
app.get('/lab-requests', auth, requireRole(['DOCTOR', 'LABRATORY']), async (req, res) => {
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
        appointment: { include: { patient: true, doctor: true } },
        requestedByDoctor: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(labRequests);
  } catch (e) {
    return sendError(res, 500, 'Failed to fetch lab requests', e);
  }
});

// Get available lab examinations for doctors
app.get('/lab-examinations', auth, requireRole(['DOCTOR']), async (req, res) => {
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
  } catch (e) {
    return sendError(res, 500, 'Failed to fetch lab examinations', e);
  }
});

// Cashier marks a lab request as paid
app.patch('/lab-requests/:id/pay', auth, requireRole(['CASHIER']), async (req, res) => {
  const labRequestId = Number(req.params.id);
  if (!Number.isInteger(labRequestId) || labRequestId <= 0) {
    return sendError(res, 400, 'Invalid lab request id');
  }
  try {
    const existing = await prisma.labRequest.findUnique({ where: { id: labRequestId } });
    if (!existing) return sendError(res, 404, 'Lab request not found');
    if (existing.isPaid) return sendError(res, 400, 'Lab request is already paid');
    const updated = await prisma.labRequest.update({ where: { id: labRequestId }, data: { isPaid: true } });
    res.json(updated);
  } catch (e) {
    return sendError(res, 500, 'Unable to mark lab request paid', e);
  }
});

// Lab user submits lab result (only if paid)
app.patch('/lab-requests/:id/result', auth, requireRole(['LABRATORY']), async (req, res) => {
  const labRequestId = Number(req.params.id);
  const { result } = (req.body || {});
  if (!result || typeof result !== 'string' || !result.trim()) {
    return sendValidationError(res, 'Invalid request body', { required: ['result:string (non-empty)'] });
  }
  try {
    const existing = await prisma.labRequest.findUnique({ where: { id: labRequestId } });
    if (!existing) return sendError(res, 404, 'Lab request not found');
    if (!existing.isPaid) return sendError(res, 403, 'Lab request is not paid');
    const updated = await prisma.labRequest.update({
      where: { id: labRequestId },
      data: { result: result.trim(), status: 'COMPLETED' },
    });
    res.json(updated);
  } catch (e) {
    return sendError(res, 500, 'Failed to submit result', e);
  }
});

// Admin CRUD for Prices
app.get('/prices', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const prices = await prisma.price.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(prices);
  } catch (e) {
    return sendError(res, 500, 'Failed to list prices', e);
  }
});

app.post('/prices', auth, requireRole(['ADMIN']), async (req, res) => {
  const { type, code, name, amount, active } = (req.body || {});
  const validTypes = ['APPOINTMENT', 'LAB'];
  if (!type || !validTypes.includes(type) || !code || !name || typeof amount !== 'number' || !(amount >= 0)) {
    return sendValidationError(res, 'Invalid request body', {
      required: ['type:APPOINTMENT|LAB', 'code:string', 'name:string', 'amount:number >= 0'],
      optional: ['active:boolean']
    });
  }
  try {
    const created = await prisma.price.create({
      data: { type, code, name, amount, active: active !== undefined ? !!active : true },
    });
    res.json(created);
  } catch (e) {
    return sendError(res, 400, 'Failed to create price', e);
  }
});

app.patch('/prices/:id', auth, requireRole(['ADMIN']), async (req, res) => {
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

app.delete('/prices/:id', auth, requireRole(['ADMIN']), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return sendError(res, 400, 'Invalid price id');
  try {
    const deleted = await prisma.price.delete({ where: { id } });
    res.json(deleted);
  } catch (e) {
    return sendError(res, 400, 'Failed to delete price', e);
  }
});

// Doctor adds a note to an appointment (only for their own appointment)
app.post('/appointments/:id/notes', auth, requireRole(['DOCTOR']), async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;

  if (!note || typeof note !== 'string' || !note.trim()) {
    return res.status(400).json({ msg: 'Note is required' });
  }

  try {
    const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
    if (!doctor) return res.status(404).json({ msg: 'Doctor profile not found' });

    const appointmentId = Number(id);
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment) return res.status(404).json({ msg: 'Appointment not found' });
    if (appointment.doctorId !== doctor.id) {
      return res.status(403).json({ msg: 'Not authorized to add note to this appointment' });
    }

    const created = await prisma.appointmentNote.create({
      data: {
        appointmentId,
        doctorId: doctor.id,
        note: note.trim(),
      },
    });
    res.json(created);
  } catch (e) {
    res.status(500).json({ msg: 'Failed to add note', error: e.message });
  }
});





// Admin CRUD for Prices
app.get('/prices', auth, requireRole(['ADMIN']), async (req, res) => {
  try {
    const prices = await prisma.price.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(prices);
  } catch (e) {
    res.status(500).json({ msg: 'Failed to list prices', error: e.message });
  }
});

app.post('/prices', auth, requireRole(['ADMIN']), async (req, res) => {
  const { type, code, name, amount, active } = req.body;
  if (!type || !code || !name || typeof amount !== 'number') {
    return res.status(400).json({ msg: 'type, code, name, amount are required' });
  }
  try {
    const created = await prisma.price.create({
      data: { type, code, name, amount, active: active !== undefined ? !!active : true },
    });
    res.json(created);
  } catch (e) {
    res.status(400).json({ msg: 'Failed to create price', error: e.message });
  }
});

app.patch('/prices/:id', auth, requireRole(['ADMIN']), async (req, res) => {
  const id = Number(req.params.id);
  const { type, code, name, amount, active } = (req.body || {});
  try {
    const updated = await prisma.price.update({
      where: { id },
      data: {
        ...(type ? { type } : {}),
        ...(code ? { code } : {}),
        ...(name ? { name } : {}),
        ...(amount !== undefined ? { amount: Number(amount) } : {}),
        ...(active !== undefined ? { active: !!active } : {}),
      },
    });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ msg: 'Failed to update price', error: e.message });
  }
});

app.delete('/prices/:id', auth, requireRole(['ADMIN']), async (req, res) => {
  const id = Number(req.params.id);
  try {
    const deleted = await prisma.price.delete({ where: { id } });
    res.json(deleted);
  } catch (e) {
    res.status(400).json({ msg: 'Failed to delete price', error: e.message });
  }
});

// Handle invalid endpoints
app.use((req, res, next) => {
  res.status(404).json({ msg: 'Endpoint not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
