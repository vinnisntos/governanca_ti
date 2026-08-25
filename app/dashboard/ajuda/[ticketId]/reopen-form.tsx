"use client";

import * as React from "react";
import { reopenTicketAction } from "../actions";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";

const REASON_MAX = 2000;

export function ReopenForm({ ticketId }: { ticketId: string }) {
  const [reason, setReason] = React.useState("");

  return (
    <form action={reopenTicketAction} className="space-y-2">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <Field
        label="Motivo da reabertura"
        htmlFor="reason"
        hint={`${reason.length}/${REASON_MAX}`}
      >
        <Textarea
          id="reason"
          name="reason"
          rows={3}
          required
          minLength={10}
          maxLength={REASON_MAX}
          placeholder="Descreva por que o problema persiste..."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      <div className="flex justify-end">
        <SubmitButton variant="outline" size="sm" pendingLabel="Reabrindo...">
          Reabrir chamado
        </SubmitButton>
      </div>
    </form>
  );
}
