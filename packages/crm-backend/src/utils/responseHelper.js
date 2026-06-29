/**
 * Centralised HTTP response helpers — keeps controller code consistent.
 */

const sendSuccess = (res, data = {}, message = 'Success', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data });

const sendCreated = (res, data = {}, message = 'Created successfully') =>
  res.status(201).json({ success: true, message, data });

const sendError = (res, message = 'Something went wrong', statusCode = 500, errors = []) =>
  res.status(statusCode).json({ success: false, message, errors });

const sendValidationError = (res, errors) =>
  res.status(422).json({ success: false, message: 'Validation failed', errors });

const sendUnauthorized = (res, message = 'Unauthorised — please log in') =>
  res.status(401).json({ success: false, message });

const sendForbidden = (res, message = 'Forbidden — you do not have permission') =>
  res.status(403).json({ success: false, message });

const sendNotFound = (res, message = 'Resource not found') =>
  res.status(404).json({ success: false, message });

module.exports = {
  sendSuccess,
  sendCreated,
  sendError,
  sendValidationError,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
};
