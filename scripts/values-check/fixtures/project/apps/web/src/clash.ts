import type { Role as RoleName } from '@rampflow/shared/values';

const Role = 'local';

export function describe(role: RoleName = 'admin'): string { // → Role.admin
  return Role + role;
}
