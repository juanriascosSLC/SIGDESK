import {
  listAssignedChangeTasks,
  transitionChangeTask,
  type AssignedChangeTaskFilter,
} from '@/features/changes/api';
import {
  getAsset,
  getAssetOperationalHistory,
  listAssetSites,
  listSiteAssets,
} from '@/features/assets/api';

/**
 * Services is an application projection over existing bounded contexts. These
 * small aliases keep that integration explicit while preserving one owner for
 * every record: Change owns Tasks and Resources owns sites/assets.
 */
export async function listServiceWorkOrders(filter: AssignedChangeTaskFilter = 'scope') {
  const items = await listAssignedChangeTasks(filter);
  return items.filter(({ task }) => isServicesTask(task.organization?.departmentName || task.area));
}

export function transitionServiceWorkOrder(
  changeId: string,
  taskId: string,
  transitionKey: string,
  options: { reason?: string; evidence?: string[] } = {},
) {
  return transitionChangeTask(changeId, taskId, transitionKey, options);
}

export const listServiceSites = listAssetSites;
export const getServiceSite = getAsset;
export const listServiceSiteAssets = listSiteAssets;
export const getServiceSiteHistory = getAssetOperationalHistory;

/** The organization snapshot may be English or Spanish in existing data. */
export function isServicesTask(value: string | undefined): boolean {
  const normalized = (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return normalized === 'services' || normalized === 'service' || normalized === 'servicios';
}
