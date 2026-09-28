# Homebridge development notes

These notes are for maintainers of `homebridge-unraid-revised`. The public
installation guide is in `README.md`.

## Settings UI

- Use Homebridge's native `config.schema.json` form with `customUi: false`.
  The custom iframe previously hid the connection fields and HomeKit toggles.
  Calling `homebridge.showSchemaForm()` did not make the form appear in that
  setup.
- Keep Name, server URL, masked API key, and the Array, Parity, Disks, Docker,
  and VM toggles visible when Settings opens. Controls, Filters, Thresholds,
  and Advanced options belong in collapsed sections.
- Test the form inside a real Homebridge Config UI X instance when changing
  the schema. A static HTML page does not show whether Homebridge rendered it.
  The native form was inspected in Config UI X 5.20 during the v0.1.9 work.
- Keep `config.schema.json` in the package. Preserve the captured GraphQL
  schema at `schema/unraid.schema.json` unless an intentional API update
  requires a new snapshot.

## Docker and VM accessories in Apple Home

- Docker containers share one Docker accessory; VMs share one VMs accessory.
  When controls are enabled, each workload has its own `Service.Outlet` within
  that group. Use a stable subtype based on its Unraid ID so polling does not
  create a new outlet for the same workload.
- Set both `Name` and optional `ConfiguredName` on each outlet from the
  workload name. Finish adding and naming every outlet **before** calling
  `registerPlatformAccessories`. The working UniFi SmartPower plugin was the
  reference for this registration order.
- Earlier builds showed correct names on Homebridge's Accessories page while
  Apple Home displayed "Outlet", "Outlet 1", and so on. Correct Homebridge
  labels alone do not prove that Apple Home received the outlet names.
- The v0.1.9 fix also changed the group identity from `named-1` to `ready-1`
  so Apple Home could import a freshly built group. Remove an old group only
  after a successful Unraid snapshot. The user reported on 2026-09-28 that
  the grouped outlets finally appeared to work in Apple Home. We have not
  isolated which part of the fix was decisive.
- Check names in Apple Home after changing outlet creation, naming, subtype,
  or registration order. Apple Home can retain a label that a user set there;
  it may need to be edited in the Home app. Changes that replace an accessory
  can also require users to recreate automations.

## Build and release checks

Run these from the repository root. The pack command places the archive in
`artifacts/`; keep `.tgz` files out of the root directory.

```sh
npm ci
npm run build
node -e 'JSON.parse(require("node:fs").readFileSync("config.schema.json", "utf8"))'
mkdir -p artifacts
npm pack --pack-destination artifacts
```

Inspect the archive before installing or publishing it. It must include
`config.schema.json` and compiled `dist/modern` files. Check the packaged
README too, because npm publishes the copy inside the archive.

```sh
package_version=$(node -p 'require("./package.json").version')
tar -tzf "artifacts/homebridge-unraid-revised-${package_version}.tgz"
tar -xOf "artifacts/homebridge-unraid-revised-${package_version}.tgz" package/README.md
```

Never put a real API key, server address, personal path, or other private value
in code, docs, schema defaults, logs, tests, memories, or release archives.
Use `http://tower.local` in examples. Do not query a live Unraid server with
someone's credentials during local validation.

The npm package name is `homebridge-unraid-revised`; the Homebridge platform
identifier remains `UnraidGraphQL` so existing configuration can be reused.
Publishing, pushing, and changing a live Homebridge or Unraid installation
require separate authorization from the user.

## References

- [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x)
- [Homebridge plugin UI utilities](https://github.com/homebridge/plugin-ui-utils)
- [UniFi SmartPower plugin](https://github.com/homebridge-plugins/homebridge-unifi-smartpower)
