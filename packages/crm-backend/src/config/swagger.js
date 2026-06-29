const swaggerJsdoc = require('swagger-jsdoc');
const { swagger, port } = require('./env');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: swagger.title,
      version: swagger.version,
      description: swagger.description,
    },
    servers: [{ url: `http://localhost:${port}/api`, description: 'Development server' }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      responses: {
        Unauthorized: {
          description: 'Unauthorised — missing or invalid Bearer token',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        Forbidden: {
          description: 'Forbidden — insufficient role or permission',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            errors: { type: 'array', items: { type: 'object' } },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password', 'company_slug'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            company_slug: { type: 'string' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            full_name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string', nullable: true },
            role: { type: 'string', enum: ['ADMIN', 'EXECUTIVE'] },
            is_active: { type: 'boolean' },
            is_blocked: { type: 'boolean' },
            must_change_password: { type: 'boolean' },
            last_login: { type: 'string', format: 'date-time', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        CreateEmployeeRequest: {
          type: 'object',
          required: ['full_name', 'email'],
          properties: {
            full_name: { type: 'string', minLength: 2 },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
          },
        },
        Permissions: {
          type: 'object',
          properties: {
            can_view_customers: { type: 'boolean' },
            can_create_customer: { type: 'boolean' },
            can_edit_customer: { type: 'boolean' },
            can_delete_customer: { type: 'boolean' },
            can_create_policy: { type: 'boolean' },
            can_edit_policy: { type: 'boolean' },
            can_delete_policy: { type: 'boolean' },
            can_manage_claims: { type: 'boolean' },
            can_create_employee: { type: 'boolean' },
            can_edit_employee: { type: 'boolean' },
            can_delete_employee: { type: 'boolean' },
            can_view_reports: { type: 'boolean' },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  apis: ['./src/modules/*/*.routes.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
