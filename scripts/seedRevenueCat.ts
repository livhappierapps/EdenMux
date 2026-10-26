import { getUncachableRevenueCatClient } from "./revenueCatClient";
import {
  listProjects,
  createProject,
  listApps,
  createApp,
  listAppPublicApiKeys,
  listProducts,
  createProduct,
  listEntitlements,
  createEntitlement,
  attachProductsToEntitlement,
  listOfferings,
  createOffering,
  updateOffering,
  listPackages,
  createPackages,
  attachProductsToPackage,
  type App,
  type Product,
  type Project,
  type Entitlement,
  type Offering,
  type Package,
  type CreateProductData,
} from "@replit/revenuecat-sdk";

const PROJECT_NAME = "EdenMux";
const APP_STORE_APP_NAME = "EdenMux iOS";
const APP_STORE_BUNDLE_ID = "com.edenmux";
const PLAY_STORE_APP_NAME = "EdenMux Android";
const PLAY_STORE_PACKAGE_NAME = "com.edenmux";

type TestStorePricesResponse = {
  object: string;
  prices: { amount_micros: number; currency: string }[];
};

const PRODUCTS = [
  {
    id: "com.edenmux.core_unlock",
    displayName: "EdenMux Core Unlock",
    title: "EdenMux Core Unlock",
    price_micros: 2990000,
    entitlement: "core_unlock",
    entitlementDisplay: "Core Unlock",
    packageId: "core_unlock",
    packageDisplay: "Core Unlock",
  },
  {
    id: "com.edenmux.theme_candy",
    displayName: "Candy Theme",
    title: "Candy Theme",
    price_micros: 990000,
    entitlement: "candy",
    entitlementDisplay: "Candy Theme",
    packageId: "candy",
    packageDisplay: "Candy Theme",
  },
  {
    id: "com.edenmux.theme_cyber",
    displayName: "Cyber Theme",
    title: "Cyber Theme",
    price_micros: 990000,
    entitlement: "cyber",
    entitlementDisplay: "Cyber Theme",
    packageId: "cyber",
    packageDisplay: "Cyber Theme",
  },
  {
    id: "com.edenmux.theme_neo",
    displayName: "Neo Theme",
    title: "Neo Theme",
    price_micros: 990000,
    entitlement: "neo",
    entitlementDisplay: "Neo Theme",
    packageId: "neo",
    packageDisplay: "Neo Theme",
  },
  {
    id: "com.edenmux.theme_gothic",
    displayName: "Gothic Theme",
    title: "Gothic Theme",
    price_micros: 990000,
    entitlement: "gothic",
    entitlementDisplay: "Gothic Theme",
    packageId: "gothic",
    packageDisplay: "Gothic Theme",
  },
  {
    id: "com.edenmux.theme_glitter",
    displayName: "Glitter Theme",
    title: "Glitter Theme",
    price_micros: 990000,
    entitlement: "glitter",
    entitlementDisplay: "Glitter Theme",
    packageId: "glitter",
    packageDisplay: "Glitter Theme",
  },
  // ─── Metallic Pack ───────────────────────────────────────────────────────
  {
    id: "com.edenmux.theme_gold",
    displayName: "Gold Theme",
    title: "Gold Theme",
    price_micros: 990000,
    entitlement: "gold",
    entitlementDisplay: "Gold Theme",
    packageId: "gold",
    packageDisplay: "Gold Theme",
  },
  {
    id: "com.edenmux.theme_chrome",
    displayName: "Chrome Theme",
    title: "Chrome Theme",
    price_micros: 990000,
    entitlement: "chrome",
    entitlementDisplay: "Chrome Theme",
    packageId: "chrome",
    packageDisplay: "Chrome Theme",
  },
  {
    id: "com.edenmux.theme_cobalt",
    displayName: "Cobalt Theme",
    title: "Cobalt Theme",
    price_micros: 990000,
    entitlement: "cobalt",
    entitlementDisplay: "Cobalt Theme",
    packageId: "cobalt",
    packageDisplay: "Cobalt Theme",
  },
  {
    id: "com.edenmux.theme_silver",
    displayName: "Silver Theme",
    title: "Silver Theme",
    price_micros: 990000,
    entitlement: "silver",
    entitlementDisplay: "Silver Theme",
    packageId: "silver",
    packageDisplay: "Silver Theme",
  },
  {
    id: "com.edenmux.theme_bundle_metallic",
    displayName: "Metallic Pack (Gold, Chrome, Cobalt, Silver)",
    title: "Metallic Pack",
    price_micros: 2990000,
    entitlement: null,
    entitlementDisplay: null,
    packageId: "theme_bundle_metallic",
    packageDisplay: "Metallic Pack",
  },
  // ─── Legacy bundles ──────────────────────────────────────────────────────
  {
    id: "com.edenmux.theme_bundle_current",
    displayName: "Theme Bundle (Original 5)",
    title: "Theme Bundle",
    price_micros: 2990000,
    entitlement: null,
    entitlementDisplay: null,
    packageId: "theme_bundle",
    packageDisplay: "Theme Bundle",
  },
  {
    id: "com.edenmux.theme_bundle_future",
    displayName: "Theme Bundle Future",
    title: "Theme Bundle Future",
    price_micros: 2990000,
    entitlement: null,
    entitlementDisplay: null,
    packageId: "theme_bundle_future",
    packageDisplay: "Theme Bundle Future",
  },
];

