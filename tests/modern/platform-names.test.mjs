import assert from 'node:assert/strict';
import test from 'node:test';
import { UnraidPlatform } from '../../dist/modern/platform.js';

const Service = Object.fromEntries(['AccessoryInformation', 'Outlet', 'OccupancySensor', 'Switch'].map((name) => [name, { UUID: name }]));

class FakeCharacteristic {
  onGet(handler) { this.getHandler = handler; this.getBindings = (this.getBindings ?? 0) + 1; return this; }
  onSet(handler) { this.setHandler = handler; this.setBindings = (this.setBindings ?? 0) + 1; return this; }
}

class FakeService {
  constructor(type, displayName, subtype) {
    this.UUID = type.UUID;
    this.displayName = displayName;
    this.subtype = subtype;
    this.values = new Map([['Name', displayName]]);
    this.characteristics = new Map();
    this.optionalCharacteristics = [];
  }
  getCharacteristic(name) {
    if (!this.characteristics.has(name)) {
      const characteristic = new FakeCharacteristic();
      characteristic.value = this.values.get(name);
      this.characteristics.set(name, characteristic);
    }
    return this.characteristics.get(name);
  }
  testCharacteristic(name) { return this.values.has(name); }
  addOptionalCharacteristic(name) { this.optionalCharacteristics.push({ UUID: name.UUID }); }
  setCharacteristic(name, value) { return this.updateCharacteristic(name, value); }
  updateCharacteristic(name, value) {
    this.values.set(name, value);
    if (this.characteristics.has(name)) this.characteristics.get(name).value = value;
    return this;
  }
}

class FakeAccessory {
  constructor(displayName, UUID) {
    this.displayName = displayName;
    this.UUID = UUID;
    this.context = {};
    this.services = [new FakeService(Service.AccessoryInformation, displayName)];
  }
  getService(type) { return this.services.find((service) => service.UUID === type.UUID); }
  getServiceById(type, subtype) { return this.services.find((service) => service.UUID === type.UUID && service.subtype === subtype); }
  addService(type, displayName, subtype) {
    const service = new FakeService(type, displayName, subtype);
    this.services.push(service);
    return service;
  }
  removeService(service) { this.services = this.services.filter((candidate) => candidate !== service); }
}

function platform(config = {}) {
  const plugin = Object.create(UnraidPlatform.prototype);
  const registered = [];
  const registeredSnapshots = [];
  const updated = [];
  const unregistered = [];
  const commands = [];
  plugin.config = { name: 'Unraid', enableArray: false, enableParity: false, enableDisks: false, ...config };
  plugin.accessories = new Map();
  plugin.boundServices = new WeakSet();
  plugin.Service = Service;
  plugin.Characteristic = Object.fromEntries(['Name', 'ConfiguredName', 'Manufacturer', 'Model', 'SerialNumber', 'On', 'OutletInUse', 'OccupancyDetected', 'StatusActive'].map((name) => [name, name]));
  plugin.api = {
    platformAccessory: FakeAccessory,
    hap: { uuid: { generate: (value) => value } },
    registerPlatformAccessories: (_, __, accessories) => {
      registered.push(...accessories);
      for (const accessory of accessories) {
        registeredSnapshots.push(accessory.services
          .filter((service) => service.UUID === Service.Outlet.UUID)
          .map((service) => ({ name: service.values.get('Name'), configuredName: service.values.get('ConfiguredName') })));
      }
    },
    updatePlatformAccessories: (accessories) => updated.push(...accessories),
    unregisterPlatformAccessories: (_, __, accessories) => unregistered.push(...accessories),
  };
  plugin.log = { error: (message) => { throw new Error(message); } };
  plugin.client = {
    setArrayRunning: async (...args) => commands.push(['array', ...args]),
    setContainerRunning: async (...args) => commands.push(['docker', ...args]),
    setVmRunning: async (...args) => commands.push(['vm', ...args]),
  };
  return { plugin, registered, registeredSnapshots, updated, unregistered, commands };
}

const containers = [
  { id: 'docker-a', names: ['/homebridge'], state: 'RUNNING' },
  { id: 'docker-b', names: ['/wasp-api'], state: 'STOPPED' },
];

test('Docker outlets share one accessory and control their own stable IDs', async () => {
  const { plugin, registered, registeredSnapshots, commands } = platform({ dockerControls: true, enableVms: false });
  plugin.client.snapshot = async () => ({ docker: { containers } });
  await plugin.refreshSnapshot();
  assert.equal(registered.length, 1);
  assert.deepEqual(registeredSnapshots, [[
    { name: 'homebridge', configuredName: 'homebridge' },
    { name: 'wasp-api', configuredName: 'wasp-api' },
  ]]);
  const accessory = registered[0];
  assert.equal(accessory.displayName, 'Docker');
  const first = accessory.getServiceById(Service.Outlet, 'docker-a');
  const second = accessory.getServiceById(Service.Outlet, 'docker-b');
  assert.equal(first.displayName, 'homebridge');
  assert.equal(first.values.get('Name'), 'homebridge');
  assert.equal(first.values.get('ConfiguredName'), 'homebridge');
  assert.equal(second.displayName, 'wasp-api');
  assert.equal(second.values.get('ConfiguredName'), 'wasp-api');
  assert.equal(first.values.get('On'), true);
  assert.equal(second.values.get('On'), false);
  assert.equal(first.getCharacteristic('On').getHandler(), true);
  assert.equal(second.getCharacteristic('On').getHandler(), false);
  plugin.refresh = async () => {};
  await second.getCharacteristic('On').setHandler(true);
  assert.deepEqual(commands, [['docker', 'docker-b', true]]);
});

