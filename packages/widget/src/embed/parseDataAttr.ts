/** Parse boolean HTML data-* attributes (`data-debug`, etc.). */
export function parseScriptDataFlag(value: string | undefined): boolean {
  if (value === undefined) return false;
  const v = value.trim().toLowerCase();
  return v === "" || v === "true" || v === "1" || v === "yes";
}
