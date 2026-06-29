/**
 * Wraps an async route handler and forwards any unhandled errors to Express's
 * next() error middleware, eliminating try-catch boilerplate in controllers.
 */
const asyncWrapper = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncWrapper;
