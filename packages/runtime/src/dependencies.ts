import { satisfies, valid, validRange } from 'semver'

export interface PluginDependency { name: string, version: string, optional?: boolean }
export interface PluginManifest {
  name: string
  version?: string
  apiVersion?: string
  requires?: readonly (string | PluginDependency)[]
}
export const RUNTIME_API_VERSION = '1.0.0'
export function dependencyName(dependency: string | PluginDependency): string {
  return typeof dependency === 'string'
    ? dependency
    : dependency.name
}

/** Preflight the whole graph before running any plugin code. Legacy versions are never fabricated. */
export function resolvePlugins<T extends PluginManifest>(plugins: readonly T[], installed: readonly T[] = []): T[] {
  const available = new Map(installed.map(plugin => [plugin.name, plugin]))
  const incoming = new Map<string, T>()
  const requested = new Set<string>()
  for (const plugin of plugins) {
    if (!plugin.name?.trim())
      throw new Error('Plugin name is required')
    if (requested.has(plugin.name))
      throw new Error(`Duplicate plugin name: ${plugin.name}`)
    requested.add(plugin.name)
    if (available.has(plugin.name))
      continue // compatible legacy use(name) no-op
    if (plugin.version !== undefined && !valid(plugin.version))
      throw new Error(`Invalid plugin version: ${plugin.name}`)
    if (plugin.apiVersion !== undefined && (!validRange(plugin.apiVersion) || !satisfies(RUNTIME_API_VERSION, plugin.apiVersion)))
      throw new Error(`Incompatible plugin API version: ${plugin.name}`)
    incoming.set(plugin.name, plugin)
    available.set(plugin.name, plugin)
  }
  const sorted: T[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (plugin: T) => {
    if (visited.has(plugin.name))
      return
    if (visiting.has(plugin.name))
      throw new Error(`Cyclic plugin dependency: ${plugin.name}`)
    visiting.add(plugin.name)
    for (const dependency of plugin.requires ?? []) {
      const name = dependencyName(dependency)
      if (!name?.trim())
        throw new Error('Plugin dependency name is required')
      if (typeof dependency !== 'string' && !validRange(dependency.version))
        throw new Error(`Invalid dependency range: ${name}`)
      const target = available.get(name)
      if (!target) {
        if (typeof dependency !== 'string' && dependency.optional)
          continue
        throw new Error(`Missing plugin dependency: ${name}`)
      }
      if (typeof dependency !== 'string' && (!target.version || !valid(target.version) || !satisfies(target.version, dependency.version)))
        throw new Error(`Incompatible plugin dependency: ${name} requires ${dependency.version}`)
      visit(target)
    }
    visiting.delete(plugin.name)
    visited.add(plugin.name)
    if (incoming.has(plugin.name))
      sorted.push(plugin)
  }
  for (const plugin of available.values()) visit(plugin)
  return sorted
}
