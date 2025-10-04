const prisma = require('../prisma/client');
const { sendError, sendValidationError } = require('../utils/response');

// Medication Management
const listMedications = async (req, res) => {
  try {
    const medications = await prisma.medication.findMany({
      include: { inventory: true },
      orderBy: { name: 'asc' },
    });
    res.json(medications);
  } catch (e) {
    return sendError(res, 500, 'Failed to list medications', e);
  }
};

const createMedication = async (req, res) => {
  const { name, description } = req.body;
  if (!name) {
    return sendValidationError(res, 'Invalid request body', { required: ['name:string'] });
  }
  try {
    const medication = await prisma.medication.create({
      data: { name, description },
    });
    res.status(201).json(medication);
  } catch (e) {
    return sendError(res, 500, 'Failed to create medication', e);
  }
};

const updateMedication = async (req, res) => {
  const id = Number(req.params.id);
  const { name, description } = req.body;
  try {
    const updatedMedication = await prisma.medication.update({
      where: { id },
      data: { name, description },
    });
    res.json(updatedMedication);
  } catch (e) {
    return sendError(res, 404, 'Medication not found or failed to update', e);
  }
};

// Prescription Management
const listPrescriptions = async (req, res) => {
  try {
    const prescriptions = await prisma.prescription.findMany({
      include: {
        medication: true,
        appointment: { include: { patient: true, doctor: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(prescriptions);
  } catch (e) {
    return sendError(res, 500, 'Failed to list prescriptions', e);
  }
};

const fillPrescription = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const prescription = await prisma.prescription.findUnique({ where: { id } });
    if (!prescription) {
      return sendError(res, 404, 'Prescription not found');
    }
    if (prescription.isFilled) {
      return sendError(res, 400, 'Prescription is already filled');
    }
    const updatedPrescription = await prisma.prescription.update({
      where: { id },
      data: { isFilled: true },
    });
    res.json(updatedPrescription);
  } catch (e) {
    return sendError(res, 500, 'Failed to fill prescription', e);
  }
};

// Inventory Management
const getInventory = async (req, res) => {
  try {
    const inventory = await prisma.inventory.findMany({
      include: { medication: true },
      orderBy: { medication: { name: 'asc' } },
    });
    res.json(inventory);
  } catch (e) {
    return sendError(res, 500, 'Failed to get inventory', e);
  }
};

const updateInventory = async (req, res) => {
  const medicationId = Number(req.params.medicationId);
  const { quantity } = req.body;
  if (typeof quantity !== 'number' || quantity < 0) {
    return sendValidationError(res, 'Invalid request body', { required: ['quantity:number (positive)'] });
  }
  try {
    const inventory = await prisma.inventory.upsert({
      where: { medicationId },
      update: { quantity, lastRestocked: new Date() },
      create: { medicationId, quantity, lastRestocked: new Date() },
      include: { medication: true },
    });
    res.json(inventory);
  } catch (e) {
    return sendError(res, 500, 'Failed to update inventory', e);
  }
};

module.exports = {
  listMedications,
  createMedication,
  updateMedication,
  listPrescriptions,
  fillPrescription,
  getInventory,
  updateInventory,
};
