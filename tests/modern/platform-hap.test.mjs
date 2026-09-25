import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Accessory, Characteristic, Service, uuid } from 'hap-nodejs';

import { UnraidPlatform } from '../../dist/modern/platform.js';
import { PLATFORM_NAME, PLUGIN_NAME } from '../../dist/modern/settings.js';

class LocalAccessory extends Accessory {
  constructor(name, id) {
    super(name, id);
    this.context = {};
  }
}

function createPlatform() {
  const plugin = Object.create(UnraidPlatform.prototype);
  plugin.Service = Service;
  plugin.Characteristic = Characteristic;
  plugin.accessories = new Map();
  plugin.api = {
    platformAccessory: LocalAccessory,
    hap: { uuid },
    registerPlatformAccessories: () => {},
    updatePlatformAccessories: () => {},
  };
  plugin.client = {
    setContainerRunning: async () => {},
    setVmRunning: async () => {},
  };
  plugin.refresh = async () => {};
  return plugin;
}

async function namesInHapPayload(accessory) {
  accessory.aid = 2;
  let iid = 1;
  for (const service of accessory.services) {
    service.iid = iid++;
    for (const characteristic of service.characteristics) characteristic.iid = iid++;
  }

  const [payload] = await accessory.toHAP();
  return accessory.services
    .filter((service) => service.UUID === Service.Outlet.UUID)
    .map((service) => {
      const hapService = payload.services.find((candidate) => candidate.iid === service.iid);
      const value = (characteristic) => hapService.characteristics
        .find((candidate) => candidate.iid === service.getCharacteristic(characteristic).iid).value;
      return { id: service.subtype, name: value(Characteristic.Name), configuredName: value(Characteristic.ConfiguredName) };
    });
}

test('real HomeKit payload names every Docker and VM outlet from Unraid', async () => {
  const plugin = createPlatform();
  plugin.updateGroup('docker-group', 'Docker', [
    { id: 'container-1', name: 'homebridge', running: true },
    { id: 'container-2', name: 'wasp-api', running: false },
  ], true, new Set());
  plugin.updateGroup('vm-group', 'VMs', [
    { id: 'vm-1', name: 'Windows 11', running: true },
  ], true, new Set());

  const docker = plugin.accessories.get('docker-group:named-1');
  const vms = plugin.accessories.get('vm-group:named-1');
  assert.equal(docker.displayName, 'Docker');
  assert.equal(vms.displayName, 'VMs');
  assert.deepEqual(await namesInHapPayload(docker), [
    { id: 'container-1', name: 'homebridge', configuredName: 'homebridge' },
    { id: 'container-2', name: 'wasp-api', configuredName: 'wasp-api' },
  ]);
  assert.deepEqual(await namesInHapPayload(vms), [
    { id: 'vm-1', name: 'Windows 11', configuredName: 'Windows 11' },
  ]);
});

test('package, Homebridge registration, and native Settings use matching identifiers', () => {
  const metadata = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const schema = JSON.parse(readFileSync(new URL('../../config.schema.json', import.meta.url), 'utf8'));
  assert.equal(metadata.name, 'homebridge-unraid-revised');
  assert.equal(metadata.name, PLUGIN_NAME);
  assert.equal(metadata.homebridge.pluginAlias, PLATFORM_NAME);
  assert.equal(schema.pluginAlias, PLATFORM_NAME);
  assert.equal(schema.customUi, false);
});
