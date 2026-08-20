// STATIC registry of installed plugins. This explicit list — not a filesystem
// or network scan — is what makes the platform "WordPress-like" WITHOUT ever
// loading arbitrary code: every plugin here is vetted, in-repo code reviewed
// like any other module. To install a plugin, add it to src/plugins/<id>/ and
// list its module here. Each module exports { manifest, register, onEnable?,
// onDisable?, onConfigChange? }.

import * as memberEmail from "./member-email";
import * as doorAccessController from "./door-access-controller";

/** @type {Array<{manifest: object, register?: Function, onEnable?: Function, onDisable?: Function, onConfigChange?: Function}>} */
export const PLUGINS = [memberEmail, doorAccessController];

export default PLUGINS;
