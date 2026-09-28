# Homebridge Unraid Revised

Monitor your Unraid server in Apple Home through Homebridge. You can also start
and stop the array, Docker containers, and virtual machines if you enable those
controls and give your Unraid API key the matching permissions.

## Install

1. Make sure Homebridge is running and your Unraid server has the Unraid API.
   The API is built into Unraid 7.2 and later. On earlier versions, install the
   Unraid Connect plugin. See the [Unraid API setup guide](https://docs.unraid.net/API/).
2. In Unraid, open **Settings → Management Access → API Keys** and create a key
   for Homebridge. Grant read access to the resources you plan to show. You can
   add control permissions later if you want start and stop switches.
3. In Homebridge, open **Plugins**, search for `homebridge-unraid-revised`, and
   install it. If you installed an older Unraid Homebridge plugin, remove its
   platform configuration and uninstall it so you do not get duplicate devices.
4. Open this plugin's **Settings**. Enter a name, your Unraid server URL or IP
   (for example, `http://tower.local`), and the API key. The key field is masked.
5. Choose what to show in HomeKit: **Array**, **Parity**, **Disks**,
   **Docker containers**, and **Virtual machines**. Save the settings and
   restart Homebridge if prompted.
6. Open Apple Home to find the accessories. If Homebridge reports a connection
   error, check the server URL, API key permissions, and Homebridge logs.

You can enter the full `/graphql` URL if you have one. Otherwise, the plugin
adds `/graphql` to the server URL.

## What appears in Apple Home

| Enabled feature | Accessory |
| --- | --- |
| Array | Running state; optional start/stop switch |
| Parity | Check state and fault status |
| Disks | Temperature and fault status |
| Docker containers | One Docker accessory with a status sensor for each container; optional named outlets to start and stop each container |
| Virtual machines | One VMs accessory with a status sensor for each VM; optional named outlets to start and stop each VM |

Docker and VM start/stop controls are off by default. To use them, grant the
API key the relevant update permission, then enable **Docker outlet controls**
or **VM outlet controls** under **Controls** in the plugin settings. Open the
Docker or VMs accessory in Apple Home to see each container or VM by name.
Keep Apple's **Show as Separate Tiles** option off if you want the outlets to
stay in one group.

The Settings form also has collapsed sections for **Filters** (choose which
containers and VMs appear), **Thresholds** (disk temperature warnings), and
**Advanced options** (polling interval and API-key environment variable).
Leave these at their defaults unless you need them. The plugin only queries
features you enable.

## Upgrading from an older version

The Homebridge platform identifier is still `UnraidGraphQL`, so your existing
settings can be reused. Earlier versions exposed Docker containers and VMs as
separate accessories. After a successful refresh, the plugin removes those
accessories and adds the grouped Docker and VMs accessories. You may need to
recreate Apple Home automations tied to the old accessories.

Apple Home may keep an outlet name that you changed manually. If its label does
not match the name in Unraid, edit that outlet's name in Apple Home.

## API key permissions

Use an API key with permissions for the features you enabled. Monitoring needs
read access. Array, Docker, and VM start/stop each need the matching update
permission. [Unraid's API guide](https://docs.unraid.net/API/how-to-use-the-api/)
explains how to create and manage keys. The plugin sends the key in the
`x-api-key` header.

If you manage Homebridge with environment variables, you can leave the masked
API-key field blank and set `UNRAID_API_KEY` for the Homebridge process. The
variable name can be changed under **Advanced options**.

## Build a local package

These commands are for testing or maintaining this repository. Regular users
can install the published package from Homebridge's **Plugins** screen.

```sh
npm ci
npm run build
mkdir -p artifacts
npm pack --pack-destination artifacts
```

The archive will be `artifacts/homebridge-unraid-revised-<version>.tgz`, where
`<version>` is the version in `package.json`. To install that archive manually,
run `npm install /full/path/to/artifacts/homebridge-unraid-revised-<version>.tgz`
in the Homebridge plugin installation directory, then restart Homebridge.

## Maintainer notes

`schema/unraid.schema.json` is the GraphQL introspection snapshot used to
select operations in `src/modern/unraid-client.ts`. Refresh it after an Unraid
API upgrade before adding fields or mutations.

Only publish a version after reviewing the package contents and updating the
version in `package.json`:

```sh
npm login --auth-type=web
npm publish ./artifacts/homebridge-unraid-revised-<version>.tgz --access public
```
