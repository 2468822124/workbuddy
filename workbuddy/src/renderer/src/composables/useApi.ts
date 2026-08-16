import type { ApiType } from '../../../preload/index'

export function useApi(): ApiType {
  return (window as unknown as { api: ApiType }).api
}
