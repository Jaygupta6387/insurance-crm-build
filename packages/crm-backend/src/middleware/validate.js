const { sendValidationError } = require('../utils/responseHelper');

/**
 * Factory that returns Express middleware validating req.body against a Zod schema.
 */
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return sendValidationError(res, errors);
  }
  req.body = result.data; // attach parsed & coerced data
  next();
};

module.exports = validate;
