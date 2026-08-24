"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/components/i18n/provider";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactForm() {
  const { toast } = useToast();
  const t = useT();
  const [values, setValues] = useState({
    name: "",
    email: "",
    topic: "registration",
    message: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="border-2 border-neon-lime bg-neon-lime/8 px-6 py-9">
        <h2 className="font-display text-3xl font-black text-neon-lime uppercase">
          {t("contactForm.sentTitle")}
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-fg-muted">
          {t("contactForm.sentBody", {
            name:
              values.name.split(" ")[0] ||
              t("contactForm.sentBodyFallbackName"),
            email: values.email,
          })}
        </p>
        <Button
          variant="outline"
          size="md"
          className="mt-6"
          onClick={() => {
            setSent(false);
            setValues({ name: "", email: "", topic: "registration", message: "" });
          }}
        >
          {t("contactForm.sendAnother")}
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const next: Record<string, string> = {};
        if (!values.name.trim()) next.name = t("contactForm.nameRequired");
        if (!EMAIL_RE.test(values.email))
          next.email = t("contactForm.emailInvalid");
        if (values.message.trim().length < 10)
          next.message = t("contactForm.messageShort");
        setErrors(next);
        if (Object.keys(next).length) {
          toast({
            title: t("contactForm.checkFormTitle"),
            body: t("contactForm.checkFormBody"),
            tone: "danger",
          });
          return;
        }
        setSent(true);
      }}
      className="flex flex-col gap-6"
    >
      <Field label={t("contactForm.name")} error={errors.name}>
        {(p) => (
          <Input
            {...p}
            autoComplete="name"
            value={values.name}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
          />
        )}
      </Field>

      <Field label={t("contactForm.email")} error={errors.email}>
        {(p) => (
          <Input
            {...p}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => setValues({ ...values, email: e.target.value })}
          />
        )}
      </Field>

      <Field label={t("contactForm.topic")}>
        {(p) => (
          <Select
            {...p}
            value={values.topic}
            onChange={(e) => setValues({ ...values, topic: e.target.value })}
          >
            <option value="registration">
              {t("contactForm.topicRegistration")}
            </option>
            <option value="refund">{t("contactForm.topicRefund")}</option>
            <option value="results">{t("contactForm.topicResults")}</option>
            <option value="organizer">
              {t("contactForm.topicOrganizer")}
            </option>
            <option value="other">{t("contactForm.topicOther")}</option>
          </Select>
        )}
      </Field>

      <Field label={t("contactForm.message")} error={errors.message}>
        {(p) => (
          <Textarea
            {...p}
            value={values.message}
            onChange={(e) => setValues({ ...values, message: e.target.value })}
            placeholder={t("contactForm.messagePlaceholder")}
          />
        )}
      </Field>

      <Button type="submit" size="xl" className="self-start">
        {t("contactForm.submit")}
      </Button>
    </form>
  );
}
