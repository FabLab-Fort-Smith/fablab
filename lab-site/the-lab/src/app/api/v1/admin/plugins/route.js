import PluginController from "./controller";

export const runtime = "nodejs";

export async function GET() {
  return await PluginController.list();
}

export async function PATCH(req) {
  return await PluginController.setEnabled(req);
}

export async function PUT(req) {
  return await PluginController.setConfig(req);
}
