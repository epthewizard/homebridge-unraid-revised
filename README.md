# Homebridge Unraid Revised

Homebridge platform plugin for Unraid's GraphQL API. It exposes selected Unraid
resources in HomeKit and keeps write access off until you enable it.

## HomeKit accessories

| Resource | Default accessory | Optional control |
| --- | --- | --- |
| Array | Running-state sensor | Start/stop switch |
| Parity check | Running-state and fault sensor | None |
| Disks | Temperature sensors with fault state | None |
| Docker containers | One Docker accessory with a status sensor for each container | One named outlet per container for start/stop |
| Virtual machines | One VMs accessory with a status sensor for each VM | One named outlet per VM for start/stop |

With outlet controls enabled, open Docker or VMs in the Home app to see the
individual outlets. The plugin sends each container or VM name to HomeKit before
registering the power strip with Homebridge.
Home may offer "Show as Separate Tiles"; leave it off to keep the group together.

The plugin only queries resources that you enable. A read-only key for disks does
not need Docker or VM permissions when those resources are turned off.

## Install

The package name for Homebridge's plugin search is:

```
homebridge-unraid-revised
```

After publishing to npm, find `homebridge-unraid-revised` on the Homebridge
Plugins page. Remove the older Unraid plugin first so it cannot expose duplicate
accessories. The platform identifier remains `UnraidGraphQL`, so the existing
configuration fields can be reused.

To build an installable archive in `artifacts/`:

```sh
npm ci
npm run build
mkdir -p artifacts
npm pack --pack-destination artifacts
```

Install the generated `artifacts/homebridge-unraid-revised-<version>.tgz` through
Homebridge's Plugins page or with `npm install /full/path/to/the/archive.tgz`
in Homebridge's plugin directory. Restart Homebridge, then open Settings.

## Configure

Enter your Unraid server URL, such as `http://tower.local`. The plugin adds
`/graphql` when it is omitted. You can also enter the complete GraphQL endpoint.

Then either:

- Paste an API key into the masked API-key field.
- Leave that field blank and pass `UNRAID_API_KEY` to the Homebridge process.

The Settings form has a Show in HomeKit section for choosing:

- Array and parity monitoring, with an optional array start/stop switch
- Disk temperature monitoring and warning thresholds
- Docker and VM discovery
- Include/exclude lists for Docker containers and VMs
- Whether stopped workloads appear in HomeKit
- Docker and VM outlet controls for individual start/stop

Docker and VM controls stay off by default. Enable them only after granting the
API key the matching update permission.

The plugin replaces earlier individual Docker and VM accessories after a
successful refresh. Upgrading from 0.1.8 or earlier replaces the previous
Docker and VMs groups once so HomeKit can import their names after the outlets
are fully built.
Automations tied to the replaced groups may need to be recreated. Apple Home
can keep a name you previously set inside the Home app; edit that outlet's name
there if it does not pick up the Unraid name.

## API key permissions

Create an Unraid API key with the smallest set of permissions that matches the
features you enable. Read permissions cover monitoring. Array, Docker, and VM
start/stop each need the matching update permission.

The GraphQL endpoint uses the `x-api-key` request header. See the [Unraid API
guide](https://docs.unraid.net/API/how-to-use-the-api/) for API-key management
and sandbox setup.

## Publishing

This repository is configured as the public npm package
`homebridge-unraid-revised`. To publish the archive you just built:

```sh
npm login --auth-type=web
npm publish ./artifacts/homebridge-unraid-revised-<version>.tgz --access public
```

Replace `<version>` with the version in `package.json`. If npm returns E404 on
the PUT request while `npm whoami` works, the current npm token may lack
publish permission. Login through the browser again, then retry. New public
packages require two-factor authentication or a publish token that can bypass
it. The archive includes the native Homebridge Settings schema, compiled
plugin, README, and captured GraphQL schema.

## Development notes

`schema/unraid.schema.json` is the complete GraphQL introspection snapshot used
to select the operations in `src/modern/unraid-client.ts`. Refresh it after an
Unraid API upgrade before adding fields or mutations.
