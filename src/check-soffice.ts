import { showToast, Toast } from "@raycast/api";
import { spawnSync } from "child_process";

export default async function Command() {
  try {
    const res = spawnSync("soffice", ["--version"], { encoding: "utf8" });
    if (res.error) {
      await showToast(Toast.Style.Failure, "soffice not found", String(res.error.message));
      return;
    }

    const out = (res.stdout || "").toString().trim();
    if (out) {
      await showToast(Toast.Style.Success, "soffice found", out);
    } else {
      await showToast(Toast.Style.Success, "soffice ran", "No output from soffice --version");
    }
  } catch (e) {
    await showToast(Toast.Style.Failure, "Error running soffice", String(e));
  }
}
