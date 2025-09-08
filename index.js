const express = require('express');
require('dotenv').config();
const cors = require("cors");
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

app.use(express.json());

app.use(
  cors({
    origin: "http://localhost:3000", // frontend URL
    credentials: true, // allow cookies if needed
  })
);

app.use('/api', require('./routes/users'));

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
app.post('/appointments', async (req, res) => {
  const { patientId, doctorId, appointmentDate, reason } = req.body;
  const appointment = await prisma.appointment.create({
    data: { patientId, doctorId, appointmentDate: new Date(appointmentDate), reason },
  });
  res.json(appointment);
});

app.get('/appointments', async (req, res) => {
  const appointments = await prisma.appointment.findMany();
  res.json(appointments);
});

// Handle invalid endpoints
app.use((req, res, next) => {
  res.status(404).json({ msg: 'Endpoint not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