test('polling binds an outlet handler only once', async () => {
  const { plugin, registered, commands } = platform({ dockerControls: true, enableVms: false });
  plugin.client.snapshot = async () => ({ docker: { containers } });
  await plugin.refreshSnapshot();
  await plugin.refreshSnapshot();

  const on = registered[0].getServiceById(Service.Outlet, 'docker-a').getCharacteristic('On');
  assert.equal(on.getBindings, 1);
  assert.equal(on.setBindings, 1);
  plugin.refresh = async () => {};
  await on.setHandler(false);
  assert.deepEqual(commands, [['docker', 'docker-a', false]]);
});

test('a cached array switch gets a fresh handler after restart', async () => {
  const { plugin, commands } = platform({ enableArray: true, arrayControls: true, enableDocker: false, enableVms: false });
  const cached = new FakeAccessory('Unraid Array', 'array-uuid');
  cached.context = { kind: 'array', id: 'system', handlersBound: true };
  cached.addService(Service.Switch, 'Array', 'array-state');
  plugin.configureAccessory(cached);
  plugin.client.snapshot = async () => ({ array: { state: 'STARTED' } });
  await plugin.refreshSnapshot();
  await plugin.refreshSnapshot();

  const on = cached.getServiceById(Service.Switch, 'array-state').getCharacteristic('On');
  assert.equal(on.getBindings, 1);
  assert.equal(on.setBindings, 1);
  assert.equal(on.getHandler(), true);
  plugin.refresh = async () => {};
  await on.setHandler(false);
  assert.deepEqual(commands, [['array', false]]);
});

test('VMs form a separate accessory with individually controlled outlets', async () => {
  const { plugin, registered, commands } = platform({ vmControls: true, enableDocker: false });
  plugin.client.snapshot = async () => ({ vms: { domains: [{ id: 'vm-1', name: 'Windows 11', state: 'RUNNING' }] } });
  await plugin.refreshSnapshot();
  assert.equal(registered.length, 1);
  assert.equal(registered[0].displayName, 'VMs');
  const service = registered[0].getServiceById(Service.Outlet, 'vm-1');
  assert.equal(service.displayName, 'Windows 11');
  assert.equal(service.values.get('ConfiguredName'), 'Windows 11');
  plugin.refresh = async () => {};
  await service.getCharacteristic('On').setHandler(false);
  assert.deepEqual(commands, [['vm', 'vm-1', false]]);
});

test('read-only Docker status stays read-only within one accessory', async () => {
  const { plugin, registered } = platform({ enableVms: false });
  plugin.client.snapshot = async () => ({ docker: { containers } });
  await plugin.refreshSnapshot();
  assert.equal(registered.length, 1);
  const sensor = registered[0].getServiceById(Service.OccupancySensor, 'docker-a');
  assert.equal(sensor.displayName, 'homebridge');
  assert.equal(sensor.values.get('OccupancyDetected'), 1);
  assert.equal(sensor.getCharacteristic('On').setHandler, undefined);
});

test('a successful refresh removes old individual tiles and stale grouped services', async () => {
  const { plugin, registered, updated, unregistered } = platform({ dockerControls: true, enableVms: false });
  const old = new FakeAccessory('Unraid Docker /homebridge', 'old-uuid');
  old.context = { kind: 'container', id: 'docker-a' };
  plugin.configureAccessory(old);
  plugin.client.snapshot = async () => ({ docker: { containers } });
  await plugin.refreshSnapshot();
  assert.deepEqual(unregistered, [old]);
  const group = registered[0];
  plugin.client.snapshot = async () => ({ docker: { containers: [containers[0]] } });
  await plugin.refreshSnapshot();
  assert.equal(group.getServiceById(Service.Outlet, 'docker-b'), undefined);
  assert.ok(updated.includes(group));
  assert.equal(registered.length, 1);
});

