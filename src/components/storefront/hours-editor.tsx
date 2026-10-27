import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SHOP_TIMEZONE,
  WEEKDAYS,
  type CollectionWindow,
  type WeeklyHour,
} from "@/lib/storefront/clocks";

export type HoursState = Record<number, { open: string; close: string; closed: boolean }>;

export function hoursStateFrom(rows: WeeklyHour[] | undefined): HoursState {
  const next: HoursState = {};
  for (const day of WEEKDAYS) {
    const row = (rows ?? []).find((item) => item.weekday === day.weekday);
    next[day.weekday] = {
      open: row?.open ?? "08:00",
      close: row?.close ?? "17:00",
      closed: !row,
    };
  }
  return next;
}

export function weeklyHoursFromState(state: HoursState): WeeklyHour[] {
  return WEEKDAYS.flatMap((day) => {
    const row = state[day.weekday];
    if (!row || row.closed || !row.open || !row.close) return [];
    return [{ weekday: day.weekday, open: row.open, close: row.close }];
  });
}

export function HoursEditor({
  hours,
  onHours,
  windows,
  onWindows,
  cutoffTime,
  onCutoffTime,
}: {
  hours: HoursState;
  onHours: (next: HoursState) => void;
  windows: CollectionWindow[];
  onWindows: (next: CollectionWindow[]) => void;
  cutoffTime: string;
  onCutoffTime: (next: string) => void;
}) {
  return (
    <div className="space-y-3 md:col-span-2">
      <p className="text-sm text-muted-foreground">
        Times use {SHOP_TIMEZONE} (CAT). Leave every day closed to accept orders at any hour.
        Collection windows are required before customers must pick a slot.
      </p>
      <div className="space-y-2">
        {WEEKDAYS.map((day) => {
          const row = hours[day.weekday] ?? { open: "08:00", close: "17:00", closed: true };
          return (
            <div
              key={day.weekday}
              className="grid grid-cols-[7rem_auto_1fr_1fr] items-center gap-2 text-sm"
            >
              <span>{day.label}</span>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={row.closed}
                  onChange={(event) =>
                    onHours({
                      ...hours,
                      [day.weekday]: { ...row, closed: event.target.checked },
                    })
                  }
                />
                Closed
              </label>
              <Input
                type="time"
                disabled={row.closed}
                value={row.open}
                onChange={(event) =>
                  onHours({ ...hours, [day.weekday]: { ...row, open: event.target.value } })
                }
                aria-label={`${day.label} opens`}
              />
              <Input
                type="time"
                disabled={row.closed}
                value={row.close}
                onChange={(event) =>
                  onHours({ ...hours, [day.weekday]: { ...row, close: event.target.value } })
                }
                aria-label={`${day.label} closes`}
              />
            </div>
          );
        })}
      </div>
      <label className="block text-sm">
        <Label>Order cut-off (time)</Label>
        <Input
          type="time"
          value={cutoffTime}
          onChange={(event) => onCutoffTime(event.target.value)}
        />
      </label>
      <div className="space-y-2">
        <Label>Collection windows</Label>
        {windows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No windows yet. Customers can still order pickup without choosing a slot.
          </p>
        ) : null}
        {windows.map((window, index) => (
          <div
            key={`${window.weekday}-${window.start}-${index}`}
            className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2"
          >
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={window.weekday}
              onChange={(event) => {
                const next = windows.slice();
                next[index] = { ...window, weekday: Number(event.target.value) };
                onWindows(next);
              }}
              aria-label={`Window ${index + 1} weekday`}
            >
              {WEEKDAYS.map((day) => (
                <option key={day.weekday} value={day.weekday}>
                  {day.label}
                </option>
              ))}
            </select>
            <Input
              type="time"
              value={window.start}
              onChange={(event) => {
                const next = windows.slice();
                next[index] = { ...window, start: event.target.value };
                onWindows(next);
              }}
              aria-label={`Window ${index + 1} start`}
            />
            <Input
              type="time"
              value={window.end}
              onChange={(event) => {
                const next = windows.slice();
                next[index] = { ...window, end: event.target.value };
                onWindows(next);
              }}
              aria-label={`Window ${index + 1} end`}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => onWindows(windows.filter((_, item) => item !== index))}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => onWindows([...windows, { weekday: 1, start: "10:00", end: "12:00" }])}
        >
          Add collection window
        </Button>
      </div>
    </div>
  );
}
