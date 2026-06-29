const employeeService = require('./employee.service');
const asyncWrapper = require('../../utils/asyncWrapper');
const { sendSuccess, sendCreated, sendSuccess: sendOk } = require('../../utils/responseHelper');

const createEmployee = asyncWrapper(async (req, res) => {
  const employee = await employeeService.createEmployee(
    req.body,
    req.user.sub,
    req.companySlug
  );
  sendCreated(res, { employee }, 'Employee created successfully');
});

const getEmployees = asyncWrapper(async (req, res) => {
  const employees = await employeeService.getEmployees(req.companySlug);
  sendSuccess(res, { employees, count: employees.length });
});

const getEmployee = asyncWrapper(async (req, res) => {
  const employee = await employeeService.getEmployee(req.params.id, req.companySlug);
  sendSuccess(res, { employee });
});

const updateEmployee = asyncWrapper(async (req, res) => {
  const employee = await employeeService.updateEmployee(
    req.params.id,
    req.body,
    req.user.sub,
    req.companySlug
  );
  sendSuccess(res, { employee }, 'Employee updated successfully');
});

const blockEmployee = asyncWrapper(async (req, res) => {
  await employeeService.blockEmployee(req.params.id, req.user.sub, req.companySlug);
  sendSuccess(res, {}, 'Employee blocked successfully');
});

const unblockEmployee = asyncWrapper(async (req, res) => {
  await employeeService.unblockEmployee(req.params.id, req.user.sub, req.companySlug);
  sendSuccess(res, {}, 'Employee unblocked successfully');
});

const deleteEmployee = asyncWrapper(async (req, res) => {
  await employeeService.deleteEmployee(req.params.id, req.user.sub, req.companySlug);
  sendSuccess(res, {}, 'Employee deleted successfully');
});

module.exports = {
  createEmployee,
  getEmployees,
  getEmployee,
  updateEmployee,
  blockEmployee,
  unblockEmployee,
  deleteEmployee,
};
