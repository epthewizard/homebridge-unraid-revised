import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import {
  type ArrayDisk,
  type Snapshot,
  type SnapshotOptions,
  UnraidClient,
} from './unraid-client.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

interface UnraidConfig extends PlatformConfig {
  name?: string;
  endpoint?: string;
  apiKey?: string;
  apiKeyEnvironmentVariable?: string;
  pollInterval?: number;
  enableArray?: boolean;
  arrayControls?: boolean;
  enableParity?: boolean;
  enableDisks?: boolean;
  diskWarningTemperature?: number;
  diskCriticalTemperature?: number;
  enableDocker?: boolean;
  dockerControls?: boolean;
  dockerInclude?: string;
  dockerExclude?: string;
  exposeStoppedContainers?: boolean;
  enableVms?: boolean;
  vmControls?: boolean;
  vmInclude?: string;
  vmExclude?: string;
  exposeStoppedVms?: boolean;
}

type AccessoryKind = 'array' | 'disk' | 'container' | 'vm' | 'docker-group' | 'vm-group';

interface UnraidContext {
  kind: AccessoryKind;
  id: string;
  running?: boolean;
  handlersBound?: boolean;
  states?: Record<string, boolean>;
}

export class UnraidPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  private readonly client: UnraidClient;
  private readonly accessories = new Map<string, PlatformAccessory>();
  private refreshInFlight?: Promise<void>;

  public constructor(private readonly log: Logging, private readonly config: UnraidConfig, private readonly api: API) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    const environmentVariable = config.apiKeyEnvironmentVariable ?? 'UNRAID_API_KEY';
    if (!/^UNRAID_[A-Z0-9_]+$/.test(environmentVariable)) {
      throw new Error('The API-key environment variable must start with UNRAID_.');
    }
    const apiKey = config.apiKey || process.env[environmentVariable];
    if (!apiKey) throw new Error('UnraidGraphQL requires an API key or an API-key environment variable.');
    this.client = new UnraidClient(this.normalizedEndpoint(config.endpoint ?? 'http://tower.local/graphql'), apiKey);
    api.on('didFinishLaunching', () => {
      void this.refresh();
      setInterval(() => void this.refresh(), Math.max(15, config.pollInterval ?? 30) * 1000).unref();
    });
  }

  public configureAccessory(accessory: PlatformAccessory): void {
    const context = accessory.context as Partial<UnraidContext>;
    if (context.kind && context.id) this.accessories.set(this.key(context.kind, context.id), accessory);
  }

  private async refresh(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.refreshSnapshot().finally(() => { this.refreshInFlight = undefined; });
    return this.refreshInFlight;
  }

  private async refreshSnapshot(): Promise<void> {
    try {
      const snapshot = await this.client.snapshot(this.snapshotOptions());
      const live = new Set<string>();
      if ((this.config.enableArray !== false || this.config.enableParity !== false) && snapshot.array) {
        this.updateArray(snapshot, live);
      }
      if (this.config.enableDisks !== false) snapshot.array?.disks?.forEach((disk) => this.updateDisk(disk, live));
      if (this.config.enableDocker !== false) {
        const containers = snapshot.docker?.containers
          .filter((container) => this.shouldExpose(container.names[0] ?? container.id, container.state === 'RUNNING', this.config.dockerInclude, this.config.dockerExclude, this.config.exposeStoppedContainers !== false)) ?? [];
        this.updateGroup('docker-group', 'Docker', containers.map((container) => ({
          id: container.id,
          name: container.names[0]?.replace(/^\/+/, '') || container.id,
          running: container.state === 'RUNNING',
        })), this.config.dockerControls === true, live);
      }
      if (this.config.enableVms !== false) {
        const vms = snapshot.vms?.domains
          .filter((vm) => this.shouldExpose(vm.name ?? vm.id, vm.state === 'RUNNING', this.config.vmInclude, this.config.vmExclude, this.config.exposeStoppedVms !== false)) ?? [];
        this.updateGroup('vm-group', 'VMs', vms.map((vm) => ({
          id: vm.id,
          name: vm.name || vm.id,
          running: vm.state === 'RUNNING',
        })), this.config.vmControls === true, live);
      }
      this.removeMissing(live);
    } catch (error) {
      this.log.error(`Unable to refresh Unraid: ${(error as Error).message}`);
    }
  }

  private updateArray(snapshot: Snapshot, live: Set<string>): void {
    const accessory = this.upsert('array', 'system', `${this.config.name ?? 'Unraid'} Array`, live);
    const context = accessory.context as UnraidContext;
    context.running = snapshot.array?.state === 'STARTED';
    if (this.config.enableArray !== false) {
      if (this.config.arrayControls === true) {
        this.removeService(accessory, this.Service.OccupancySensor, 'array-state');
        const service = accessory.getServiceById(this.Service.Switch, 'array-state')
          ?? accessory.addService(this.Service.Switch, 'Array', 'array-state');
        if (!context.handlersBound) {
          service.getCharacteristic(this.Characteristic.On)
            .onGet(() => Boolean((accessory.context as UnraidContext).running))
            .onSet(async (value) => {
              await this.client.setArrayRunning(value === true || value === 1);
              await this.refresh();
            });
          context.handlersBound = true;
        }
        service.updateCharacteristic(this.Characteristic.On, Boolean(context.running));
      } else {
        this.removeService(accessory, this.Service.Switch, 'array-state');
        context.handlersBound = false;
        const service = accessory.getServiceById(this.Service.OccupancySensor, 'array-state')
          ?? accessory.addService(this.Service.OccupancySensor, 'Array Running', 'array-state');
        service.updateCharacteristic(this.Characteristic.OccupancyDetected, context.running ? 1 : 0);
        service.updateCharacteristic(this.Characteristic.StatusActive, Boolean(context.running));
      }
    } else {
      this.removeService(accessory, this.Service.OccupancySensor, 'array-state');
      this.removeService(accessory, this.Service.Switch, 'array-state');
      context.handlersBound = false;
    }

    if (this.config.enableParity !== false) {
      const service = accessory.getServiceById(this.Service.OccupancySensor, 'parity-check')
        ?? accessory.addService(this.Service.OccupancySensor, 'Parity Check Running', 'parity-check');
      const parity = snapshot.array?.parityCheckStatus;
      service.updateCharacteristic(this.Characteristic.OccupancyDetected, parity?.running ? 1 : 0);
      service.updateCharacteristic(this.Characteristic.StatusActive, true);
      service.updateCharacteristic(this.Characteristic.StatusFault, this.nonZero(parity?.errors) ? 1 : 0);
    } else {
      this.removeService(accessory, this.Service.OccupancySensor, 'parity-check');
    }
  }

  private updateDisk(disk: ArrayDisk, live: Set<string>): void {
    const name = disk.name || disk.id;
    const accessory = this.upsert('disk', disk.id, `${this.config.name ?? 'Unraid'} Disk ${name}`, live);
    const service = accessory.getServiceById(this.Service.TemperatureSensor, 'temperature')
      ?? accessory.addService(this.Service.TemperatureSensor, `${name} Temperature`, 'temperature');
    if (typeof disk.temp === 'number') service.updateCharacteristic(this.Characteristic.CurrentTemperature, disk.temp);
    const critical = this.config.diskCriticalTemperature ?? 60;
    const warning = this.config.diskWarningTemperature ?? 50;
    const temperatureFault = typeof disk.temp === 'number' && disk.temp >= Math.min(warning, critical);
    service.updateCharacteristic(this.Characteristic.StatusActive, disk.status !== 'DISK_NP');
    service.updateCharacteristic(this.Characteristic.StatusFault, this.nonZero(disk.numErrors) || this.nonZero(disk.warning) || this.nonZero(disk.critical) || temperatureFault ? 1 : 0);
  }

