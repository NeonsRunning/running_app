"use client";

import { Link } from "@/components/i18n/link";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { useFormat, useT } from "@/components/i18n/provider";
import { cn } from "@/lib/cn";
import { MAX_CHILDREN } from "@/lib/events/pricing";
import { distanceLabel } from "@/lib/i18n/labels";
import type { Translate } from "@/lib/i18n/translate";
import type { RaceCategory } from "@/lib/types";

/**
 * The children an adult adds to their sign-up, on the runner step.
 *
 * A child has no account: the adult types a name, a date of birth, a gender
 * and a distance for each, up to `MAX_CHILDREN`, and accepts the waiver on
 * their behalf. The adult's own emergency contact covers them. What is typed
 * here goes to the registration only; nothing is saved to the adult's profile.
 *
 * The checks here are the ones `register_for_event()` makes again: under 18
 * on race day, and at least the event's minimum age.
 */

export type Child = {
  /** Stable across removals, so a card keeps its fields when another goes. */
  key: number;
  firstName: string;
  lastName: string;
  dob: string;
  /** "" until picked: nothing is assumed about a child. */
  gender: string;
  categoryId: string;
};

export type ChildErrors = Partial<
  Record<"firstName" | "lastName" | "dob" | "gender" | "categoryId", string>
>;

export function emptyChild(key: number, categoryId: string): Child {
  return { key, firstName: "", lastName: "", dob: "", gender: "", categoryId };
}

/** Whole years between two ISO dates, as `age()` counts them in Postgres. */
export function ageOn(birthDate: string, on: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ey, em, ed] = on.split("-").map(Number);
  return ey - by - (em < bm || (em === bm && ed < bd) ? 1 : 0);
}

/** One entry per child, empty when that child's fields are all fine. */
export function validateChildren(
  children: Child[],
  opts: {
    raceDay: string;
    minimumAge: number;
    isFull: (categoryId: string) => boolean;
  },
  t: Translate,
): ChildErrors[] {
  return children.map((c) => {
    const e: ChildErrors = {};
    if (!c.firstName.trim()) e.firstName = t("register.children.errors.firstName");
    if (!c.lastName.trim()) e.lastName = t("register.children.errors.lastName");
    if (!c.dob) e.dob = t("register.children.errors.dob");
    else {
      const age = ageOn(c.dob, opts.raceDay);
      if (age >= 18) e.dob = t("register.children.errors.tooOld");
      else if (age < opts.minimumAge)
        e.dob = t("register.children.errors.tooYoung", { age: opts.minimumAge });
    }
    if (!c.gender) e.gender = t("register.children.errors.gender");
    if (opts.isFull(c.categoryId))
      e.categoryId = t("register.children.errors.categoryFull");
    return e;
  });
}

