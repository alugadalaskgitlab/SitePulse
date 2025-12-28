import { z } from 'zod';
import { 
  dprs, 
  createDprRequestSchema, 
  insertDprSchema
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  dprs: {
    list: {
      method: 'GET' as const,
      path: '/api/dprs',
      input: z.object({
        site: z.string().optional(),
        engineer: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof dprs.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/dprs/:id',
      responses: {
        200: z.custom<typeof dprs.$inferSelect & { progress: any[], equipment: any[], labour: any[], materials: any[] }>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/dprs',
      input: createDprRequestSchema,
      responses: {
        201: z.custom<typeof dprs.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    export: {
      method: 'GET' as const,
      path: '/api/dprs/export/excel',
      responses: {
        200: z.any(), // File download
      },
    }
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
