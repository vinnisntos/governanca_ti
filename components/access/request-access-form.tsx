"use client";

import * as React from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { OTHER_SYSTEM_VALUE } from "@/lib/validations/access-requests";

export function RequestAccessForm({
  action,
  catalog,
}: {
  action: (formData: FormData) => void;
  catalog: { id: string; name: string }[];
}) {
  const [systemId, setSystemId] = React.useState("");
  const [justification, setJustification] = React.useState("");
  const JUSTIFICATION_MAX = 2000;

  return (
    <form action={action} className="space-y-4">
      <Field label="Sistema" htmlFor="system_id" required>
        <Select
          id="system_id"
          name="system_id"
          required
          value={systemId}
          onChange={(event) => setSystemId(event.target.value)}
        >
          <option value="" disabled>
            Selecione...
          </option>
          {catalog.map((system) => (
            <option key={system.id} value={system.id}>
              {system.name}
            </option>
          ))}
          <option value={OTHER_SYSTEM_VALUE}>Outro (fora do catálogo)</option>
        </Select>
      </Field>

      {systemId === OTHER_SYSTEM_VALUE ? (
        <Field
          label="Nome do sistema desejado"
          htmlFor="requested_system_name"
          required
          hint="O admin de TI vai avaliar e pode cadastrar o sistema no catálogo."
        >
          <Input
            id="requested_system_name"
            name="requested_system_name"
            required
            minLength={2}
            maxLength={120}
            placeholder="Ex.: Miro, Notion, ferramenta X"
          />
        </Field>
      ) : null}

      <Field
        label="Justificativa"
        htmlFor="justification"
        required
        hint={`Explique por que você precisa deste acesso (mínimo 10 caracteres). ${justification.length}/${JUSTIFICATION_MAX}`}
      >
        <Textarea
          id="justification"
          name="justification"
          required
          minLength={10}
          maxLength={JUSTIFICATION_MAX}
          rows={3}
          value={justification}
          onChange={(event) => setJustification(event.target.value)}
        />
      </Field>

      <div className="flex justify-end">
        <SubmitButton variant="primary" pendingLabel="Enviando...">
          Enviar solicitação
        </SubmitButton>
      </div>
    </form>
  );
}
