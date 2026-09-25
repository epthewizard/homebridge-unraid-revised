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
individual outlets. Each outlet uses the container or VM name from Unraid.
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

For local development:

```sh
npm install
npm run build
npm link
```

Then add the platform through the Homebridge UI and select Settings.

## Configure

Enter your Unraid server URL, such as `http://192.168.5.153`. The plugin adds
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

The plugin replaces the earlier individual Docker and VM accessories after a
successful refresh. This release also creates fresh Docker and VMs groups so
HomeKit imports each outlet's Unraid name. Automations tied to the old
accessories may need to be recreated.

## API key permissions

Create an Unraid API key with the smallest set of permissions that matches the
features you enable. Read permissions cover monitoring. Array, Docker, and VM
start/stop each need the matching update permission.

The GraphQL endpoint uses the `x-api-key` request header. See the [Unraid API
guide](https://docs.unraid.net/API/how-to-use-the-api/) for API-key management
and sandbox setup.

## Publishing

This repository is configured as the public npm package
`homebridge-unraid-revised`. Create the matching GitHub repository before
publishing, then run:

```sh
npm login
npm publish
```

Publishing is a manual release step. The package includes the native Homebridge
Settings schema, compiled plugin, README, and captured GraphQL schema.

## Development notes

`schema/unraid.schema.json` is the complete GraphQL introspection snapshot used
to select the operations in `src/modern/unraid-client.ts`. Refresh it after an
Unraid API upgrade before adding fields or mutations.
