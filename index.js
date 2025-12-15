const morgan = require("morgan");
const express = require("express");
require("dotenv").config();
const cors = require("cors");

const app = express();

app.use(express.json());
app.use(morgan("combined"));


// Standard error response helper
const sendError = (res, status, msg, err) => {
  const payload = { success: false, msg };
  if (process.env.NODE_ENV !== "production" && err) {
    if (err instanceof Error) {
      payload.error = { message: err.message, stack: err.stack };
    } else {
      payload.error = err;
    }
  }
  return res.status(status).json(payload);
};

// Validation error helper with requirements payload
const sendValidationError = (res, msg, requirements) => {
  return res.status(400).json({ success: false, msg, requirements });
};

app.use(
  cors({
    origin: process.env.FRONTEND_URL, // frontend URL
    credentials: true, // allow cookies if needed
  })
);

// Route organization by functionality (existing routes)
app.use("/api", require("./routes/users"));
app.use("/api", require("./routes/appointments.router"));
app.use("/api", require("./routes/lab.router"));
app.use("/api", require("./routes/prices.router"));
app.use("/api/reports", require("./routes/reports.router"));

// Route organization by role/entity (new organized routes)
app.use("/patients", require("./routes/patients.router"));
app.use("/doctors", require("./routes/doctors.router"));
app.use("/cashier", require("./routes/cashier.router"));
app.use("/admin", require("./routes/admin.router"));
app.use("/pharmacy", require("./routes/pharmacy.router"));
app.use("/billing", require("./routes/billing.router"));

// Handle invalid endpoints
app.use((req, res, next) => {
  res.status(404).json({ msg: "Endpoint not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
