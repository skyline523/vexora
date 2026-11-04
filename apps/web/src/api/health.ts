import { type ApiResponse } from '@vexora/shared';

export interface HealthData {
  status: 'up';
  version: string;
}

export async function fetchHealth(): Promise<ApiResponse<HealthData>> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const response = await fetch(`${baseUrl}/api/health`);

  if (!response.ok) {
    throw new Error(`Health request failed: ${response.status}`);
  }

  return (await response.json()) as ApiResponse<HealthData>;
}
