"use client";

import * as React from "react";
import { decideAccessRequestAction } from "./actions";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

// O servidor já exige review_notes quando decision="negado"
// (lib/validations/access-requests.ts). Aqui só evitamos que o aprovador
// confirme a recusa no diálogo e descubra o erro depois, num redirect à toa.
export function DecisionForm({ requestId }: { requestId: string }) {
  const [notes, setNotes] = React.useState("");
  const [notesError, setNotesError] = React.useState(false);
  const notesId = `notes-${requestId}`;

  return (
    <form action={decideAccessRequestAction} className="mt-4 space-y-3">
      <input type="hidden" name="request_id" value={requestId} />
      <Field
        label="Observações"
        htmlFor={notesId}
        hint="Obrigatório em caso de recusa"
        error={notesError ? "Informe o motivo da recusa antes de continuar." : undefined}
      >
        <Textarea
          id={notesId}
          name="review_notes"
          rows={2}
          value={notes}
          aria-invalid={notesError}
          onChange={(event) => {
            setNotes(event.target.value);
            if (event.target.value.trim().length > 0) setNotesError(false);
          }}
        />
      </Field>
      <div className="flex gap-2">
        <SubmitButton name="decision" value="aprovado" variant="primary" pendingLabel="Aprovando...">
          Aprovar
        </SubmitButton>
        <ConfirmSubmitButton
          name="decision"
          value="negado"
          variant="destructive"
          title="Recusar esta solicitação?"
          description="O solicitante será notificado e poderá ver o motivo informado no campo de observações."
          confirmLabel="Recusar solicitação"
          cancelLabel="Voltar"
          onClick={(event) => {
            if (notes.trim().length === 0) {
              event.preventDefault();
              setNotesError(true);
              document.getElementById(notesId)?.focus();
            }
          }}
        >
          Recusar
        </ConfirmSubmitButton>
      </div>
    </form>
  );
}