private syncServiceName(service: Service, name: string): boolean {
    const previousName = service.displayName;
    let changed = false;
    if (previousName !== name) {
      service.displayName = name;
      changed = true;
    }
    if (service.getCharacteristic(this.Characteristic.Name).value !== name) {
      service.updateCharacteristic(this.Characteristic.Name, name);
      changed = true;
    }
    const configuredName = this.Characteristic.ConfiguredName;
    if (!service.optionalCharacteristics.some((characteristic) => characteristic.UUID === configuredName.UUID)) {
      service.addOptionalCharacteristic(configuredName);
    }
    if (!service.testCharacteristic(configuredName)) {
      service.setCharacteristic(configuredName, name);
      changed = true;
    } else if (previousName !== name && service.getCharacteristic(configuredName).value === previousName) {
      service.updateCharacteristic(configuredName, name);
      changed = true;
    }
    return changed;
  }

  private updateGroup(
    kind: 'docker-group' | 'vm-group',
    label: string,
    entries: { id: string; name: string; running: boolean }[],
    controls: boolean,
    live: Set<string>,
  ): void {
    const ordered = [...entries].sort((left, right) => left.id.localeCompare(right.id));
    const groupSize = 99;
    for (let offset = 0; offset < ordered.length; offset += groupSize) {
      const number = Math.floor(offset / groupSize) + 1;
      const accessory = this.upsert(kind, `named-${number}`, number === 1 ? label : `${label} ${number}`, live);
      const context = accessory.context as UnraidContext;
      const group = ordered.slice(offset, offset + groupSize);
      context.states = Object.fromEntries(group.map((entry) => [entry.id, entry.running]));
      const wanted = new Set(group.map((entry) => entry.id));
      let changed = false;

      for (const service of [...accessory.services]) {
        if (service.UUID === this.Service.Outlet.UUID || service.UUID === this.Service.OccupancySensor.UUID) {
          if (!service.subtype || !wanted.has(service.subtype) ||
              (controls && service.UUID !== this.Service.Outlet.UUID) ||
              (!controls && service.UUID !== this.Service.OccupancySensor.UUID)) {
            accessory.removeService(service);
            changed = true;
          }
        }
      }

      for (const entry of group) {
        if (controls) {
          let service = accessory.getServiceById(this.Service.Outlet, entry.id);
          if (!service) {
            service = accessory.addService(this.Service.Outlet, entry.name, entry.id);
            changed = true;
          }
          if (this.syncServiceName(service, entry.name)) changed = true;
          service.getCharacteristic(this.Characteristic.On)
            .onGet(() => Boolean((accessory.context as UnraidContext).states?.[entry.id]))
            .onSet(async (value) => {
              if (kind === 'docker-group') await this.client.setContainerRunning(entry.id, value === true || value === 1);
              else await this.client.setVmRunning(entry.id, value === true || value === 1);
              await this.refresh();
            });
          service.updateCharacteristic(this.Characteristic.On, entry.running);
          service.updateCharacteristic(this.Characteristic.OutletInUse, entry.running);
        } else {
          let service = accessory.getServiceById(this.Service.OccupancySensor, entry.id);
          if (!service) {
            service = accessory.addService(this.Service.OccupancySensor, entry.name, entry.id);
            changed = true;
          }
          if (this.syncServiceName(service, entry.name)) changed = true;
          service.updateCharacteristic(this.Characteristic.OccupancyDetected, entry.running ? 1 : 0);
          service.updateCharacteristic(this.Characteristic.StatusActive, true);
        }
      }
      if (changed) this.api.updatePlatformAccessories([accessory]);
    }
  }

  private upsert(kind: AccessoryKind, id: string, name: string, live: Set<string>): PlatformAccessory {
    const key = this.key(kind, id);
    const grouped = kind === 'docker-group' || kind === 'vm-group';
    const serialNumber = grouped ? `${kind}:${id}` : id;
    live.add(key);
    let accessory = this.accessories.get(key);
    if (!accessory) {
      accessory = new this.api.platformAccessory(name, this.api.hap.uuid.generate(`${PLUGIN_NAME}:${key}`));
      accessory.context = { kind, id } satisfies UnraidContext;
      (accessory.getService(this.Service.AccessoryInformation)
        ?? accessory.addService(this.Service.AccessoryInformation))
        .setCharacteristic(this.Characteristic.Manufacturer, 'Unraid')
        .setCharacteristic(this.Characteristic.Model, kind)
        .setCharacteristic(this.Characteristic.SerialNumber, serialNumber);
      this.accessories.set(key, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    } else {
      let changed = false;
      const information = accessory.getService(this.Service.AccessoryInformation);
      if (accessory.displayName !== name) {
        accessory.displayName = name;
        information?.updateCharacteristic(this.Characteristic.Name, name);
        changed = true;
      }
      if (grouped && information?.getCharacteristic(this.Characteristic.SerialNumber).value !== serialNumber) {
        information?.updateCharacteristic(this.Characteristic.SerialNumber, serialNumber);
        changed = true;
      }
      if (changed) this.api.updatePlatformAccessories([accessory]);
    }
    return accessory;
  }

  private removeMissing(live: Set<string>): void {
    const removed = [...this.accessories.entries()].filter(([key]) => !live.has(key));
    if (removed.length) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, removed.map(([, accessory]) => accessory));
      removed.forEach(([key]) => this.accessories.delete(key));
    }
  }

  private snapshotOptions(): SnapshotOptions {
    return {
      array: this.config.enableArray !== false,
      parity: this.config.enableParity !== false,
      disks: this.config.enableDisks !== false,
      docker: this.config.enableDocker !== false,
      vms: this.config.enableVms !== false,
    };
  }

  private shouldExpose(name: string, running: boolean, include: string | undefined, exclude: string | undefined, exposeStopped: boolean): boolean {
    const normalized = name.replace(/^\/+/, '').toLocaleLowerCase();
    const included = this.names(include);
    const excluded = this.names(exclude);
    return (exposeStopped || running)
      && (!included.length || included.includes(normalized))
      && !excluded.includes(normalized);
  }

  private names(value: string | undefined): string[] {
    return value?.split(',').map((name) => name.trim().replace(/^\/+/, '').toLocaleLowerCase()).filter(Boolean) ?? [];
  }

  private nonZero(value: number | string | null | undefined): boolean {
    return Number(value ?? 0) > 0;
  }

  private removeService(
    accessory: PlatformAccessory,
    serviceType: typeof Service.OccupancySensor | typeof Service.Switch,
    subtype: string,
  ): void {
    const service = accessory.getServiceById(serviceType, subtype);
    if (service) accessory.removeService(service);
  }

  private key(kind: AccessoryKind, id: string): string { return `${kind}:${id}`; }

  private normalizedEndpoint(value: string): string {
    const endpoint = new URL(value);
    if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('The Unraid endpoint must use HTTP or HTTPS.');
    return endpoint.pathname === '/' ? new URL('/graphql', endpoint).toString() : endpoint.toString();
  }
}
