const prisma = require('../prisma/client');
const { sendError, sendValidationError } = require('../utils/response');

const listPrices = async (req, res) => {
  try {
    const prices = await prisma.price.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(prices);
  } catch (e) { return sendError(res, 500, 'Failed to list prices', e); }
};

const createPrice = async (req, res) => {
  const { type, code, name, amount, active } = (req.body || {});
  const validTypes = ['APPOINTMENT', 'LAB'];
  if (!type || !validTypes.includes(type) || !code || !name || typeof amount !== 'number' || !(amount >= 0)) {
    return sendValidationError(res, 'Invalid request body', { required: ['type:APPOINTMENT|LAB', 'code:string', 'name:string', 'amount:number >= 0'], optional: ['active:boolean'] });
  }
  try {
    const created = await prisma.price.create({ data: { type, code, name, amount, active: active !== undefined ? !!active : true } });
    res.json(created);
  } catch (e) { return sendError(res, 400, 'Failed to create price', e); }
};

const updatePrice = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return sendValidationError(res, 'Invalid price id', { id: 'positive integer' });
  const { type, code, name, amount, active } = (req.body || {});
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
  } catch (e) { return sendError(res, 400, 'Failed to update price', e); }
};

const deletePrice = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return sendValidationError(res, 'Invalid price id', { id: 'positive integer' });
  try {
    const deleted = await prisma.price.delete({ where: { id } });
    res.json(deleted);
  } catch (e) { return sendError(res, 400, 'Failed to delete price', e); }
};

module.exports = { listPrices, createPrice, updatePrice, deletePrice };