test('cached grouped services update names without changing accessory identity', async () => {
  const { plugin, updated } = platform({ dockerControls: true, enableVms: false });
  const cached = new FakeAccessory('Docker', 'existing-uuid');
  cached.context = { kind: 'docker-group', id: 'ready-1' };
  cached.addService(Service.Outlet, '/homebridge', 'docker-a');
  plugin.configureAccessory(cached);
  plugin.client.snapshot = async () => ({ docker: { containers: [containers[0]] } });
  await plugin.refreshSnapshot();
  assert.equal(cached.UUID, 'existing-uuid');
  assert.equal(cached.getServiceById(Service.Outlet, 'docker-a').displayName, 'homebridge');
  assert.equal(cached.getServiceById(Service.Outlet, 'docker-a').values.get('Name'), 'homebridge');
  assert.equal(cached.getServiceById(Service.Outlet, 'docker-a').values.get('ConfiguredName'), 'homebridge');
  assert.ok(updated.includes(cached));
});

test('old grouped accessories are replaced so HomeKit imports outlet names again', async () => {
  const { plugin, registered, unregistered } = platform({ dockerControls: true, enableVms: false });
  const old = new FakeAccessory('Docker', 'old-group-uuid');
  old.context = { kind: 'docker-group', id: '1' };
  old.addService(Service.Outlet, 'homebridge', 'docker-a');
  plugin.configureAccessory(old);
  plugin.client.snapshot = async () => ({ docker: { containers: [containers[0]] } });
  await plugin.refreshSnapshot();

  assert.deepEqual(unregistered, [old]);
  assert.equal(registered.length, 1);
  assert.notEqual(registered[0].UUID, old.UUID);
  assert.equal(registered[0].getServiceById(Service.Outlet, 'docker-a').values.get('ConfiguredName'), 'homebridge');
});

test('a HomeKit custom outlet name survives later Unraid name updates', async () => {
  const { plugin, registered } = platform({ dockerControls: true, enableVms: false });
  plugin.client.snapshot = async () => ({ docker: { containers: [containers[0]] } });
  await plugin.refreshSnapshot();
  const outlet = registered[0].getServiceById(Service.Outlet, 'docker-a');
  outlet.updateCharacteristic('ConfiguredName', 'My Custom Name');

  plugin.client.snapshot = async () => ({ docker: { containers: [{ ...containers[0], names: ['/renamed-in-unraid'] }] } });
  await plugin.refreshSnapshot();
  assert.equal(outlet.values.get('Name'), 'renamed-in-unraid');
  assert.equal(outlet.values.get('ConfiguredName'), 'My Custom Name');
});

test('group serial numbers are valid and cached short serials are repaired', () => {
  const { plugin, registered, updated } = platform({ dockerControls: true });
  const entries = [{ id: 'docker-a', name: 'homebridge', running: true }];
  plugin.updateGroup('docker-group', 'Docker', entries, true, new Set());
  const information = registered[0].getService(Service.AccessoryInformation);
  assert.equal(information.values.get('SerialNumber'), 'docker-group:ready-1');

  const cached = new FakeAccessory('VMs', 'existing-vm-uuid');
  cached.context = { kind: 'vm-group', id: 'ready-1' };
  cached.getService(Service.AccessoryInformation).updateCharacteristic('SerialNumber', '1');
  plugin.configureAccessory(cached);
  plugin.updateGroup('vm-group', 'VMs', [{ id: 'vm-a', name: 'Windows', running: true }], true, new Set());
  assert.equal(cached.UUID, 'existing-vm-uuid');
  assert.equal(cached.getService(Service.AccessoryInformation).values.get('SerialNumber'), 'vm-group:ready-1');
  assert.ok(updated.includes(cached));
});

test('more than 99 containers split into safe accessory groups', () => {
  const { plugin, registered } = platform({ dockerControls: true });
  const entries = Array.from({ length: 100 }, (_, index) => ({ id: String(index).padStart(3, '0'), name: `container-${index}`, running: true }));
  plugin.updateGroup('docker-group', 'Docker', entries, true, new Set());
  assert.equal(registered.length, 2);
  assert.deepEqual(registered.map((accessory) => accessory.displayName), ['Docker', 'Docker 2']);
  assert.deepEqual(registered.map((accessory) => accessory.services.filter((service) => service.UUID === Service.Outlet.UUID).length), [99, 1]);
});

test('Docker filters accept names with or without the API prefix', () => {
  const { plugin } = platform();
  assert.equal(plugin.shouldExpose('/homebridge', true, 'homebridge', undefined, true), true);
  assert.equal(plugin.shouldExpose('/homebridge', true, '/homebridge', undefined, true), true);
  assert.equal(plugin.shouldExpose('/homebridge', true, undefined, 'homebridge', true), false);
  assert.equal(plugin.shouldExpose('/homebridge', true, undefined, '/homebridge', true), false);
});

test('disabling every feature removes cached accessories without querying Unraid', async () => {
  const { plugin, unregistered } = platform({ enableDocker: false, enableVms: false });
  const cached = new FakeAccessory('Docker', 'old-group-uuid');
  cached.context = { kind: 'docker-group', id: 'ready-1' };
  plugin.configureAccessory(cached);
  plugin.client.snapshot = async () => { throw new Error('snapshot should not be queried'); };

  await plugin.refreshSnapshot();
  assert.deepEqual(unregistered, [cached]);
  assert.equal(plugin.accessories.size, 0);
});
