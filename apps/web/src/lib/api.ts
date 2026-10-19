import type { AppType } from '@rampflow/api';
import { hc } from 'hono/client';

export const api = hc<AppType>('/');
