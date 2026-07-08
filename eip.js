// eip.js — release-to-print via the device's EIP interface.
//
// INTEGRATION POINT. Coverage measurement is complete and verified without a
// device. Releasing the analysed job to the physical printer requires the
// per-device EIP job-submission endpoint and must be tested on real hardware
// (your AltaLink C8135). This module documents the intended call and runs in
// dry-run mode by default so nothing is sent until you wire it to the device.
//
// On AltaLink/VersaLink, an EIP app submits a print-ready job to the device's
// job-submission web service. Confirm the exact path/version for your firmware
// in the Xerox EIP SDK (Job Management / Print web service). Enable EIP Web
// Services on the device first (see README).

/**
 * @param {object} opts
 * @param {string} opts.deviceUrl   e.g. https://<printer-ip>
 * @param {string} opts.filePath    print-ready file to submit
 * @param {boolean} opts.dryRun     default true — describe, don't send
 */
export async function releaseToPrint({ deviceUrl, filePath, dryRun = true }) {
  const plan = {
    action: "submitPrintJob",
    endpoint: `${deviceUrl || "https://<printer-ip>"}/webservices/... (confirm in EIP SDK for your firmware)`,
    method: "POST",
    body: { source: filePath, jobName: "CoverageMeter", note: "release after coverage measured" }
  };
  if (dryRun) {
    return { released: false, dryRun: true, plan,
      message: "Dry run: coverage measured; wire eip.js to the device's job-submission API to actually print." };
  }
  // TODO: implement the real submission against your firmware's EIP endpoint.
  throw new Error("Live EIP submission not implemented — test on-device using the EIP SDK job-submission API.");
}
