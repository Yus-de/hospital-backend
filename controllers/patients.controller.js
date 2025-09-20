const prisma = require('../prisma/client');
const { sendError, sendValidationError } = require('../utils/response');

const createPatient = async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    const patient = await prisma.patient.create({
      data: { name, email, phone, address },
    });
    res.json(patient);
  } catch (error) {
    console.error('Error creating patient:', error);
    res.status(500).json({ msg: 'Failed to create patient', error: error.message });
  }
};

const listPatients = async (req, res) => {
  try {
    const patients = await prisma.patient.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(patients);
  } catch (error) {
    console.error('Error fetching patients:', error);
    res.status(500).json({ msg: 'Failed to fetch patients', error: error.message });
  }
};

const getPatientById = async (req, res) => {
  try {
    const patientId = Number(req.params.id);
    if (!Number.isInteger(patientId) || patientId <= 0) {
      return res.status(400).json({ msg: 'Invalid patient id' });
    }

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        appointments: {
          include: {
            doctor: true,
            notes: true,
            labRequests: {
              include: {
                price: true
              }
            }
          }
        }
      }
    });

    if (!patient) {
      return res.status(404).json({ msg: 'Patient not found' });
    }

    res.json(patient);
  } catch (error) {
    console.error('Error fetching patient:', error);
    res.status(500).json({ msg: 'Failed to fetch patient', error: error.message });
  }
};

const updatePatient = async (req, res) => {
  try {
    const patientId = Number(req.params.id);
    if (!Number.isInteger(patientId) || patientId <= 0) {
      return res.status(400).json({ msg: 'Invalid patient id' });
    }

    const { name, email, phone, address } = req.body;
    const data = {};
    
    if (name) data.name = name;
    if (email) data.email = email;
    if (phone) data.phone = phone;
    if (address) data.address = address;

    const updatedPatient = await prisma.patient.update({
      where: { id: patientId },
      data
    });

    res.json(updatedPatient);
  } catch (error) {
    console.error('Error updating patient:', error);
    res.status(500).json({ msg: 'Failed to update patient', error: error.message });
  }
};

const deletePatient = async (req, res) => {
  try {
    const patientId = Number(req.params.id);
    if (!Number.isInteger(patientId) || patientId <= 0) {
      return res.status(400).json({ msg: 'Invalid patient id' });
    }

    const deletedPatient = await prisma.patient.delete({
      where: { id: patientId }
    });

    res.json(deletedPatient);
  } catch (error) {
    console.error('Error deleting patient:', error);
    res.status(500).json({ msg: 'Failed to delete patient', error: error.message });
  }
};

module.exports = {
  createPatient,
  listPatients,
  getPatientById,
  updatePatient,
  deletePatient
};