export function ChildrenFields({
  list,
  errors,
  categories,
  isFull,
  childPrice,
  minimumAge,
  onChange,
  onAdd,
  onRemove,
  waiver,
  waiverError,
  onWaiver,
}: {
  list: Child[];
  errors: ChildErrors[];
  categories: RaceCategory[];
  isFull: (categoryId: string) => boolean;
  childPrice: number;
  minimumAge: number;
  onChange: (key: number, field: keyof ChildErrors, value: string) => void;
  onAdd: () => void;
  onRemove: (key: number) => void;
  waiver: boolean;
  waiverError: boolean;
  onWaiver: (accepted: boolean) => void;
}) {
  const t = useT();
  const fmt = useFormat();
  const price =
    childPrice === 0
      ? t("register.step3.free")
      : Number.isInteger(childPrice)
        ? fmt.moneyWhole(childPrice)
        : fmt.money(childPrice);

  return (
    <div className="mt-9 border-t-2 border-line pt-8">
      <h2 className="font-display text-2xl font-black uppercase">
        {t("register.children.title")}
      </h2>
      <p className="mt-2 text-[15px] text-fg-dim">
        {t("register.children.body", {
          max: MAX_CHILDREN,
          min: minimumAge,
          price,
        })}
      </p>

      <div className="mt-6 flex flex-col gap-5">
        {list.map((child, i) => {
          const e = errors[i] ?? {};
          const n = i + 1;
          return (
            <div
              key={child.key}
              role="group"
              aria-labelledby={`child-${child.key}-title`}
              className="border-2 border-line p-5 sm:p-7"
            >
              <div className="flex items-center justify-between gap-4">
                <h3
                  id={`child-${child.key}-title`}
                  className="font-mono text-[11px] tracking-[0.18em] text-neon-lime uppercase"
                >
                  {t("register.children.child", { n })}
                </h3>
                {list.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => onRemove(child.key)}
                    aria-label={t("register.children.remove", { n })}
                    className="-my-2 min-h-11 px-2 text-xs font-bold tracking-wider text-fg-dim uppercase underline underline-offset-4 hover:text-fg"
                  >
                    {t("register.children.removeShort")}
                  </button>
                ) : null}
              </div>

              <div className="mt-5 grid gap-6 sm:grid-cols-2">
                <Field label={t("register.step2.firstName")} error={e.firstName}>
                  {(p) => (
                    <Input
                      {...p}
                      name={`child-${n}-first-name`}
                      autoComplete="off"
                      maxLength={80}
                      value={child.firstName}
                      onChange={(ev) =>
                        onChange(child.key, "firstName", ev.target.value)
                      }
                    />
                  )}
                </Field>
                <Field label={t("register.step2.lastName")} error={e.lastName}>
                  {(p) => (
                    <Input
                      {...p}
                      name={`child-${n}-last-name`}
                      autoComplete="off"
                      maxLength={80}
                      value={child.lastName}
                      onChange={(ev) =>
                        onChange(child.key, "lastName", ev.target.value)
                      }
                    />
                  )}
                </Field>
                <Field label={t("register.step2.dob")} error={e.dob}>
                  {(p) => (
                    <Input
                      {...p}
                      type="date"
                      name={`child-${n}-dob`}
                      autoComplete="off"
                      value={child.dob}
                      onChange={(ev) => onChange(child.key, "dob", ev.target.value)}
                    />
                  )}
                </Field>
                <Field label={t("register.step2.gender")} error={e.gender}>
                  {(p) => (
                    <Select
                      {...p}
                      name={`child-${n}-gender`}
                      value={child.gender}
                      onChange={(ev) =>
                        onChange(child.key, "gender", ev.target.value)
                      }
                    >
                      <option value="" disabled>
                        {t("register.children.select")}
                      </option>
                      <option value="female">
                        {t("register.step2.genderFemale")}
                      </option>
                      <option value="male">{t("register.step2.genderMale")}</option>
                      <option value="other">
                        {t("register.step2.genderOther")}
                      </option>
                      <option value="undisclosed">
                        {t("register.step2.genderUndisclosed")}
                      </option>
                    </Select>
                  )}
                </Field>
                <Field
                  label={t("register.children.distance")}
                  error={e.categoryId}
                  className="sm:col-span-2"
                >
                  {(p) => (
                    <Select
                      {...p}
                      name={`child-${n}-distance`}
                      value={child.categoryId}
                      onChange={(ev) =>
                        onChange(child.key, "categoryId", ev.target.value)
                      }
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id} disabled={isFull(c.id)}>
                          {isFull(c.id)
                            ? t("register.children.distanceFull", {
                                distance: distanceLabel(t, c.name),
                              })
                            : distanceLabel(t, c.name)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            </div>
          );
        })}
      </div>

      {list.length < MAX_CHILDREN ? (
        <Button variant="outline" size="lg" className="mt-5" onClick={onAdd}>
          {t("register.children.add")}
        </Button>
      ) : null}

      <div
        className={cn(
          "mt-7 border-2 p-5",
          waiverError ? "border-danger" : "border-line",
        )}
      >
        <Checkbox
          checked={waiver}
          name="guardian-waiver"
          aria-invalid={waiverError || undefined}
          aria-describedby={waiverError ? "guardian-waiver-error" : undefined}
          onChange={(ev) => onWaiver(ev.target.checked)}
          label={
            <>
              {t("register.children.waiverPre")}{" "}
              <Link
                href="/legal/waiver"
                target="_blank"
                rel="noopener noreferrer"
                className="text-neon-lime underline underline-offset-2"
              >
                {t("register.step1.waiverLink")}
              </Link>{" "}
              {t("register.children.waiverPost")}
            </>
          }
        />
        {waiverError ? (
          <p
            id="guardian-waiver-error"
            role="alert"
            className="mt-3 text-[13px] font-semibold text-danger"
          >
            {t("register.children.waiverError")}
          </p>
        ) : null}
      </div>

      <p
        role="note"
        className="mt-5 border-2 border-neon-yellow/60 p-5 text-[14px] leading-relaxed font-semibold text-fg"
      >
        {t("register.children.notice")}
      </p>
    </div>
  );
}
