import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CollectionPoint, DeliveryZone } from "@/lib/storefront/delivery-zones";

function newZone(): DeliveryZone {
  return {
    id: crypto.randomUUID().slice(0, 8),
    name: "",
    enabled: true,
    fee: 0,
    freeOver: null,
    minOrder: 0,
    estimate: "",
  };
}

function newCollectionPoint(): CollectionPoint {
  return {
    id: crypto.randomUUID().slice(0, 8),
    name: "",
    address: "",
    phone: "",
    instructions: "",
    enabled: true,
  };
}

export function FulfilmentSettingsFields(props: {
  pickup: boolean;
  delivery: boolean;
  pricingMethod: string;
  flatFee: string;
  freeOver: string;
  minimum: string;
  areas: string;
  estimate: string;
  quoteRequired: boolean;
  deliveryInstructions: string;
  collectionInstructions: string;
  zones: DeliveryZone[];
  collectionPoints: CollectionPoint[];
  onPickupChange: (value: boolean) => void;
  onDeliveryChange: (value: boolean) => void;
  onPricingMethodChange: (value: string) => void;
  onFlatFeeChange: (value: string) => void;
  onFreeOverChange: (value: string) => void;
  onMinimumChange: (value: string) => void;
  onAreasChange: (value: string) => void;
  onEstimateChange: (value: string) => void;
  onQuoteRequiredChange: (value: boolean) => void;
  onDeliveryInstructionsChange: (value: string) => void;
  onCollectionInstructionsChange: (value: string) => void;
  onZonesChange: (zones: DeliveryZone[]) => void;
  onCollectionPointsChange: (points: CollectionPoint[]) => void;
}) {
  const {
    pickup,
    delivery,
    pricingMethod,
    flatFee,
    freeOver,
    minimum,
    areas,
    estimate,
    quoteRequired,
    deliveryInstructions,
    collectionInstructions,
    zones,
    collectionPoints,
  } = props;

  return (
    <div id="launch-fulfilment" className="space-y-6 rounded-lg border p-4">
      <div>
        <h3 className="font-semibold">Delivery and collection</h3>
        <p className="text-sm text-muted-foreground">
          Turn pickup and delivery on independently. Checkout always recalculates fees on the
          server.
        </p>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={pickup}
            onChange={(event) => props.onPickupChange(event.target.checked)}
          />
          Customer collection
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={delivery}
            onChange={(event) => props.onDeliveryChange(event.target.checked)}
          />
          Delivery
        </label>
      </div>

      <label className="block text-sm">
        Collection instructions
        <Textarea
          className="mt-1"
          maxLength={500}
          value={collectionInstructions}
          onChange={(event) => props.onCollectionInstructionsChange(event.target.value)}
          placeholder="Where to park, what to bring, shop phone…"
        />
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Collection locations</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              props.onCollectionPointsChange([...collectionPoints, newCollectionPoint()])
            }
          >
            Add location
          </Button>
        </div>
        {collectionPoints.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Optional. Add one or more pickup points if customers should choose where to collect.
          </p>
        ) : (
          <ul className="space-y-3">
            {collectionPoints.map((point, index) => (
              <li key={point.id} className="space-y-2 rounded border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={point.enabled}
                      onChange={(event) => {
                        const next = [...collectionPoints];
                        next[index] = { ...point, enabled: event.target.checked };
                        props.onCollectionPointsChange(next);
                      }}
                    />
                    Enabled
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      props.onCollectionPointsChange(collectionPoints.filter((_, i) => i !== index))
                    }
                  >
                    Remove
                  </Button>
                </div>
                <Input
                  placeholder="Location name"
                  value={point.name}
                  onChange={(event) => {
                    const next = [...collectionPoints];
                    next[index] = { ...point, name: event.target.value };
                    props.onCollectionPointsChange(next);
                  }}
                />
                <Input
                  placeholder="Address"
                  value={point.address}
                  onChange={(event) => {
                    const next = [...collectionPoints];
                    next[index] = { ...point, address: event.target.value };
                    props.onCollectionPointsChange(next);
                  }}
                />
                <Input
                  placeholder="Contact phone"
                  value={point.phone}
                  onChange={(event) => {
                    const next = [...collectionPoints];
                    next[index] = { ...point, phone: event.target.value };
                    props.onCollectionPointsChange(next);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {delivery ? (
        <>
          <label className="block text-sm">
            Delivery pricing
            <select
              className="mt-1 w-full rounded border px-3 py-2"
              value={quoteRequired ? "quote" : pricingMethod}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "quote") {
                  props.onQuoteRequiredChange(true);
                  props.onPricingMethodChange("flat");
                } else {
                  props.onQuoteRequiredChange(false);
                  props.onPricingMethodChange(value);
                }
              }}
            >
              <option value="flat">Fixed delivery fee</option>
              <option value="zone">Fees by delivery area</option>
              <option value="free">Free delivery</option>
              <option value="quote">Fee confirmed by seller (quote)</option>
            </select>
          </label>

          {!quoteRequired && pricingMethod === "flat" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Delivery fee
                <Input
                  className="mt-1"
                  value={flatFee}
                  onChange={(e) => props.onFlatFeeChange(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                Free delivery over (optional)
                <Input
                  className="mt-1"
                  value={freeOver}
                  onChange={(e) => props.onFreeOverChange(e.target.value)}
                />
              </label>
            </div>
          ) : null}

          {!quoteRequired && pricingMethod === "zone" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Delivery areas</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => props.onZonesChange([...zones, newZone()])}
                >
                  Add area
                </Button>
              </div>
              {zones.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Add at least one enabled delivery area.
                </p>
              ) : (
                <ul className="space-y-3">
                  {zones.map((zone, index) => (
                    <li
                      key={zone.id}
                      className="grid gap-2 rounded border p-3 text-sm sm:grid-cols-2"
                    >
                      <label className="flex items-center gap-2 sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={zone.enabled}
                          onChange={(event) => {
                            const next = [...zones];
                            next[index] = { ...zone, enabled: event.target.checked };
                            props.onZonesChange(next);
                          }}
                        />
                        Enabled
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="ml-auto"
                          onClick={() => props.onZonesChange(zones.filter((_, i) => i !== index))}
                        >
                          Remove
                        </Button>
                      </label>
                      <Input
                        placeholder="Area name (e.g. Harare CBD)"
                        value={zone.name}
                        onChange={(event) => {
                          const next = [...zones];
                          next[index] = { ...zone, name: event.target.value };
                          props.onZonesChange(next);
                        }}
                      />
                      <Input
                        placeholder="Fee"
                        value={String(zone.fee)}
                        onChange={(event) => {
                          const next = [...zones];
                          next[index] = { ...zone, fee: Number(event.target.value) || 0 };
                          props.onZonesChange(next);
                        }}
                      />
                      <Input
                        placeholder="Min order (optional)"
                        value={zone.minOrder ? String(zone.minOrder) : ""}
                        onChange={(event) => {
                          const next = [...zones];
                          next[index] = { ...zone, minOrder: Number(event.target.value) || 0 };
                          props.onZonesChange(next);
                        }}
                      />
                      <Input
                        placeholder="Free over (optional)"
                        value={zone.freeOver == null ? "" : String(zone.freeOver)}
                        onChange={(event) => {
                          const next = [...zones];
                          next[index] = {
                            ...zone,
                            freeOver: event.target.value ? Number(event.target.value) : null,
                          };
                          props.onZonesChange(next);
                        }}
                      />
                      <Input
                        className="sm:col-span-2"
                        placeholder="Estimated delivery time"
                        value={zone.estimate}
                        onChange={(event) => {
                          const next = [...zones];
                          next[index] = { ...zone, estimate: event.target.value };
                          props.onZonesChange(next);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <label className="block text-sm">
            Shop-wide minimum order
            <Input
              className="mt-1"
              value={minimum}
              onChange={(e) => props.onMinimumChange(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Areas you serve (summary for customers)
            <Textarea
              className="mt-1"
              maxLength={300}
              value={areas}
              onChange={(e) => props.onAreasChange(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Default delivery estimate
            <Input
              className="mt-1"
              maxLength={120}
              value={estimate}
              onChange={(e) => props.onEstimateChange(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Delivery instructions
            <Textarea
              className="mt-1"
              maxLength={500}
              value={deliveryInstructions}
              onChange={(event) => props.onDeliveryInstructionsChange(event.target.value)}
            />
          </label>
        </>
      ) : null}
    </div>
  );
}
