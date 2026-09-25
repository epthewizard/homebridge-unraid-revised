# Homebridge Unraid

Homebridge platform plugin for Unraid's GraphQL API. It exposes selected Unraid
resources in HomeKit and keeps write access off until you enable it.

## HomeKit accessories

| Resource | Default accessory | Optional control |
| --- | --- | --- |
| Array | Running-state sensor | Start/stop switch |
| Parity check | Running-state and fault sensor | None |
| Disks | Temperature sensors with fault state | None |
| Docker containers | One Docker accessory with a status sensor for each container | One outlet per container for start/stop |
| Virtual machines | One VMs accessory with a status sensor for each VM | One outlet per VM for start/stop |

In the Home app, open Docker or VMs to see the individual outlets. You can rename
each outlet there. Home may offer a "Show as Separate Tiles" option; leave it off
to keep the group together. The plugin removes the old individual Docker and VM
accessories after a successful refresh. Version 0.1.8 also replaces the grouped
accessories created by 0.1.6 and 0.1.7 so HomeKit imports the individual outlet
names. Automations using those old accessories may need to be recreated.

The plugin only queries resources that you enable. A read-only key for disks does
not need Docker or VM permissions when those resources are turned off.

## Install

The package name for Homebridge's plugin search is:

```
@epthewizard/homebridge-unraid
```

After it is published to npm, install it from the Homebridge Plugins page by
searching for that name. Select Settings to configure the plugin.

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

## API key permissions

Create an Unraid API key with the smallest set of permissions that matches the
features you enable. Read permissions cover monitoring. Array, Docker, and VM
start/stop each need the matching update permission.

The GraphQL endpoint uses the `x-api-key` request header. See the [Unraid API
guide](https://docs.unraid.net/API/how-to-use-the-api/) for API-key management
and sandbox setup.

## Publishing

This repository is configured as the public npm package
`@epthewizard/homebridge-unraid`. Before publishing, create or update the
matching GitHub repository, then run:

```sh
npm login
npm publish
```

Publishing is intentionally a manual release step. The package includes the
Homebridge UI, compiled plugin, README, and the captured GraphQL schema.

## Development notes

`schema/unraid.schema.json` is the complete GraphQL introspection snapshot used
to select the operations in `src/modern/unraid-client.ts`. Refresh it after an
Unraid API upgrade before adding fields or mutations.
