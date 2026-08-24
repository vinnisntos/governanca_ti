"use client";

import * as React from "react";
import { createSupportTicketAction } from "./actions";
import { CATEGORY_LABELS } from "./labels";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";

const MESSAGE_MAX = 4000;

export function NewTicketForm() {
  const [message, setMessage] = React.useState("");

  return (
    <form action={createSupportTicketAction} className="space-y-4">
      <Field label="Categoria" htmlFor="category" required>
        <Select id="category" name="category" required defaultValue="outro">
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Assunto" htmlFor="subject" required hint="Um resumo curto do problema.">
        <Input id="subject" name="subject" required minLength={4} maxLength={150} placeholder="Ex.: Não consigo acessar o VPN" />
      </Field>

      <Field
        label="Descreva o problema"
        htmlFor="message"
        required
        hint={`Quanto mais detalhes, mais rápido o TI consegue ajudar. ${message.length}/${MESSAGE_MAX}`}
      >
        <Textarea
          id="message"
          name="message"
          required
          minLength={10}
          maxLength={MESSAGE_MAX}
          rows={5}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </Field>

      <div className="flex justify-end">
        <SubmitButton variant="primary" pendingLabel="Abrindo chamado...">
          Abrir chamado
        </SubmitButton>
      </div>
    </form>
  );
}
