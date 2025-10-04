const prisma = require('../prisma/client');
const { sendError, sendValidationError } = require('../utils/response');
const { createInvoice, addPayment } = require('./billing.controller');

const createAppointment = async (req, res) => {
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
};

const payAppointment = async (req, res) => {
  const { id } = req.params;
  const appointmentId = Number(id);

  if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
    return sendError(res, 400, 'Invalid appointment id');
  }

  try {
    console.log(`[payAppointment] Starting transaction for appointment ID: ${appointmentId}`);
    const result = await prisma.$transaction(async (tx) => {
      // Step 1: Validate the appointment exists and is not already paid.
      const appointment = await tx.appointment.findUnique({ where: { id: appointmentId } });
      if (!appointment) {
        throw new Error('Appointment not found');
      }
      if (appointment.isPaid) {
        throw new Error('Appointment is already paid');
      }

      // Step 2: Find the price for the appointment.
      const price = await tx.price.findFirst({ where: { type: 'APPOINTMENT' } });
      if (!price) {
        throw new Error('Payment failed: Appointment pricing is not configured.');
      }
      console.log(`[payAppointment] Found price: ${price.amount}`);

      // Step 3: Mark the appointment as paid.
      const updatedAppointment = await tx.appointment.update({
        where: { id: appointmentId },
        data: { isPaid: true },
        include: { patient: true, doctor: true },
      });
      console.log(`[payAppointment] Marked appointment as paid.`);

      // Step 4: Create the invoice.
      const newInvoice = await createInvoice({
        patientId: updatedAppointment.patientId,
        items: [{ description: `Appointment with ${updatedAppointment.doctor.name}`, amount: price.amount }],
      }, tx);
      console.log(`[payAppointment] Created invoice ID: ${newInvoice.id}`);

      // Step 5: Record the payment against the new invoice.
      const { payment, invoice } = await addPayment({
        invoiceId: newInvoice.id,
        amount: price.amount,
        cashierId: req.user.id,
      }, tx);
      console.log(`[payAppointment] Added payment to invoice ID: ${newInvoice.id}`);

      return { appointment: updatedAppointment, invoice, payment };
    });

    console.log(`[payAppointment] Transaction successful for appointment ID: ${appointmentId}`);
    res.json(result);
  } catch (e) {
    console.error('Error in payAppointment transaction:', e);
    if (e.message === 'Appointment not found') {
      return sendError(res, 404, e.message);
    }
    if (e.message === 'Appointment is already paid') {
      return sendError(res, 400, e.message);
    }
    return sendError(res, 500, e.message || 'Unable to process payment.');
  }
};

const payLabRequest = async (req, res) => {
  const labRequestId = Number(req.params.id);
  if (!Number.isInteger(labRequestId) || labRequestId <= 0) {
    return sendError(res, 400, 'Invalid lab request id');
  }
  try {
    console.log(`[payLabRequest] Starting transaction for lab request ID: ${labRequestId}`);
    const result = await prisma.$transaction(async (tx) => {
      // Step 1: Validate the lab request.
      const labRequest = await tx.labRequest.findUnique({
        where: { id: labRequestId },
        include: { price: true },
      });
      if (!labRequest) {
        throw new Error('Lab request not found');
      }
      if (labRequest.isPaid) {
        throw new Error('Lab request is already paid');
      }
      if (!labRequest.price) {
        throw new Error('Payment failed: Lab request price is not configured.');
      }
      console.log(`[payLabRequest] Found price: ${labRequest.price.amount}`);

      // Step 2: Mark the lab request as paid.
      const updatedLabRequest = await tx.labRequest.update({
        where: { id: labRequestId },
        data: { isPaid: true },
        include: {
          price: true,
          appointment: { include: { patient: true, doctor: true } },
        },
      });
      console.log(`[payLabRequest] Marked lab request as paid.`);

      // Step 3: Create the invoice.
      const newInvoice = await createInvoice({
        patientId: updatedLabRequest.appointment.patientId,
        items: [{ description: `Lab Test: ${updatedLabRequest.price.name}`, amount: updatedLabRequest.price.amount }],
      }, tx);
      console.log(`[payLabRequest] Created invoice ID: ${newInvoice.id}`);

      // Step 4: Record the payment.
      const { payment, invoice } = await addPayment({
        invoiceId: newInvoice.id,
        amount: updatedLabRequest.price.amount,
        cashierId: req.user.id,
      }, tx);
      console.log(`[payLabRequest] Added payment to invoice ID: ${newInvoice.id}`);

      return { labRequest: updatedLabRequest, invoice, payment };
    });

    console.log(`[payLabRequest] Transaction successful for lab request ID: ${labRequestId}`);
    res.json(result);
  } catch (e) {
    console.error('Error in payLabRequest transaction:', e);
    if (e.message === 'Lab request not found') {
      return sendError(res, 404, e.message);
    }
    if (e.message === 'Lab request is already paid') {
      return sendError(res, 400, e.message);
    }
    return sendError(res, 500, e.message || 'Unable to process lab request payment.');
  }
};

const listAppointments = async (req, res) => {
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
};

const listLabRequests = async (req, res) => {
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
};

module.exports = {
  createAppointment,
  payAppointment,
  payLabRequest,
  listAppointments,
  listLabRequests
};
