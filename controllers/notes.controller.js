const prisma = require('../prisma/client');
const { sendError, sendValidationError } = require('../utils/response');

const addNote = async (req, res) => {
  const { id } = req.params;
  const { note } = (req.body || {});
  if (!note || typeof note !== 'string' || !note.trim()) return sendValidationError(res, 'Invalid request body', { required: ['note:string (non-empty)'] });
  try {
    const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
    if (!doctor) return sendError(res, 404, 'Doctor profile not found');
    const appointmentId = Number(id);
    if (!Number.isInteger(appointmentId) || appointmentId <= 0) return sendValidationError(res, 'Invalid appointment id', { id: 'positive integer' });
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment) return sendError(res, 404, 'Appointment not found');
    if (appointment.doctorId !== doctor.id) return sendError(res, 403, 'Not authorized to add note to this appointment');
    const created = await prisma.appointmentNote.create({ data: { appointmentId, doctorId: doctor.id, note: note.trim() } });
    res.json(created);
  } catch (e) { return sendError(res, 500, 'Failed to add note', e); }
};

module.exports = { addNote };