const BUNDLE_THEMES = ["candy", "cyber", "neo", "gothic", "glitter"];
const METALLIC_THEMES = ["gold", "chrome", "cobalt", "silver"];

async function seedRevenueCat() {
  const client = await getUncachableRevenueCatClient();

  let project: Project;
  const { data: existingProjects, error: listProjectsError } = await listProjects({
    client,
    query: { limit: 20 },
  });
  if (listProjectsError) throw new Error("Failed to list projects");

  const existingProject = existingProjects.items?.find((p) => p.name === PROJECT_NAME);
  if (existingProject) {
    console.log("Project already exists:", existingProject.id);
    project = existingProject;
  } else {
    const { data: newProject, error } = await createProject({ client, body: { name: PROJECT_NAME } });
    if (error) throw new Error("Failed to create project");
    console.log("Created project:", newProject.id);
    project = newProject;
  }

  const { data: apps, error: listAppsError } = await listApps({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listAppsError || !apps || apps.items.length === 0) throw new Error("No apps found");

  let testStoreApp: App | undefined = apps.items.find((a) => a.type === "test_store");
  let appStoreApp: App | undefined = apps.items.find((a) => a.type === "app_store");
  let playStoreApp: App | undefined = apps.items.find((a) => a.type === "play_store");

  if (!testStoreApp) throw new Error("No test store app found");
  console.log("Test Store app:", testStoreApp.id);

  if (!appStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: { name: APP_STORE_APP_NAME, type: "app_store", app_store: { bundle_id: APP_STORE_BUNDLE_ID } },
    });
    if (error) throw new Error("Failed to create App Store app");
    appStoreApp = newApp;
    console.log("Created App Store app:", appStoreApp.id);
  } else {
    console.log("App Store app:", appStoreApp.id);
  }

  if (!playStoreApp) {
    const { data: newApp, error } = await createApp({
      client,
      path: { project_id: project.id },
      body: { name: PLAY_STORE_APP_NAME, type: "play_store", play_store: { package_name: PLAY_STORE_PACKAGE_NAME } },
    });
    if (error) throw new Error("Failed to create Play Store app");
    playStoreApp = newApp;
    console.log("Created Play Store app:", playStoreApp.id);
  } else {
    console.log("Play Store app:", playStoreApp.id);
  }

  const { data: existingProducts, error: listProductsError } = await listProducts({
    client,
    path: { project_id: project.id },
    query: { limit: 100 },
  });
  if (listProductsError) throw new Error("Failed to list products");

  const ensureProduct = async (targetApp: App, storeId: string, displayName: string, title: string, isTestStore: boolean): Promise<Product> => {
    const existing = existingProducts.items?.find(
      (p) => p.store_identifier === storeId && p.app_id === targetApp.id
    );
    if (existing) {
      console.log(`Product already exists (${storeId}):`, existing.id);
      return existing;
    }
    const body: CreateProductData["body"] = {
      store_identifier: storeId,
      app_id: targetApp.id,
      type: isTestStore ? ("non_consumable" as const) : ("one_time" as const),
      display_name: displayName,
    };
    if (isTestStore) body.title = title;
    const { data: created, error } = await createProduct({
      client,
      path: { project_id: project.id },
      body,
    });
    if (error) throw new Error(`Failed to create product ${storeId}: ${JSON.stringify(error)}`);
    console.log(`Created product (${storeId}):`, created.id);
    return created;
  };

  const productMap: Record<string, { test: Product; appStore: Product; playStore: Product }> = {};
  for (const p of PRODUCTS) {
    const test = await ensureProduct(testStoreApp, p.id, p.displayName, p.title, true);
    const appStore = await ensureProduct(appStoreApp, p.id, p.displayName, p.title, false);
    const playStore = await ensureProduct(playStoreApp, p.id, p.displayName, p.title, false);
    productMap[p.id] = { test, appStore, playStore };

    const { error: priceError } = await (client as any).post({
      url: "/projects/{project_id}/products/{product_id}/test_store_prices",
      path: { project_id: project.id, product_id: test.id },
      body: { prices: [{ amount_micros: p.price_micros, currency: "USD" }] },
    });

    if (priceError) {
      if ((priceError as any).type === "resource_already_exists") {
        console.log(`Test store price already exists for ${p.id}`);
      } else {
        throw new Error(`Failed to set test store price for ${p.id}: ${JSON.stringify(priceError)}`);
      }
    } else {
      console.log(`Set test store price for ${p.id}: $${p.price_micros / 1_000_000}`);
    }
  }

  const { data: existingEntitlements, error: listEntitlementsError } = await listEntitlements({
    client,
    path: { project_id: project.id },
    query: { limit: 50 },
  });
  if (listEntitlementsError) throw new Error("Failed to list entitlements");

  const ensureEntitlement = async (lookupKey: string, displayName: string): Promise<Entitlement> => {
    const existing = existingEntitlements.items?.find((e) => e.lookup_key === lookupKey);
    if (existing) {
      console.log(`Entitlement already exists (${lookupKey}):`, existing.id);
      return existing;
    }
    const { data: created, error } = await createEntitlement({
      client,
      path: { project_id: project.id },
      body: { lookup_key: lookupKey, display_name: displayName },
    });
    if (error) throw new Error(`Failed to create entitlement ${lookupKey}`);
    console.log(`Created entitlement (${lookupKey}):`, created.id);
    return created;
  };

  const entitlementMap: Record<string, Entitlement> = {};
  for (const p of PRODUCTS) {
    if (!p.entitlement) continue;
    entitlementMap[p.entitlement] = await ensureEntitlement(p.entitlement, p.entitlementDisplay!);
  }

  const attachProductsToEnt = async (entitlementId: string, productIds: string[]) => {
    const { error } = await attachProductsToEntitlement({
      client,
      path: { project_id: project.id, entitlement_id: entitlementId },
      body: { product_ids: productIds },
    });
    if (error && (error as any).type !== "unprocessable_entity_error") {
      throw new Error(`Failed to attach products to entitlement ${entitlementId}`);
    }
  };

  for (const p of PRODUCTS) {
    if (!p.entitlement) continue;
    const ent = entitlementMap[p.entitlement];
    const prod = productMap[p.id];
    await attachProductsToEnt(ent.id, [prod.test.id, prod.appStore.id, prod.playStore.id]);
    console.log(`Attached ${p.id} products to entitlement ${p.entitlement}`);
  }

  const bundleProd = productMap["com.edenmux.theme_bundle_current"];
  for (const themeKey of BUNDLE_THEMES) {
    const ent = entitlementMap[themeKey];
    if (ent) {
      await attachProductsToEnt(ent.id, [bundleProd.test.id, bundleProd.appStore.id, bundleProd.playStore.id]);
      console.log(`Attached original bundle to entitlement ${themeKey}`);
    }
  }

  const metallicBundleProd = productMap["com.edenmux.theme_bundle_metallic"];
  for (const themeKey of METALLIC_THEMES) {
    const ent = entitlementMap[themeKey];
    if (ent) {
      await attachProductsToEnt(ent.id, [metallicBundleProd.test.id, metallicBundleProd.appStore.id, metallicBundleProd.playStore.id]);
      console.log(`Attached metallic bundle to entitlement ${themeKey}`);
    }
  }

  let offering: Offering | undefined;
  const { data: existingOfferings, error: listOfferingsError } = await listOfferings({
    client,
    path: { project_id: project.id },
    query: { limit: 20 },
  });
  if (listOfferingsError) throw new Error("Failed to list offerings");

  const existingOffering = existingOfferings.items?.find((o) => o.lookup_key === "default");
  if (existingOffering) {
    console.log("Offering already exists:", existingOffering.id);
    offering = existingOffering;
  } else {
    const { data: newOffering, error } = await createOffering({
      client,
      path: { project_id: project.id },
      body: { lookup_key: "default", display_name: "EdenMux Store" },
    });
    if (error) throw new Error("Failed to create offering");
    console.log("Created offering:", newOffering.id);
    offering = newOffering;
  }

  if (!offering.is_current) {
    const { error } = await updateOffering({
      client,
      path: { project_id: project.id, offering_id: offering.id },
      body: { is_current: true },
    });
    if (error) throw new Error("Failed to set offering as current");
    console.log("Set offering as current");
  }

  const { data: existingPackages, error: listPackagesError } = await listPackages({
    client,
    path: { project_id: project.id, offering_id: offering.id },
    query: { limit: 50 },
  });
  if (listPackagesError) throw new Error("Failed to list packages");

  for (const p of PRODUCTS) {
    const existingPkg = existingPackages.items?.find((pkg) => pkg.lookup_key === p.packageId);
    let pkg: Package;
    if (existingPkg) {
      console.log(`Package already exists (${p.packageId}):`, existingPkg.id);
      pkg = existingPkg;
    } else {
      const { data: newPkg, error } = await createPackages({
        client,
        path: { project_id: project.id, offering_id: offering.id },
        body: { lookup_key: p.packageId, display_name: p.packageDisplay },
      });
      if (error) throw new Error(`Failed to create package ${p.packageId}`);
      console.log(`Created package (${p.packageId}):`, newPkg.id);
      pkg = newPkg;
    }

    const prod = productMap[p.id];
    const { error: attachPkgError } = await attachProductsToPackage({
      client,
      path: { project_id: project.id, package_id: pkg.id },
      body: {
        products: [
          { product_id: prod.test.id, eligibility_criteria: "all" },
          { product_id: prod.appStore.id, eligibility_criteria: "all" },
          { product_id: prod.playStore.id, eligibility_criteria: "all" },
        ],
      },
    });
    if (attachPkgError && (attachPkgError as any).type !== "unprocessable_entity_error") {
      throw new Error(`Failed to attach products to package ${p.packageId}`);
    }
    console.log(`Attached products to package ${p.packageId}`);
  }

  const { data: testKeys } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: testStoreApp.id },
  });
  const { data: appStoreKeys } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: appStoreApp.id },
  });
  const { data: playStoreKeys } = await listAppPublicApiKeys({
    client,
    path: { project_id: project.id, app_id: playStoreApp.id },
  });

  console.log("\n====================");
  console.log("EdenMux RevenueCat setup complete!");
  console.log("Project ID:", project.id);
  console.log("Test Store App ID:", testStoreApp.id);
  console.log("App Store App ID:", appStoreApp.id);
  console.log("Play Store App ID:", playStoreApp.id);
  console.log("EXPO_PUBLIC_REVENUECAT_TEST_API_KEY:", testKeys?.items.map((k) => k.key).join(", ") ?? "N/A");
  console.log("EXPO_PUBLIC_REVENUECAT_IOS_API_KEY:", appStoreKeys?.items.map((k) => k.key).join(", ") ?? "N/A");
  console.log("EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY:", playStoreKeys?.items.map((k) => k.key).join(", ") ?? "N/A");
  console.log("REVENUECAT_PROJECT_ID:", project.id);
  console.log("REVENUECAT_TEST_STORE_APP_ID:", testStoreApp.id);
  console.log("REVENUECAT_APPLE_APP_STORE_APP_ID:", appStoreApp.id);
  console.log("REVENUECAT_GOOGLE_PLAY_STORE_APP_ID:", playStoreApp.id);
  console.log("====================\n");
}

seedRevenueCat().catch(console.error);
