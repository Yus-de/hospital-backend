const prisma = require('../prisma/client');
const { sendError, sendValidationError } = require('../utils/response');

const createDoctor = async (req, res) => {
  try {
    const { name, email, specialty } = req.body;
    const doctor = await prisma.doctor.create({
      data: { name, email, specialty },
    });
    res.json(doctor);
  } catch (error) {
    console.error('Error creating doctor:', error);
    res.status(500).json({ msg: 'Failed to create doctor', error: error.message });
  }
};

const listDoctors = async (req, res) => {
  try {
    const doctors = await prisma.doctor.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(doctors);
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({ msg: 'Failed to fetch doctors', error: error.message });
  }
};

const listDoctorPatients = async (req, res) => {
  try {
    // Find the doctor record linked to this user
    const doctor = await prisma.doctor.findUnique({ 
      where: { userId: req.user.id } 
    });
    
    if (!doctor) {
      return res.status(404).json({ msg: 'Doctor profile not found' });
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
    res.status(500).json({ msg: 'Failed to fetch patients', error: error.message });
  }
};

const addAppointmentNote = async (req, res) => {
  const { id } = req.params;
  const { note } = (req.body || {});

  if (!note || typeof note !== 'string' || !note.trim()) {
    return res.status(400).json({ 
      success: false, 
      msg: 'Invalid request body', 
      requirements: { required: ['note:string (non-empty)'] } 
    });
  }

  try {
    const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
    if (!doctor) return res.status(404).json({ msg: 'Doctor profile not found' });

    const appointmentId = Number(id);
    if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
      return res.status(400).json({ msg: 'Invalid appointment id' });
    }
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
};

const createLabRequest = async (req, res) => {
  const { id } = req.params;
  const { priceId } = (req.body || {});

  if (!priceId || !Number.isInteger(Number(priceId)) || Number(priceId) <= 0) {
    return res.status(400).json({ 
      success: false, 
      msg: 'Invalid request body', 
      requirements: { required: ['priceId:number (positive integer)'] } 
    });
  }

  try {
    const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
    if (!doctor) return res.status(404).json({ msg: 'Doctor profile not found' });

    const appointmentId = Number(id);
    if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
      return res.status(400).json({ msg: 'Invalid appointment id' });
    }
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment) return res.status(404).json({ msg: 'Appointment not found' });
    if (appointment.doctorId !== doctor.id) {
      return res.status(403).json({ msg: 'Not authorized to request lab for this appointment' });
    }

    // Verify the price exists and is a LAB type
    const price = await prisma.price.findUnique({ 
      where: { id: Number(priceId) },
      select: { id: true, type: true, name: true, amount: true, active: true }
    });
    if (!price) return res.status(404).json({ msg: 'Lab examination not found' });
    if (price.type !== 'LAB') return res.status(400).json({ msg: 'Selected price is not a lab examination' });
    if (!price.active) return res.status(400).json({ msg: 'Lab examination is not active' });

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
    res.status(500).json({ msg: 'Failed to create lab request', error: e.message });
  }
};

const listLabExaminations = async (req, res) => {
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
    res.status(500).json({ msg: 'Failed to fetch lab examinations', error: e.message });
  }
};

const listLabRequests = async (req, res) => {
  try {
    const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
    if (!doctor) return res.status(404).json({ msg: 'Doctor profile not found' });

    const labRequests = await prisma.labRequest.findMany({
      where: {
        requestedByDoctorId: doctor.id
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
      }, 
      orderBy: { createdAt: 'desc' } 
    });
    res.json(labRequests);
  } catch (e) {
    res.status(500).json({ msg: 'Failed to fetch lab requests', error: e.message });
  }
};

const getPatientLabResults = async (req, res) => {
  const patientId = Number(req.params.patientId);

  if (!Number.isInteger(patientId) || patientId <= 0) {
    return sendValidationError(res, 'Invalid patient ID', { patientId: 'positive integer' });
  }

  try {
    const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
    if (!doctor) {
      return sendError(res, 404, 'Doctor profile not found');
    }

    console.log(`[DEBUG] Doctor ID: ${doctor.id}`);
    console.log(`[DEBUG] Patient ID: ${patientId}`);

    // Verify the doctor is associated with the patient through an appointment
    const hasAppointmentWithPatient = await prisma.appointment.count({
      where: {
        doctorId: doctor.id,
        patientId: patientId,
        isPaid: true, // Only consider paid appointments for result access
      },
    });

    console.log(`[DEBUG] Doctor has paid appointment with patient: ${hasAppointmentWithPatient > 0}`);

    if (hasAppointmentWithPatient === 0) {
      return sendError(res, 403, 'Not authorized to view lab results for this patient');
    }

    // Get lab requests for the specific patient and doctor, which are paid and completed
    const labResults = await prisma.labRequest.findMany({
      where: {
        appointment: {
          patientId: patientId,
          doctorId: doctor.id
        },
        isPaid: true,
        status: 'COMPLETED'
      },
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
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`[DEBUG] Lab Results: ${JSON.stringify(labResults, null, 2)}`); // Log the fetched lab results
    console.log(`[DEBUG] Lab Results: ${JSON.stringify(labResults, null, 2)}`); // Log the fetched lab results
    res.json(labResults);
  } catch (e) {
    console.error('Error fetching patient lab results:', e);
   }
};

module.exports = {
  createDoctor,
  listDoctors,
  listDoctorPatients,
  addAppointmentNote,
  createLabRequest,
  listLabExaminations,
  listLabRequests,
  getPatientLabResults
};
