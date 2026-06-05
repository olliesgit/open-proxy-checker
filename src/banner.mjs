/**
 * Open Proxy Checker -- ASCII Banner
 *
 * Displayed on CLI startup unless --no-banner or structured output format is used.
 */

export const BANNER = `
   ____                    _____
  / __ \\____  ___  ____   / __ \\_________  _  ____
 / / / / __ \\/ _ \\/ __ \\ / /_/ / ___/ __ \\| |/_/ /
/ /_/ / /_/ /  __/ / / // ____/ /  / /_/ />  </ /
\\____/ .___/\\___/_/ /_//_/   /_/   \\____/_/|_/_/
    /_/
          Open Proxy Checker
`;

export function shouldShowBanner(options = {}) {
  if (options.noBanner) return false;
  if (options.format && ["json", "csv", "txt"].includes(options.format)) return false;
  return true;
}
