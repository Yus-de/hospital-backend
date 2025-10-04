const prisma = require('../prisma/client');
const { sendError, sendValidationError } = require('../utils/response');

const createInvoice = async (invoiceData, prismaClient = prisma) => {
  const { patientId, items } = invoiceData;

  if (!patientId || !Array.isArray(items) || items.length === 0) {
    throw new Error('Invalid invoice data');
  }

  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

  const invoice = await prismaClient.invoice.create({
    data: {
      patientId,
      totalAmount,
      isPaid: false,
      items: {
        create: items,
      },
    },
    include: {
      items: true,
      patient: true,
    },
  });

  return invoice;
};

const createInvoiceHandler = async (req, res) => {
  try {
    const invoice = await createInvoice(req.body);
    res.status(201).json(invoice);
  } catch (e) {
    if (e.message === 'Invalid invoice data') {
      return sendValidationError(res, 'Invalid request body', {
        required: ['patientId:number', 'items:array (non-empty)'],
        itemShape: { description: 'string', amount: 'number' },
      });
    }
    return sendError(res, 500, 'Failed to create invoice', e);
  }
};

const listInvoices = async (req, res) => {
  try {
    const { patientId, isPaid } = req.query;
    console.log(`[listInvoices] Received query params: patientId=${patientId}, isPaid=${isPaid}`);
    
    const where = {};

    if (patientId) {
      const numPatientId = Number(patientId);
      if (!isNaN(numPatientId)) {
        where.patientId = numPatientId;
      } else {
        console.warn(`[listInvoices] Invalid patientId received: ${patientId}`);
      }
    }
    if (isPaid !== undefined) {
      where.isPaid = isPaid === 'true';
    }

    console.log('[listInvoices] Executing findMany with where clause:', JSON.stringify(where, null, 2));

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        patient: true,
        items: true,
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`[listInvoices] Found ${invoices.length} invoices.`);

    res.json(invoices);
  } catch (e) {
    console.error('[listInvoices] Error:', e);
    return sendError(res, 500, 'Failed to list invoices', e);
  }
};

const getInvoiceById = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        patient: true,
        items: true,
        payments: true,
      },
    });

    if (!invoice) {
      return sendError(res, 404, 'Invoice not found');
    }

    res.json(invoice);
  } catch (e) {
    return sendError(res, 500, 'Failed to retrieve invoice', e);
  }
};

const addPayment = async (paymentData, prismaClient = prisma) => {
  const { invoiceId, amount } = paymentData;

  if (typeof amount !== 'number' || amount <= 0 || !invoiceId) {
    throw new Error('Invalid payment data');
  }

  const invoice = await prismaClient.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });

  if (!invoice) {
    throw new Error('Invoice not found');
  }

  const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
  if (totalPaid + amount > invoice.totalAmount) {
    throw new Error('Payment exceeds amount due');
  }

  const payment = await prismaClient.payment.create({
    data: {
      invoiceId,
      amount,
    },
    select: {
      id: true,
      invoiceId: true,
      amount: true,
      transactionId: true,
      paymentDate: true,
      createdAt: true,
    },
  });

  const newTotalPaid = totalPaid + amount;
  const isPaid = newTotalPaid >= invoice.totalAmount;

  const updatedInvoice = await prismaClient.invoice.update({
    where: { id: invoiceId },
    data: { isPaid },
    include: {
      patient: true,
      items: true,
      payments: true,
    },
  });

  return { payment, invoice: updatedInvoice };
};

const addPaymentHandler = async (req, res) => {
  try {
    const paymentData = {
      invoiceId: Number(req.params.id),
      amount: req.body.amount,
    };
    const result = await addPayment(paymentData);
    res.status(201).json(result);
  } catch (e) {
    if (e.message === 'Invalid payment data') {
      return sendValidationError(res, 'Invalid request body', { required: ['amount:number (positive)'] });
    }
    if (e.message === 'Invoice not found') {
      return sendError(res, 404, 'Invoice not found');
    }
    if (e.message === 'Payment exceeds amount due') {
      return sendError(res, 400, 'Payment exceeds amount due');
    }
    return sendError(res, 500, 'Failed to add payment', e);
  }
};

module.exports = {
  createInvoice,
  createInvoiceHandler,
  listInvoices,
  getInvoiceById,
  addPayment,
  addPaymentHandler,
};
