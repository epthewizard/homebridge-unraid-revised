# Homebridge Unraid Revised

A Homebridge plugin that shows your Unraid server in Apple Home. It reads the
array, parity checks, disk temperatures, Docker containers, and virtual
machines through Unraid's GraphQL API. If you turn the controls on, it can also
start and stop the array, containers, and VMs from the Home app.

Unlike the original plugin it is based on, this one does not use SSH. It talks
to the API with a key you create in Unraid, so you can limit it to read-only
access.

## Requirements

- Homebridge 1.8.0 or later and Node.js 22 or later.
- Unraid with the API enabled. The API is built into Unraid 7.2 and later. On
  earlier versions, install the Unraid Connect plugin. See the
  [Unraid API documentation](https://docs.unraid.net/API/).
- An Unraid API key.

## Install

1. In Unraid, open Settings, then Management Access, then API Keys. Create a
   key for Homebridge and give it read access to the resources you want to
   show. You can add control permissions later.
2. In Homebridge, open Plugins, search for `homebridge-unraid-revised`, and
   install it. From a terminal, run `npm install -g homebridge-unraid-revised`
   instead.
3. If you use an older Unraid plugin for Homebridge, remove its platform entry
   and uninstall it first. Two plugins exposing the same server give you
   duplicate accessories.
4. Open this plugin's Settings. Enter a name, the server address (for example
   `http://tower.local` or `http://192.168.1.10`), and the API key. The key
   field is masked.
5. Turn on what you want to see: Array, Parity, Disks, Docker containers, and
   Virtual machines. Save, then restart Homebridge if it asks.
6. Open the Home app. The accessories appear under your Homebridge bridge.

You can enter the full `/graphql` address. If you enter only the server address,
the plugin adds `/graphql` for you.

## What shows up in Apple Home

| Feature | Accessory |
| --- | --- |
| Array | Running state, with an optional start and stop switch |
| Parity | Check state and fault status |
| Disks | Temperature and fault status for each disk |
| Docker containers | One Docker accessory with a status sensor for each container, and optional outlets to start and stop each one |
| Virtual machines | One VMs accessory with a status sensor for each VM, and optional outlets to start and stop each one |

The plugin only asks Unraid for the features you turn on.

## Start and stop controls

Controls are off by default. To use them:

1. Give the API key the update permission for what you want to control: array,
   Docker, or VMs.
2. In the plugin settings, open Controls and turn on Docker outlet controls or
   VM outlet controls.
3. In the Home app, open the Docker or VMs accessory. Each container or VM
   appears as an outlet with its own name.

If Home offers "Show as Separate Tiles", leave it off to keep the outlets
together in one group.

## Other settings

Three sections are collapsed by default and the defaults work for most people:

- Filters: choose which containers and VMs appear, and whether stopped ones show.
- Thresholds: the disk temperatures that trigger a warning.
- Advanced options: the polling interval, and the name of an environment
  variable that holds the API key.

If you manage Homebridge with environment variables, leave the key field blank
and set `UNRAID_API_KEY` for the Homebridge process. You can change the
variable name under Advanced options.

## API key permissions

Monitoring needs read access. Starting and stopping the array, Docker
containers, and VMs each need the matching update permission. The plugin sends
the key in the `x-api-key` header. Unraid's
[API guide](https://docs.unraid.net/API/how-to-use-the-api/) explains how to
create and manage keys.

## Upgrading from an older version

The platform name is still `UnraidGraphQL`, so your existing settings carry
over. Earlier versions showed each container and VM as its own accessory. After
a successful refresh, the plugin removes those and adds the grouped Docker and
VMs accessories. Apple Home automations that used the old accessories need to
be recreated.

Apple Home keeps any name you typed by hand. If an outlet's label does not
match its name in Unraid, rename the outlet in the Home app.

## Troubleshooting

- A connection error in the Homebridge log usually means a wrong server
  address, an API key without the right permissions, or an Unraid version
  without the API. Check each of those first.
- If controls do not appear, confirm that the controls toggle is on and that
  the key has the matching update permission.
- Outlets named "Outlet" or "Outlet 1" in Apple Home: rename them in the Home
  app, or remove the accessory in Homebridge and let the plugin rebuild it.

Please open an [issue](https://github.com/epthewizard/homebridge-unraid-revised/issues)
with your Homebridge log if something else goes wrong. Leave your API key out.

## Credits

This plugin builds on [homebridge-unraid](https://github.com/chibidev/homebridge-unraid)
by chibidev, which first brought Unraid containers and VMs into HomeKit. The
original uses SSH. This version replaces that with Unraid's GraphQL API and
adds array, parity, and disk monitoring. Thanks to chibidev for the original
work. The original MIT license notice is kept in [LICENSE](LICENSE).

This project is not affiliated with Unraid or Lime Technology.

## Development

```sh
npm ci
npm run build
```

Notes for contributors are in [DEVELOPMENT_NOTES.md](DEVELOPMENT_NOTES.md).

## License

MIT
