const prisma = require('../prisma/client');
const { sendError, sendValidationError } = require('../utils/response');

const createAppointment = async (req, res) => {
  const { patientId, doctorId, appointmentDate, reason, patient } = (req.body || {});

  if (!doctorId || !appointmentDate) {
    return sendValidationError(res, 'Invalid request body', {
      required: ['doctorId:number', 'appointmentDate:ISO-8601 string'],
      optional: ['reason:string', 'patientId:number OR patient:object'],
      patient: { requiredWhenCreating: ['name:string', 'email:string'], optional: ['phone:string', 'address:string'] }
    });
  }

  const parsedDate = new Date(appointmentDate);
  if (isNaN(parsedDate.getTime())) {
    return sendValidationError(res, 'Invalid appointmentDate', {
      appointmentDate: 'Use an ISO-8601 datetime string, e.g. 2025-09-10T09:00:00Z'
    });
  }

  try {
    const doctor = await prisma.doctor.findUnique({ where: { id: parseInt(doctorId) } });
    if (!doctor) return sendError(res, 400, 'Doctor not found');

    let finalPatientId;
    if (patientId) {
      const existingPatient = await prisma.patient.findUnique({ where: { id: parseInt(patientId) } });
      if (!existingPatient) {
        return sendValidationError(res, 'Patient not found', { patientId: 'Existing patient id must reference a valid patient' });
      }
      finalPatientId = parseInt(patientId);
    } else if (patient) {
      const { name, email, phone, address } = patient;
      if (!name || !email) {
        return sendValidationError(res, 'Invalid patient object', { patient: { required: ['name:string', 'email:string'], optional: ['phone:string', 'address:string'] } });
      }
      const existingPatient = await prisma.patient.findUnique({ where: { email } });
      if (existingPatient) finalPatientId = existingPatient.id;
      else {
        const newPatient = await prisma.patient.create({ data: { name, email, phone, address } });
        finalPatientId = newPatient.id;
      }
    } else {
      return sendValidationError(res, 'Invalid request body', { oneOf: ['patientId:number', 'patient:object with name and email'] });
    }

    const appointment = await prisma.appointment.create({
      data: { patientId: finalPatientId, doctorId: parseInt(doctorId), appointmentDate: parsedDate, reason, isPaid: false },
    });
    res.json({ message: 'Appointment created successfully', appointment, patientId: finalPatientId });
  } catch (error) {
    return sendError(res, 500, 'Failed to create appointment', error);
  }
};

const listAppointments = async (req, res) => {
  const where = {};
  if (req.user && req.user.role === 'DOCTOR') {
    where.isPaid = true;
    try {
      const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
      if (doctor) where.doctorId = doctor.id; else return res.json([]);
    } catch (e) {
      return sendError(res, 500, 'Failed to resolve doctor mapping', e);
    }
  }
  const appointments = await prisma.appointment.findMany({ where, include: { patient: true, doctor: true } });
  res.json(appointments);
};

const payAppointment = async (req, res) => {
  const { id } = req.params;
  const appointmentId = Number(id);
  if (!Number.isInteger(appointmentId) || appointmentId <= 0) return sendValidationError(res, 'Invalid appointment id', { id: 'positive integer' });
  try {
    const existing = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!existing) return sendError(res, 404, 'Appointment not found');
    if (existing.isPaid) return sendError(res, 400, 'Appointment is already paid');
    const updated = await prisma.appointment.update({ where: { id: appointmentId }, data: { isPaid: true } });
    res.json(updated);
  } catch (e) { return sendError(res, 400, 'Unable to mark paid', e); }
};

const doctorPatients = async (req, res) => {
  try {
    const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
    if (!doctor) return sendError(res, 404, 'Doctor profile not found');
    const appointments = await prisma.appointment.findMany({ where: { doctorId: doctor.id, isPaid: true }, include: { patient: true }, orderBy: { appointmentDate: 'asc' } });
    const patientsMap = new Map();
    appointments.forEach(a => {
      if (!patientsMap.has(a.patient.id)) patientsMap.set(a.patient.id, { ...a.patient, appointments: [] });
      patientsMap.get(a.patient.id).appointments.push({ id: a.id, appointmentDate: a.appointmentDate, reason: a.reason, isPaid: a.isPaid, createdAt: a.createdAt });
    });
    const patients = Array.from(patientsMap.values());
    res.json({ doctor: { id: doctor.id, name: doctor.name, specialty: doctor.specialty }, patients, totalPatients: patients.length, totalAppointments: appointments.length });
  } catch (error) { return sendError(res, 500, 'Failed to fetch patients', error); }
};

module.exports = { createAppointment, listAppointments, payAppointment, doctorPatients };


