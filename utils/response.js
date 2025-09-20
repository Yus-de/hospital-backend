const sendError = (res, status, msg, err) => {
  const payload = { success: false, msg };
  if (process.env.NODE_ENV !== 'production' && err) {
    payload.error = typeof err === 'string' ? err : err.message;
  }
  return res.status(status).json(payload);
};

const sendValidationError = (res, msg, requirements) => {
  return res.status(400).json({ success: false, msg, requirements });
};

module.exports = { sendError, sendValidationError };


