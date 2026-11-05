"use client";

import { useId, type ComponentPropsWithRef } from "react";
import { Field, fieldControl, fieldDescription } from "./field";

export type InputProps = ComponentPropsWithRef<"input"> & { label: string; hint?: string; error?: string; wrapperClassName?: string };

/** Labeled native input with optional hint/error. @example <Input label="Search jobs" type="search" /> */
export function Input({ id, label, hint, error, className = "", wrapperClassName, "aria-describedby": describedBy, "aria-invalid": invalid, ...props }: InputProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <Field id={fieldId} label={label} hint={hint} error={error} className={wrapperClassName}>
      <input {...props} id={fieldId} aria-invalid={error ? true : invalid} aria-describedby={fieldDescription(fieldId, hint, error, describedBy)} className={`${fieldControl} ${className}`} />
    </Field>
  );
}
