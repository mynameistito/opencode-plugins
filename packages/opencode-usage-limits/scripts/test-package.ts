import { createRequire } from "node:module";

const expectedId = "mynameistito.usage-limits";
const entrypoint = new URL("../dist/index.mjs", import.meta.url);

try {
  createRequire(entrypoint).resolve("effect");
} catch {
  console.error(
    "Package smoke test failed: Effect did not resolve from the built entrypoint"
  );
  process.exit(1);
}

interface PackagePlugin {
  readonly id?: string;
  readonly setup?: (...args: never[]) => void | Promise<void>;
}

const isObject = <T>(value: T): value is T & object =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isPackagePlugin = <T>(value: T): value is T & PackagePlugin => {
  if (!isObject(value)) {
    return false;
  }
  const hasValidID =
    !("id" in value) || value.id === undefined || typeof value.id === "string";
  const hasValidSetup =
    !("setup" in value) ||
    value.setup === undefined ||
    typeof value.setup === "function";
  return hasValidID && hasValidSetup;
};

const module = await import(entrypoint.href);
const defaultExport =
  isObject(module) && "default" in module ? module.default : undefined;
const plugin = isPackagePlugin(defaultExport) ? defaultExport : null;

const hasExpectedId = (value: PackagePlugin | null | undefined): boolean =>
  value !== null &&
  value !== undefined &&
  "id" in value &&
  value.id === expectedId;
const hasSetup = (
  value: PackagePlugin | null | undefined
): value is PackagePlugin & { readonly setup: PackagePlugin["setup"] } =>
  value !== null && value !== undefined && value.setup !== undefined;
const isPlugin = hasExpectedId(plugin) && hasSetup(plugin);
if (!isPlugin) {
  console.error(
    `Package smoke test failed: expected default export ${expectedId} with callable setup`
  );
  process.exit(1);
}

console.log(`Package smoke test passed: ${expectedId}`);
