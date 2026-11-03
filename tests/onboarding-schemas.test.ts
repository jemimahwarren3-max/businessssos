import { describe, expect, it } from "vitest";
import {
  onboardingConfigSchema,
  saveOnboardingSettingsSchema,
  createBusinessSchema,
} from "@/lib/business.schemas";

describe("onboardingConfigSchema", () => {
  it("applies all defaults when given an empty object", () => {
    const result = onboardingConfigSchema.parse({});
    expect(result).toEqual({
      sellingChannel: "physical",
      isExistingBusiness: true,
      hasPhysicalLocation: true,
      subcategory: "",
      businessPhone: "",
      sellsProducts: true,
      sellsServices: false,
      paymentMethods: ["cash"],
      allowsCredit: false,
      allowsLayby: false,
      tracksStock: true,
      pricingModel: "retail",
      offersDelivery: false,
      offersCollection: true,
      hasMultipleBranches: false,
      hasEmployees: false,
      completedSteps: [],
    });
  });

  it("accepts overrides", () => {
    const result = onboardingConfigSchema.parse({
      sellingChannel: "online",
      paymentMethods: ["ecocash", "cash"],
      hasEmployees: true,
    });
    expect(result.sellingChannel).toBe("online");
    expect(result.paymentMethods).toEqual(["ecocash", "cash"]);
    expect(result.hasEmployees).toBe(true);
  });

  it("rejects invalid pricingModel", () => {
    expect(() =>
      onboardingConfigSchema.parse({ pricingModel: "auction" }),
    ).toThrow();
  });
});

describe("saveOnboardingSettingsSchema", () => {
  it("requires a valid businessId", () => {
    expect(() => saveOnboardingSettingsSchema.parse({})).toThrow();
  });

  it("parses with defaults", () => {
    const result = saveOnboardingSettingsSchema.parse({
      businessId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    });
    expect(result.paymentMethods).toEqual(["cash"]);
    expect(result.pricingModel).toBe("retail");
    expect(result.allowsCredit).toBe(false);
    expect(result.offersCollection).toBe(true);
  });
});

describe("createBusinessSchema with onboarding fields", () => {
  it("includes businessPath and onboardingConfig defaults", () => {
    const result = createBusinessSchema.parse({
      name: "Test Shop",
      businessType: "grocery",
      currency: "USD",
    });
    expect(result.businessPath).toBe("management");
    expect(result.onboardingConfig).toBeDefined();
    expect(result.onboardingConfig.sellingChannel).toBe("physical");
  });

  it("accepts full path", () => {
    const result = createBusinessSchema.parse({
      name: "Online Store",
      businessType: "boutique",
      currency: "ZWG",
      businessPath: "full",
    });
    expect(result.businessPath).toBe("full");
  });

  it("rejects invalid businessPath", () => {
    expect(() =>
      createBusinessSchema.parse({
        name: "Bad Path",
        businessType: "grocery",
        currency: "USD",
        businessPath: "premium",
      }),
    ).toThrow();
  });
});
